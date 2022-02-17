/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICMsgTrackInfo
// Communications Connector for RIC V2
//
// RIC V2
// Rob Dobson & Chris Greening 2020
// (C) Robotical 2020
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import { RICSysModInfoWiFi, RICWifiConnState, RICWifiConnStatus } from './RICWifiTypes';
import { RICAddOnManager } from "./RICAddOnManager";
import { RICLog } from "./RICLog"
import { RICMsgHandler } from "./RICMsgHandler";
import { RICAddOnList, RICCalibInfo, RICFileList, RICFriendlyName, RICHWElem, RICHWElemList, RICNameResponse, RICOKFail, RICReportMsg, RICSysModInfoBLEMan, RICSystemInfo } from "./RICTypes";

export class RICSystem {

  // Message handler
  _ricMsgHandler: RICMsgHandler;

  // Add-on manager
  _addOnManager: RICAddOnManager;

  // System info
  _systemInfo: RICSystemInfo | null = null;

  // RIC friendly name
  _ricFriendlyName: string | null = null;
  _ricFriendlyNameIsSet = false;

  // HWElems (connected to RIC)
  _hwElems: Array<RICHWElem> = new Array<RICHWElem>();

  // Calibration info
  _calibInfo: RICCalibInfo | null = null;

  // WiFi connection info
  _ricWifiConnStatus: RICWifiConnStatus = new RICWifiConnStatus();
  _defaultWiFiHostname = 'Marty';
  _maxSecsToWaitForWiFiConn = 20;

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
  getFriendlyName(): string | null {
    return this._ricFriendlyName;
  }

  /**
   * invalidate
   */
  invalidate() {
    this._systemInfo = null;
    this._hwElems = new Array<RICHWElem>();
    this._addOnManager.clear();
    this._calibInfo = null;
    this._ricFriendlyName = null;
    this._ricFriendlyNameIsSet = false;
  }

