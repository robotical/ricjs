/* 
    Steps of the update smart servo process.
    Note that due to the asynchronous nature of the i2c reports,
    the steps order is not exactly the same as in RoboticalMartyV2-OTC repo.

    Steps: 
        1. fetching data from aws
            1.1 extracting the information of interest
        2. when a robot is connected and the data are here
            2.1 we attach a callback to the reportMsgCallbacks, which is responsible for applying the new configs
                2.1.1 we also set a timer of 2 seconds, allowing enough time for all the reports to come through and be processed. After 2 seconds, we remove this callback and set another one, responsible for confirming our changes.
            2.2 we get servoInfos by sending a hwstatus?filterByType=SmartServo request
                2.2.1 for every servo, we convert the whoAmITypeCode hex to int
            2.3 for every servo, we request a report using `elem/${servoName}/json?cmd=raw&hexWr=${dataToWrite}&numToRd=${numBytesToRead}&msgKey=${msgKey}`

            ------ The first asynchronous gap happens here -----------
            Essentially, we wait until our requests are heard by the robot. Once heard, the robot will send back the reports

        3. (in processReport_applyConfig) -- processing incoming reports
            3.1 we get the targetConfig stored in the ServoSettings.json
            3.2 we get the currentConfig stored in the servo
                3.2.1 lots of low-leve byte manipulation happen here (vertile ground for bugs)
            3.3 once we have both the target and current configs, we apply the target configs
                3.3.1 we apply the target config only if the currentConfig value is different than the target value
                    3.3.1.1 to apply the config, we send a request: `elem/${servoName}/${paramKey}/${targetValue}`
                3.3.2 we also store the applied config, so to be able to use it later on for confirmation purposes (see 4.)

        ------ The second asynchronous gap should happen around here -----------
            Once the applying-config phase is through, we need to confirm whether we did a good job
            At this point we should have already attached a confirmation cb (see 2.1.1)
            
        4. (in processReport_confirmConfig) --- processing incoming reports
            4.1 we fetch the stored applied config (see 3.3.2), and compare it to the most recent current config
*/
import { RICHWElem, RICHWElemList, RICOKFail } from "./RICTypes";
import { Buffer } from "buffer";
import RICMsgHandler from "./RICMsgHandler";

const UPDATES_URL_BASE = "https://updates.robotical.io";
const UPDATE_CHANNEL = "live";

//////////////////// T Y P E S ///////////////////////////
type ServoSettingsJSONType = {
  eepromLayout: EepromLayoutType;
  settings: ServoSettingsType;
};
type EepromLayoutType = { [key: string]: { address: number; size: number } };
type ServoSettingsType = { [key: string]: VariantType[] };
type SettingsFilters = {
  servos: string[];
  DTIDs: number[];
  fwVersions: string[];
};
type VariantType = { filters: SettingsFilters; value: number };
type ConfigType = { [key: string]: number };
//////////////////////////////////////////////////////
class ServoParamUpdate {
  public static instance: ServoParamUpdate | null = null;

  private _eepromLayout: EepromLayoutType = {};
  private _servoSettings: ServoSettingsType = {};

  private _eepromCfgStartAddr = 0;
  public eepromCfgEndAddr = 0;
  private _eepromCfgSize = 0;

  private msgKeyCounter = 1;

  // Setting up two flags (dataArrived and robotConnected) which should both be
  // true, for the update process to start
  private _dataArrived = false;
  private _robotConnected = false;

  private servos: RICHWElem[] = [];

  private changedConfigs: { servoName: string; config: ConfigType }[] = [];

  private ricMsgHandler: RICMsgHandler;

  constructor(ricMsgHandler: RICMsgHandler) {
    this.ricMsgHandler = ricMsgHandler;
  }

  static getSingletonInstance(
    ricMsgHandler?: RICMsgHandler
  ): ServoParamUpdate | undefined {
    if (ServoParamUpdate.instance) {
      return ServoParamUpdate.instance;
    } else {
      try {
        if (!ricMsgHandler)
          throw new Error(
            "ServoParamUpdate Singleton instance has been initialised without a RICMsgHandler"
          );
        const instance = new ServoParamUpdate(ricMsgHandler);
        ServoParamUpdate.instance = instance;
        return instance;
      } catch (e: any) {
        throw new Error(e);
      }
    }
  }

