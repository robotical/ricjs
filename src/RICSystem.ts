/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import {
  RICSysModInfoWiFi,
  RICWifiConnState,
  RICWifiConnStatus,
} from "./RICWifiTypes";
import RICAddOnManager from "./RICAddOnManager";
import RICLog from "./RICLog";
import RICMsgHandler from "./RICMsgHandler";

import {
  RICConfiguredAddOns,
  RICCalibInfo,
  RICFileList,
  RICFriendlyName,
  RICHWElem,
  RICHWElemList_Str,
  RICOKFail,
  RICReportMsg,
  RICSysModInfoBLEMan,
  RICSystemInfo,
  RICWifiScanResults,
  RICHWElemList,
} from "./RICTypes";

export default class RICSystem {
  // Message handler
  private _ricMsgHandler: RICMsgHandler;

  // Add-on manager
  private _addOnManager: RICAddOnManager;

  // System info
  private _systemInfo: RICSystemInfo | null = null;

  // RIC naming
  private _ricFriendlyName: RICFriendlyName | null = null;

  // HWElems (connected to RIC) - excluding AddOns
  private _hwElemsExcludingAddOns: Array<RICHWElem> = new Array<RICHWElem>();
  private _connectedAddOns: Array<RICHWElem> = new Array<RICHWElem>();

  // Calibration info
  private _calibInfo: RICCalibInfo | null = null;

  // WiFi connection info
  private _ricWifiConnStatus: RICWifiConnStatus = new RICWifiConnStatus();
  private _defaultWiFiHostname = "Marty";
  private _maxSecsToWaitForWiFiConn = 20;

  /**
   * constructor
   * @param ricMsgHandler
   * @param addOnManager
   */
  constructor(ricMsgHandler: RICMsgHandler, addOnManager: RICAddOnManager) {
    this._ricMsgHandler = ricMsgHandler;
    this._addOnManager = addOnManager;
  }

  /**
   * getFriendlyName
   *
   * @returns friendly name
   */
  getFriendlyName(): RICFriendlyName | null {
    return this._ricFriendlyName;
  }

  /**
   * invalidate
   */
  invalidate() {
    // Invalidate system info
    this._systemInfo = null;
    this._hwElemsExcludingAddOns = new Array<RICHWElem>();
    this._connectedAddOns = new Array<RICHWElem>();
    this._addOnManager.clear();
    this._calibInfo = null;
    this._ricFriendlyName = null;
    RICLog.debug("RICSystem information invalidated");
  }

  /**
   *  getSystemInfo - get system info
   * @returns Promise<RICSystemInfo>
   *
   */
  async retrieveInfo(): Promise<boolean> {
    // Get HWElems (connected to RIC)
    try {
      await this.getHWElemList();
    } catch (error) {
      RICLog.warn("retrieveInfo - failed to get HWElems " + error);
      return false;
    }

    // Get system info
    RICLog.debug(`RICSystem retrieveInfo getting system info`);
    try {
      await this.getRICSystemInfo(true);
      RICLog.debug(
        `retrieveInfo - RIC Version ${this._systemInfo?.SystemVersion}`
      );
    } catch (error) {
      RICLog.warn("retrieveInfo - frailed to get version " + error);
      return false;
    }

    // Get RIC name
    try {
      await this.getRICName();
    } catch (error) {
      RICLog.warn("retrieveInfo - failed to get RIC name " + error);
      return false;
    }

    // Get calibration info
    try {
      await this.getRICCalibInfo(true);
    } catch (error) {
      RICLog.warn("retrieveInfo - failed to get calib info " + error);
      return false;
    }

    // Get WiFi connected info
    try {
      await this.getWiFiConnStatus();
    } catch (error) {
      RICLog.warn("retrieveInfo - failed to get WiFi Status " + error);
      return false;
    }

    // Get HWElems (connected to RIC)
    try {
      await this.getHWElemList();
    } catch (error) {
      RICLog.warn("retrieveInfo - failed to get HWElems " + error);
      return false;
    }
    return true;
  }