  /**
   *  getSystemInfo - get system info
   * @returns Promise<RICSystemInfo>
   *  
   */
  async retrieveInfo(): Promise<boolean> {

    // Get system info
    RICLog.debug(`RICSystem retrieveInfo getting system info`);
    try {
      await this.getRICSystemInfo(true);
      RICLog.debug(
        `retrieveInfo - RIC Version ${this._systemInfo?.SystemVersion}`,
      );
    } catch (error) {
      RICLog.warn('retrieveInfo - frailed to get version ' + error);
      return false;
    }

    // Get RIC name
    try {
      await this.getRICName();
    } catch (error) {
      RICLog.warn('retrieveInfo - failed to get RIC name ' + error);
      return false;
    }

    // Get calibration info
    try {
      await this.getRICCalibInfo(true);
    } catch (error) {
      RICLog.warn('retrieveInfo - failed to get calib info ' + error);
      return false;
    }

    // Get HWElems (connected to RIC)
    try {
      await this.getHWElemList();
    } catch (error) {
      RICLog.warn('retrieveInfo - failed to get HWElems ' + error);
      return false;
    }

    // Get WiFi connected info
    try {
      await this.getWiFiConnStatus();
    } catch (error) {
      RICLog.warn('retrieveInfo - failed to get WiFi Status ' + error);
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
      >('v', true);
      RICLog.debug('getRICSystemInfo returned ' + JSON.stringify(this._systemInfo));
      return this._systemInfo;
    } catch (error) {
      RICLog.debug(`getRICSystemInfo Failed to get version ${error}`);
      return new RICSystemInfo();
    }
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
      this._calibInfo = await this._ricMsgHandler.sendRICRESTURL<
        RICCalibInfo
      >('calibrate', true);
      RICLog.debug('getRICCalibInfo returned ' + this._calibInfo);
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
      const msgRsltJsonObj = await this._ricMsgHandler.sendRICRESTURL<
        RICFriendlyName
      >(`friendlyname/${newName}`, true);

      const nameThatHasBeenSet = msgRsltJsonObj.friendlyName;
      this._ricFriendlyName = nameThatHasBeenSet;
      this._ricFriendlyNameIsSet = true;
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   *
   * getRICName
   * @returns Promise<RICNameResponse> (object containing rslt)
   *
   */
  async getRICName(): Promise<RICNameResponse> {
    try {
      const msgRsltJsonObj = await this._ricMsgHandler.sendRICRESTURL<
        RICNameResponse
      >('friendlyname', true);
      if (msgRsltJsonObj.rslt === 'ok') {
        this._ricFriendlyName = msgRsltJsonObj.friendlyName;
        this._ricFriendlyNameIsSet = msgRsltJsonObj.friendlyNameIsSet != 0;
      }
      RICLog.debug("Friendly name set to: " + this._ricFriendlyName);
      return msgRsltJsonObj;
    } catch (error) {
      return new RICNameResponse();
    }
  }

  /**
   *
   * getHWElemList - get list of HWElems on the robot (including add-ons)
   * @returns Promise<RICHWElemList>
   *
   */
  async getHWElemList(): Promise<RICHWElemList> {
    try {
      const ricHWList = await this._ricMsgHandler.sendRICRESTURL<RICHWElemList>(
        'hwstatus',
        true,
      );
      RICLog.debug('getHWElemList returned ' + JSON.stringify(ricHWList));
      this._hwElems = ricHWList.hw;
      this._addOnManager.setHWElems(this._hwElems);

      const reports: Array<RICReportMsg> = [];
      // add callback to subscribe to report messages and store in reports array
      this._ricMsgHandler._reportMsgCallbacks.set("getHWElemCB", function (report: RICReportMsg) {
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
      this._ricMsgHandler._reportMsgCallbacks.delete("getHWElemCB");

      return ricHWList;
    } catch (error) {
      RICLog.debug(`getHWElemList Failed to get list of HWElems ${error}`);
      return new RICHWElemList();
    }
  }

  /**
   *
   * getAddOnList - get list of add-ons configured on the robot
   * @returns Promise<RICAddOnList>
   *
   */
  async getAddOnList(): Promise<RICAddOnList> {
    try {
      const addOnList = await this._ricMsgHandler.sendRICRESTURL<RICAddOnList>(
        'addon/list',
        true,
      );
      RICLog.debug('getAddOnList returned ' + addOnList);
      return addOnList;
    } catch (error) {
      RICLog.debug(`getAddOnList Failed to get list of add-ons ${error}`);
      return new RICAddOnList();
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
        'filelist',
        true,
      );
      RICLog.debug('getFileList returned ' + ricFileList);
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
      let paramQueryStr = '';
      for (const param of paramEntries) {
        if (paramQueryStr.length > 0) paramQueryStr += '&';
        paramQueryStr += param[0] + '=' + param[1];
      }
      // Format the url to send
      if (paramQueryStr.length > 0) commandName += '?' + paramQueryStr;
      return await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(
        commandName,
        true,
      );
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
      >('sysmodinfo/BLEMan', true);

      RICLog.debug(
        `getSysModInfoBLEMan rslt ${bleInfo.rslt} isConn ${bleInfo.isConn} paused ${bleInfo.isAdv} txBPS ${bleInfo.txBPS} rxBPS ${bleInfo.rxBPS}`,
      );
      if ("tBPS" in bleInfo) {
        RICLog.debug(
          `getSysModInfoBLEMan testMsgs ${bleInfo.tM} testBytes ${bleInfo.tB} testRateBytesPS ${bleInfo.tBPS}`,
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
    let hostname = friendlyName;
    hostname = hostname?.replace(/ /g, '-');
    hostname = hostname.replace(/\W+/g, '');
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
      >('sysmodinfo/NetMan', true);

      RICLog.debug(
        `wifiConnStatus rslt ${ricSysModInfoWiFi.rslt} isConn ${ricSysModInfoWiFi.isConn} paused ${ricSysModInfoWiFi.isPaused}`,
      );

      // Check status indicates WiFi connected
      if (ricSysModInfoWiFi.rslt === 'ok') {
        this._ricWifiConnStatus.connState =
          ricSysModInfoWiFi.isConn !== 0
            ? RICWifiConnState.WIFI_CONN_CONNECTED
            : RICWifiConnState.WIFI_CONN_NONE;
        this._ricWifiConnStatus.isPaused = ricSysModInfoWiFi.isPaused !== 0;
        this._ricWifiConnStatus.ipAddress = ricSysModInfoWiFi.IP;
        this._ricWifiConnStatus.hostname = ricSysModInfoWiFi.Hostname;
        this._ricWifiConnStatus.ssid = ricSysModInfoWiFi.SSID;
        this._ricWifiConnStatus.bssid = ricSysModInfoWiFi.WiFiMAC;
        return (
          ricSysModInfoWiFi.isConn !== 0 || ricSysModInfoWiFi.isPaused !== 0
        );
      }
    } catch (error) {
      RICLog.debug(`[DEBUG]: wifiConnStatus sysmodinfo failed ${error}`);
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
        await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(
          'wifipause/pause',
          false,
        );
      } else {
        await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(
          'wifipause/resume',
          false,
        );
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
      const RICRESTURL_wifiCredentials = 'w/' + ssid + '/' + password + '/' + this._getHostnameFromFriendlyName();
      RICLog.debug(`wifiConnect attempting to connect to wifi ${RICRESTURL_wifiCredentials}`);

      await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(
        RICRESTURL_wifiCredentials,
        true,
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
      await new Promise(resolve => setTimeout(resolve, 1000));

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

      await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(
        'wc',
        true,
      );
      this.getWiFiConnStatus();
      return true;
    } catch (error) {
      RICLog.debug(`wifiDisconnect clearing unsuccessful`);
    }
    return false;
  }

  getCachedSystemInfo(): RICSystemInfo | null {
    return this._systemInfo;
  }

  getCachedHWElemList(): Array<RICHWElem> {
    return this._hwElems;
  }

  getCachedCalibInfo(): RICCalibInfo | null {
    return this._calibInfo;
  }

  getCachedRICName(): string | null {
    return this._ricFriendlyName;
  }

  getCachedRICNameIsSet(): boolean {
    return this._ricFriendlyNameIsSet;
  }

  getCachedWifiStatus(): RICWifiConnStatus {
    return this._ricWifiConnStatus;
  }
}