  async init() {
    // fetch servo settings from AWS
    const url = `${UPDATES_URL_BASE}/${UPDATE_CHANNEL}/SmartServo/ServoSettings.json`;
    console.log(`Downloading servo configs from ${url}`);

    try {
      // fetching data from aws. if successfull, we set data flag
      const servoUpdatesResponse = await fetch(url);
      const servoConfigs: ServoSettingsJSONType = await servoUpdatesResponse.json();
      this._eepromLayout = servoConfigs.eepromLayout;
      this._servoSettings = servoConfigs.settings;
      // Calculate the "interesting" address range of a smart servo EEPROM
      let minAddress = Number.MAX_VALUE;
      let maxAddressPlusSize = Number.MIN_VALUE;
      for (const key in this._eepromLayout) {
        if (Object.prototype.hasOwnProperty.call(this._eepromLayout, key)) {
          const loc = this._eepromLayout[key];
          if (loc.address < minAddress) minAddress = loc.address;
          if (loc.address + loc.size > maxAddressPlusSize)
            maxAddressPlusSize = loc.address + loc.size;
        }
      }
      this._eepromCfgStartAddr = minAddress;
      this.eepromCfgEndAddr = maxAddressPlusSize;
      this._eepromCfgSize = this.eepromCfgEndAddr - this._eepromCfgStartAddr;

      this.setDataArrivedTrue();
    } catch (e) {
      console.log(e);
    }
  }

  ////////// REPORT CALLBACKS LOGIC ////////////////////
  /*
    The logic here is a bit messy because of the way i2c reports work.
    Initially, we attach a callback to the reportMsgCallbacks, which
    is responsible for applying the new configs. Then, after waiting for
    2 seconds and making sure all configs have been applied, we remove the
    above callback, and attaching a new one -- one that is responsible
    for confirming that the new configs have been applied correctly. 
    Again, after 2 seconds we remove the confirmation callback.
  */

  attachConfirmationConfigReportCallback() {
    // Attaching a report callback
    this.ricMsgHandler.reportMsgCallbacksSet(
      `ConfirmServoUpdatesReportsCB`,
      (report) => this.processReport_confirmConfig(report)
    );
    // timeout until we remove the confirmConfig callback and
    const confirmConfigRemovalCb = setTimeout(() => {
      this.detachConfirmConfigReportCallback();
      clearTimeout(confirmConfigRemovalCb);
    }, 2000);
  }

  attachApplyConfigReportCallback() {
    // Attaching a report callback
    this.ricMsgHandler.reportMsgCallbacksSet(
      `ServoUpdatesReportsCB`,
      (report) => this.processReport_applyConfig(report)
    );
    // timeout until we remove the applyConfig callback and add
    // the confirmation callback
    const applyConfigRemovalCb = setTimeout(() => {
      console.log("CLEARING APPLY CONFIG CB");
      this.detachApplyConfigReportCallback();
      //   this.attachConfirmationConfigReportCallback();
      //   for (const servo of this.servos) {
      //     this.requestingServoReport(servo.name);
      //   }
      clearTimeout(applyConfigRemovalCb);
    }, 4000);
  }

  detachApplyConfigReportCallback() {
    this.ricMsgHandler.reportMsgCallbacksDelete("ServoUpdatesReportsCB");
  }

  detachConfirmConfigReportCallback() {
    this.ricMsgHandler.reportMsgCallbacksDelete("ConfirmServoUpdatesReportsCB");
  }
  //------- END REPORT CALLBACKS LOGIC --------------

  setDataArrivedTrue() {
    this._dataArrived = true;
    this.startUpdateProcess();
  }

  setRobotConnected(connected: boolean) {
    this._robotConnected = connected;
    if (connected) this.startUpdateProcess();
  }

  ////////////// BEFORE GETTING REPORTS ////////////////////
  async startUpdateProcess() {
    // checking if both flags (data and robot) are true
    if (!this._dataArrived || !this._robotConnected) return;
    console.log("starting servo update process");
    this.attachApplyConfigReportCallback();
    this.servos = await this.getServoInfos();
    for (const servo of this.servos) {
      this.requestingServoReport(servo.name);
    }
  }

  async getServoInfos() {
    // getting servo infos
    const ricHWList = await this.ricMsgHandler.sendRICRESTURL<RICHWElemList>(
      "hwstatus?filterByType=SmartServo"
    );
    if (!Object.prototype.hasOwnProperty.call(ricHWList, "hw")) return [];
    const servos = ricHWList.hw;
    console.log("servos", servos);
    for (const servo of servos) {
      servo.whoAmITypeCode = parseInt(servo.whoAmITypeCode, 16).toString();
    }
    return servos;
  }

  async requestingServoReport(servoName: string) {
    const intToBytes = this.intToByteArray(this._eepromCfgStartAddr);
    const reqBytes = Buffer.from([0x10, ...intToBytes]); // 04
    this.addOnQuery(servoName, reqBytes.toString("hex"), this._eepromCfgSize);
  }