  /**
   *
   * getRICSystemInfo
   * @returns Promise<RICSystemInfo>
   *
   */
  async getRICSystemInfo(forceGetFromRIC = false): Promise<RICSystemInfo> {
    if (!forceGetFromRIC && this._systemInfo) {
      return this._systemInfo;
    }
    try {
      this._systemInfo = await this._ricMsgHandler.sendRICRESTURL<
        RICSystemInfo
      >("v");
      RICLog.debug(
        "getRICSystemInfo returned " + JSON.stringify(this._systemInfo)
      );
      this._systemInfo.validMs = Date.now();
      return this._systemInfo;
    } catch (error) {
      RICLog.debug(`getRICSystemInfo Failed to get version ${error}`);
      return new RICSystemInfo();
    }
  }
  // Mark: Calibration -----------------------------------------------------------------------------------------

  async calibrate(
    cmd: string,
    jointList: Array<string>,
    jointNames: { [key: string]: string },
    servoControllers: {[key: string]: string} = {
      "LeftHip": "LeftHip",
      "LeftTwist": "LeftHip",
      "LeftKnee": "LeftHip",
      "RightHip": "RightHip",
      "RightTwist": "RightHip",
      "RightKnee": "RightHip",
      "LeftArm": "LeftArm",
      "RightArm": "LeftArm",
      "Eyes": "LeftArm"
    }
  ) {
    let overallResult = true;
    if (cmd === "set") {
      const controllerArray: Array<string> = [];
      // Set calibration
      for (const jnt of jointList) {
        try {
          // Set calibration on joint
          const cmdUrl = "calibrate/set/" + jnt;
          const rsl = await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(
            cmdUrl
          );
          // saving the calibration... (For the new servo boards it is necessary
          // to send a "save" command after the calibration ones or any servo
          // parameter changes in order to save any changes made into nonvolatile storage)
          // log it now, and we'll do the saveparams commands once we've updated all the joints
          // the saveparams function is not instant as the flash write takes a few ms
          if (jnt in servoControllers && !controllerArray.includes(servoControllers[jnt]))
            controllerArray.push(servoControllers[jnt])
          if (rsl.rslt != "ok") overallResult = false;
        } catch (error) {
          console.log(`calibrate failed on joint ${jnt}`, error);
        }

        // Wait as writing to flash blocks servo access
        // as of v0.0.113 of firmware, the pause is no longer required
        //await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // on newer (batch4+) robots with stm32 servo controllers it is necessary to send a saveparams command once per servo controller
      for (const cID in controllerArray){
        const saveCalibCmd = `elem/${controllerArray[cID]}/saveparams`;
        const rslt = await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(saveCalibCmd);
        if (rslt.rslt != "ok") overallResult = false;
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // ensure all joints are enabled
      for (const jnt in jointNames) {
        try {
          // enable joint
          const cmdUrl = "servo/" + jnt + "/enable/1";
          const rsl = await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(
            cmdUrl
          );
          if (rsl.rslt != "ok") overallResult = false;
        } catch (error) {
          console.log(`enable failed on joint ${jnt}`, error);
        }
      }

      // Result
      console.log("Set calibration flag to true");
      const rslt = new RICOKFail();
      rslt.set(overallResult);
      return rslt;
    }
    return false;
  }

  /**
   *
   * getRICCalibInfo
   * @returns Promise<RICCalibInfo>
   *
   */
  async getRICCalibInfo(forceGetFromRIC = false): Promise<RICCalibInfo> {
    if (!forceGetFromRIC && this._calibInfo) {
      return this._calibInfo;
    }
    try {
      this._calibInfo = await this._ricMsgHandler.sendRICRESTURL<RICCalibInfo>(
        "calibrate"
      );
      RICLog.debug("getRICCalibInfo returned " + this._calibInfo);
      this._calibInfo.validMs = Date.now();
      return this._calibInfo;
    } catch (error) {
      RICLog.debug(`getRICCalibInfo Failed to get version ${error}`);
      return new RICCalibInfo();
    }
  }

  /**
   *
   * setRICName
   * @param newName name to refer to RIC - used for BLE advertising
   * @returns Promise<boolean> true if successful
   *
   */
  async setRICName(newName: string): Promise<boolean> {
    try {
      this._ricFriendlyName = await this._ricMsgHandler.sendRICRESTURL<
        RICFriendlyName
      >(`friendlyname/${newName}`);
      if (this._ricFriendlyName) {
        this._ricFriendlyName.friendlyNameIsSet = false;
        this._ricFriendlyName.validMs = Date.now();
        if (
          this._ricFriendlyName &&
          this._ricFriendlyName.rslt &&
          this._ricFriendlyName.rslt.toLowerCase() === "ok"
        ) {
          this._ricFriendlyName.friendlyNameIsSet = true;
        }
        RICLog.debug(
          "setRICName returned " + JSON.stringify(this._ricFriendlyName)
        );
        return true;
      }
      return true;
    } catch (error) {
      this._ricFriendlyName = null;
      return false;
    }
  }

  /**
   *
   * getRICName
   * @returns Promise<RICNameResponse> (object containing rslt)
   *
   */
  async getRICName(): Promise<RICFriendlyName> {
    try {
      this._ricFriendlyName = await this._ricMsgHandler.sendRICRESTURL<
        RICFriendlyName
      >("friendlyname");
      if (
        this._ricFriendlyName &&
        this._ricFriendlyName.rslt &&
        this._ricFriendlyName.rslt === "ok"
      ) {
        this._ricFriendlyName.friendlyNameIsSet = this._ricFriendlyName
          .friendlyNameIsSet
          ? true
          : false;
      } else {
        this._ricFriendlyName.friendlyNameIsSet = false;
      }
      this._ricFriendlyName.validMs = Date.now();
      RICLog.debug(
        "Friendly name set is: " + JSON.stringify(this._ricFriendlyName)
      );
      return this._ricFriendlyName;
    } catch (error) {
      return new RICFriendlyName();
    }
  }

  /**
   *
   * getHWElemList - get the list of hardware elements connected to the robot
   *               - the result (if successful) is processed as follows:
   *                       = if no filter is applied then all non-add-ons found are stored in
   *                         this._hwElemsExcludingAddOns and all addons are stored in this._connectedAddOns
   *                       = if a filter is applied and this filter is RSAddOns then this._connectedAddOns is
   *                         updated with the new list of addons
   *                       = in all cases the discovered list is returned
   *
   * @returns Promise<RICHWElemList>
   *
   */

  async getHWElemList(filterByType?: string): Promise<Array<RICHWElem>> {
    // Form a list of the requests to make
    const reqList: Array<string> = [];
    let addToNonAddOnsList = false;
    if (!filterByType) {
      reqList.push("SmartServo");
      reqList.push("RSAddOn");
      reqList.push("BusPixels");
      reqList.push("!SmartServo,RSAddOn,BusPixels"); // not SmartServo or RSAddOn or BusPixels
      this._hwElemsExcludingAddOns = new Array<RICHWElem>();
      addToNonAddOnsList = true;
    } else if (filterByType === "RSAddOn") {
      // we treat BusPixels as an RSAddOn
      // (batch 4 led eye add-ons have type BusPixels)
      reqList.push("RSAddOn");
      reqList.push("BusPixels");
      this._connectedAddOns = new Array<RICHWElem>();
    } else {
      reqList.push(filterByType);
    }

    // Make the requests
    const fullListOfElems = new Array<RICHWElem>();
    this._connectedAddOns = [];
    for (const reqType of reqList) {
      try {
        const hwElemList_Str = await this._ricMsgHandler.sendRICRESTURL<
          RICHWElemList_Str
        >(`hwstatus/strstat?filterByType=${reqType}`);
        // if the results of hwElem indicates that we are on an older fw version
        // send the old hwstatus command and don't expand()
        // the logic behind deciding if we are on a fw version that
        // supports strstat is: given that hwElemList_Str.hw === object[]
        // if we get back string[], then we know we are on an older version
        // if hw === empty array, then we don't have any hw elems in which
        // case we can stop at that point
        const hwElems = hwElemList_Str.hw;
        let hwElemList;
        if (hwElems.length) {
          if (typeof hwElems[0] !== "object") {
            // we are on an older version
            hwElemList = await this._ricMsgHandler.sendRICRESTURL<
              RICHWElemList
            >(`hwstatus?filterByType=${reqType}`);
          } else {
            // we are on the fw version that supports strstat
            hwElemList = RICHWElemList_Str.expand(hwElemList_Str);
          }
        }
        if (hwElemList && hwElemList.rslt && hwElemList.rslt === "ok") {
          fullListOfElems.push(...hwElemList.hw);
          if (reqType === "RSAddOn") {
            this._connectedAddOns = hwElemList.hw;
            this._addOnManager.setHWElems(this._connectedAddOns);
            // Debug
            RICLog.debug(
              `getHWElemList: found ${hwElemList.hw.length} addons/buspixels`
            );
          } else if (reqType === "BusPixels") {
          // BusPixels are treated as an RSAddOn
            this._connectedAddOns.push(...hwElemList.hw);
            this._addOnManager.setHWElems(this._connectedAddOns);
            // Debug
            RICLog.debug(
              `getHWElemList: found ${hwElemList.hw.length} addons/buspixels`
            );
          } else if (addToNonAddOnsList) {
            this._hwElemsExcludingAddOns.push(...hwElemList.hw);
            // Debug
            RICLog.debug(
              `getHWElemList: found ${hwElemList.hw.length} elems matching ${reqType}`
            );
          }
        }
      } catch (error) {
        RICLog.debug(`getHWElemList failed to get ${reqType} ${error}`);
        return new Array<RICHWElem>();
      }
    }

    // Handle any callbacks
    try {
      const reports: Array<RICReportMsg> = [];
      // add callback to subscribe to report messages
      this._ricMsgHandler.reportMsgCallbacksSet("getHWElemCB", function (
        report: RICReportMsg
      ) {
        reports.push(report);
        RICLog.debug(`getHWElemCB Report callback ${JSON.stringify(report)}`);
      });

      // run any required initialisation for the addons
      const initCmds = this._addOnManager.getInitCmds();
      // send init commands to the robot
      const timeInitStart = Date.now();
      for (let i = 0; i < initCmds.length; i++) {
        this.runCommand(initCmds[i], {});
      }
      // wait a couple of seconds for any report messages to be received
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // pass report messages to add on manager for processing
      this._addOnManager.processReportMsg(reports, timeInitStart);

      // clean up callback
      this._ricMsgHandler.reportMsgCallbacksDelete("getHWElemCB");
    } catch (error) {
      RICLog.debug(`getHWElemList failed processing callback reports ${error}`);
      return new Array<RICHWElem>();
    }

    // return the full list of elements
    return fullListOfElems;
  }

  /**
   *
   * getAddOnConfigs - get list of add-ons configured on the robot
   * @returns Promise<RICConfiguredAddOns>
   *
   */
  async getAddOnConfigs(): Promise<RICConfiguredAddOns> {
    try {
      const addOnList = await this._ricMsgHandler.sendRICRESTURL<
        RICConfiguredAddOns
      >("addon/list");
      RICLog.debug("getAddOnConfigs returned " + addOnList);
      return addOnList;
    } catch (error) {
      RICLog.debug(`getAddOnConfigs Failed to get list of add-ons ${error}`);
      return new RICConfiguredAddOns();
    }
  }

  /**
   *
   * getFileList - get list of files on file system
   * @returns Promise<RICFileList>
   *
   */
  async getFileList(): Promise<RICFileList> {
    try {
      const ricFileList = await this._ricMsgHandler.sendRICRESTURL<RICFileList>(
        "filelist"
      );
      RICLog.debug("getFileList returned " + ricFileList);
      return ricFileList;
    } catch (error) {
      RICLog.debug(`getFileList Failed to get file list ${error}`);
      return new RICFileList();
    }
  }

  /**
   *
   * runCommand
   * @param commandName command API string
   * @param params parameters (simple name value pairs only) to parameterize trajectory
   * @returns Promise<RICOKFail>
   *
   */
  async runCommand(commandName: string, params: object): Promise<RICOKFail> {
    try {
      // Format the paramList as query string
      const paramEntries = Object.entries(params);
      let paramQueryStr = "";
      for (const param of paramEntries) {
        if (paramQueryStr.length > 0) paramQueryStr += "&";
        paramQueryStr += param[0] + "=" + param[1];
      }
      // Format the url to send
      if (paramQueryStr.length > 0) commandName += "?" + paramQueryStr;
      return await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(commandName);
    } catch (error) {
      RICLog.debug(`runCommand failed ${error}`);
      return new RICOKFail();
    }
  }

  /**
   *
   * Get BLEMan sysmod info
   *
   * @returns RICSysModInfoBLEMan
   *
   */
  async getSysModInfoBLEMan(): Promise<RICSysModInfoBLEMan | null> {
    try {
      // Get SysMod Info
      const bleInfo = await this._ricMsgHandler.sendRICRESTURL<
        RICSysModInfoBLEMan
      >("sysmodinfo/BLEMan");

      // Debug
      RICLog.debug(
        `getSysModInfoBLEMan rslt ${bleInfo.rslt} isConn ${bleInfo.isConn} paused ${bleInfo.isAdv} txBPS ${bleInfo.txBPS} rxBPS ${bleInfo.rxBPS}`
      );

      // Check for test rate
      if ("tBPS" in bleInfo) {
        RICLog.debug(
          `getSysModInfoBLEMan testMsgs ${bleInfo.tM} testBytes ${bleInfo.tB} testRateBytesPS ${bleInfo.tBPS}`
        );
      }

      return bleInfo;
    } catch (error) {
      RICLog.debug(`getSysModInfoBLEMan sysmodinfo/BLEMan failed ${error}`);
    }
    return null;
  }

  /**
   * Get hostname of connected WiFi
   *
   *  @return string - hostname of connected WiFi
   *
   */
  _getHostnameFromFriendlyName(): string {
    const friendlyName = this.getFriendlyName();
    if (!friendlyName) {
      return this._defaultWiFiHostname;
    }
    let hostname = friendlyName.friendlyName;
    hostname = hostname?.replace(/ /g, "-");
    hostname = hostname.replace(/\W+/g, "");
    return hostname;
  }

  /**
   * Get Wifi connection status
   *
   *  @return boolean - true if connected
   *
   */
  async getWiFiConnStatus(): Promise<boolean | null> {
    try {
      // Get status
      const ricSysModInfoWiFi = await this._ricMsgHandler.sendRICRESTURL<
        RICSysModInfoWiFi
      >("sysmodinfo/NetMan");

      RICLog.debug(
        `wifiConnStatus rslt ${ricSysModInfoWiFi.rslt} isConn ${ricSysModInfoWiFi.isConn} paused ${ricSysModInfoWiFi.isPaused}`
      );

      // Check status indicates WiFi connected
      if (ricSysModInfoWiFi.rslt === "ok") {
        this._ricWifiConnStatus.connState =
          ricSysModInfoWiFi.isConn !== 0
            ? RICWifiConnState.WIFI_CONN_CONNECTED
            : RICWifiConnState.WIFI_CONN_NONE;
        this._ricWifiConnStatus.isPaused = ricSysModInfoWiFi.isPaused !== 0;
        this._ricWifiConnStatus.ipAddress = ricSysModInfoWiFi.IP;
        this._ricWifiConnStatus.hostname = ricSysModInfoWiFi.Hostname;
        this._ricWifiConnStatus.ssid = ricSysModInfoWiFi.SSID;
        this._ricWifiConnStatus.bssid = ricSysModInfoWiFi.WiFiMAC;
        this._ricWifiConnStatus.validMs = Date.now();
        return (
          ricSysModInfoWiFi.isConn !== 0 || ricSysModInfoWiFi.isPaused !== 0
        );
      }
    } catch (error) {
      RICLog.debug(`[DEBUG]: wifiConnStatus sysmodinfo failed ${error}`);
      this._ricWifiConnStatus.validMs = 0;
    }
    this._ricWifiConnStatus.connState = RICWifiConnState.WIFI_CONN_NONE;
    this._ricWifiConnStatus.isPaused = false;
    return null;
  }

  // Mark: WiFi Connection ------------------------------------------------------------------------------------

  /**
   * pause Wifi connection
   *
   *  @param boolean - true to pause, false to resume
   *  @return boolean - true if successful
   *
   */
  async pauseWifiConnection(pause: boolean): Promise<boolean> {
    try {
      if (pause) {
        await this._ricMsgHandler.sendRICRESTURL<RICOKFail>("wifipause/pause");
      } else {
        await this._ricMsgHandler.sendRICRESTURL<RICOKFail>("wifipause/resume");
      }
    } catch (error) {
      RICLog.debug(`wifiConnect wifi pause ${error}`);
      return true;
    }
    return false;
  }

  /**
   * Connect to WiFi
   *
   *  @param string - WiFi SSID
   *  @param string - WiFi password
   *  @return boolean - true if successful
   *
   */
  async wifiConnect(ssid: string, password: string): Promise<boolean> {
    RICLog.debug(`Connect to WiFi ${ssid} password ${password}`);

    // Issue the command to connect WiFi
    try {
      const RICRESTURL_wifiCredentials =
        "w/" +
        ssid +
        "/" +
        password +
        "/" +
        this._getHostnameFromFriendlyName();
      RICLog.debug(
        `wifiConnect attempting to connect to wifi ${RICRESTURL_wifiCredentials}`
      );

      await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(
        RICRESTURL_wifiCredentials
      );
    } catch (error) {
      RICLog.debug(`wifiConnect failed ${error}`);
      return false;
    }

    // Wait until connected, timed-out or failed
    for (
      let timeoutCount = 0;
      timeoutCount < this._maxSecsToWaitForWiFiConn;
      timeoutCount++
    ) {
      // Wait a little before checking
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get status info
      const connStat = await this.getWiFiConnStatus();
      RICLog.debug(`wifiConnect connStat ${connStat}`);
      if (connStat) {
        return true;
      }
    }
    return false;
  }

  /**
   * Disconnect WiFi
   *
   *  @return boolean - true if successful
   *
   */
  async wifiDisconnect(): Promise<boolean> {
    try {
      RICLog.debug(`wifiDisconnect clearing wifi info`);

      await this._ricMsgHandler.sendRICRESTURL<RICOKFail>("wc");
      this.getWiFiConnStatus();
      return true;
    } catch (error) {
      RICLog.debug(`wifiDisconnect clearing unsuccessful`);
    }
    return false;
  }

  // Mark: WiFi Scan ------------------------------------------------------------------------------------

  /**
   *  WiFiScan start
   *
   *  @return boolean - true if successful
   *
   */
  async wifiScanStart(): Promise<boolean> {
    try {
      RICLog.debug(`wifiScanStart`);
      await this._ricMsgHandler.sendRICRESTURL<RICOKFail>("wifiscan/start");
      return true;
    } catch (error) {
      RICLog.debug(`wifiScanStart unsuccessful`);
    }
    return false;
  }
  /**
   *  WiFiScan get results
   *
   *  @return boolean - false if unsuccessful, otherwise the results of the promise
   *
   */
  async wifiScanResults(): Promise<boolean | RICOKFail | RICWifiScanResults> {
    try {
      RICLog.debug(`wifiScanResults`);
      return this._ricMsgHandler.sendRICRESTURL<RICOKFail | RICWifiScanResults>(
        "wifiscan/results"
      );
    } catch (error) {
      RICLog.debug(`wifiScanResults unsuccessful`);
    }
    return false;
  }

  getCachedSystemInfo(): RICSystemInfo | null {
    return this._systemInfo;
  }

  getCachedAddOnList(): Array<RICHWElem> {
    return this._connectedAddOns;
  }

  getCachedAllHWElems(): Array<RICHWElem> {
    const allHWElems = new Array<RICHWElem>();
    allHWElems.push(...this._connectedAddOns);
    allHWElems.push(...this._hwElemsExcludingAddOns);
    return allHWElems;
  }

  getCachedCalibInfo(): RICCalibInfo | null {
    return this._calibInfo;
  }

  getCachedRICName(): RICFriendlyName | null {
    return this._ricFriendlyName;
  }

  getCachedWifiStatus(): RICWifiConnStatus {
    return this._ricWifiConnStatus;
  }
}