  async addOnQuery(
    servoName: string,
    dataToWrite: string,
    numBytesToRead: number,
    numAttempts = 3
  ) {
    while (numAttempts > 0) {
      const msgKey = this.msgKeyCounter;
      this.msgKeyCounter++;
      const ricRestCmd = `elem/${servoName}/json?cmd=raw&hexWr=${dataToWrite}&numToRd=${numBytesToRead}&msgKey=${msgKey}`;
      console.log(ricRestCmd, "ServoParamUpdate.ts", "line: ", "222");
      const response = await this.ricMsgHandler.sendRICRESTURL<RICOKFail>(
        ricRestCmd
      );
      if (response.rslt === "ok") {
        return true;
      }
      numAttempts--;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  }

  //------------- END BEFORE GETTING REPORTS -------------

  ////////////// After getting reports ////////////////////
  async processReport_applyConfig(report: any) {
    console.log("received report", report);
    const servoName = report.elemName;
    const servoInfo = this.servos.filter(
      (servo) => servo.name === servoName
    )[0];
    const targetConfig = this.getTargetConfigForServo(servoInfo);
    const currentConfig = this.readServoConfig(report);
    await this.applyConfig(servoName, targetConfig, currentConfig);
  }

  getTargetConfigForServo(servoInfo: RICHWElem): ConfigType {
    const config: ConfigType = {};
    for (const settingKey in this._servoSettings) {
      if (
        Object.prototype.hasOwnProperty.call(this._servoSettings, settingKey)
      ) {
        const variants: VariantType[] = this._servoSettings[settingKey];
        for (const variant of variants) {
          const filters: SettingsFilters = variant.filters;
          if (!filters.servos.includes(servoInfo.name)) continue;
          if (!filters.DTIDs.includes(+servoInfo.whoAmITypeCode)) continue;
          if (!filters.fwVersions.includes(servoInfo.versionStr)) continue;
          config[settingKey] = variant.value;
        }
      }
    }
    return config;
  }

  readServoConfig(servoReport: any): ConfigType {
    const data = servoReport["hexRd"];
    if (
      data &&
      data.length > 0 &&
      typeof data === "string" &&
      data.length % 2 === 0
    ) {
      const rawData = this.hexToBytes(data);
      if (!rawData) return {};
      const config: ConfigType = {};
      for (const locationKey in this._eepromLayout) {
        if (
          Object.prototype.hasOwnProperty.call(this._eepromLayout, locationKey)
        ) {
          const location = this._eepromLayout[locationKey];
          const startOffset = location.address - this._eepromCfgStartAddr;
          const endOffset = startOffset + location.size;

          config[locationKey] = this.byteArrayToInt(
            rawData.slice(startOffset, endOffset)
          );
        }
      }
      return config;
    }
    return {};
  }

  async applyConfig(
    servoName: string,
    targetConfig: ConfigType,
    currentConfig: ConfigType,
    numAttempts = 3
  ) {
    while (numAttempts > 0) {
      const badSettings = [];
      for (const paramKey in targetConfig) {
        if (Object.prototype.hasOwnProperty.call(targetConfig, paramKey)) {
          const targetValue = targetConfig[paramKey];
          if (currentConfig[paramKey] != targetValue) {
            badSettings.push(paramKey);
            console.log(
              `Setting ${servoName} ${paramKey} to ${targetValue} (was ${currentConfig[paramKey]})`
            );
            const ricRestCmd = `elem/${servoName}/${paramKey}/${targetValue}`;
            await this.ricMsgHandler.sendRICRESTURL<RICOKFail>(
              ricRestCmd
            );
          }
        }
      }
      // store config
      this.changedConfigs.push({ servoName, config: targetConfig });
      if (badSettings.length === 0) return true;
      numAttempts--;
    }
    return false;
  }

  async processReport_confirmConfig(report: any) {
    const servoName = report.elemName;
    const shouldBeConfig = this.changedConfigs.filter(
      (config) => config.servoName === servoName
    )[0];
    const currentConfig = this.readServoConfig(report);
    // compare currentConfig with shouldBeConfig
  }
  //--------------- After getting reports ---------------

  /////////////// BYTE MANIPULATION HELPERS /////////////////////
  byteArrayToInt(byteArray: number[]) {
    try {
      const bytes = new Uint8Array(byteArray);
      const dv = new DataView(bytes.buffer);
      const uint = dv.getInt16(0, /* little endian data */ false);
      return uint;
    } catch (e) {
      if (byteArray.length > 0) {
        return byteArray[0];
      }
      return 0;
    }
  }

  intToByteArray(int: number, bytesLen = 2, litteEndian = false) {
    const arr = new ArrayBuffer(bytesLen);
    const view = new DataView(arr);
    view.setUint16(0, int, litteEndian); // byteOffset = 0; litteEndian = false
    return new Int8Array(arr);
  }

  hexToBytes(hex: string) {
    const bytes = [];
    for (let c = 0; c < hex.length; c += 2)
      bytes.push(parseInt(hex.substr(c, 2), 16));
    return bytes;
  }
  //--------- END BYTE MANIPULATION HELPERS ---------
}

export default ServoParamUpdate;
