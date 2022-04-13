/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import RICChannel from "./RICChannel";
import RICChannelWebBLE from "./RICChannelWebBLE";
import RICMsgHandler, { RICMsgResultCode } from "./RICMsgHandler";
import RICChannelWebSocket from "./RICChannelWebSocket";
import RICLEDPatternChecker from "./RICLEDPatternChecker";
import RICCommsStats from "./RICCommsStats";
import {
  RICAddOnList,
  RICEventFn,
  RICFriendlyName,
  RICHWElem,
  RICHWElemList,
  RICLedLcdColours,
  RICNameResponse,
  RICOKFail,
  RICReportMsg,
  RICStateInfo,
} from "./RICTypes";
import RICAddOnManager from "./RICAddOnManager";
import RICSystem from "./RICSystem";
import RICFileHandler from "./RICFileHandler";
import RICStreamHandler from "./RICStreamHandler";
import {
  ROSSerialAddOnStatusList,
  ROSSerialIMU,
  ROSSerialPowerStatus,
  ROSSerialRobotStatus,
  ROSSerialSmartServos,
} from "./RICROSSerial";
import RICUtils from "./RICUtils";
import RICLog from "./RICLog";
import { RICConnEvent, RICConnEventNames } from "./RICConnEvents";
import {
  RICSysModInfoWiFi,
  RICWifiConnState,
  RICWifiConnStatus,
} from "./RICWifiTypes";

export default class RICConnector {
  // Channel
  private _ricChannel: RICChannel | null = null;

  // Channel connection method and locator
  private _channelConnMethod = "";
  private _channelConnLocator: string | object = "";

  // Comms stats
  private _commsStats: RICCommsStats = new RICCommsStats();

  // Latest data from servos, IMU, etc
  private _ricStateInfo: RICStateInfo = new RICStateInfo();

  // Add-on Manager
  private _addOnManager = new RICAddOnManager();

  // HWElems (connected to RIC)
  private _hwElems: Array<RICHWElem> = new Array<RICHWElem>();

  // Message handler
  private _ricMsgHandler: RICMsgHandler = new RICMsgHandler(
    this._commsStats,
    this._addOnManager
  );

  // RICSystem
  private _ricSystem: RICSystem = new RICSystem(
    this._ricMsgHandler,
    this._addOnManager
  );

  // LED Pattern checker
  private _ledPatternChecker: RICLEDPatternChecker = new RICLEDPatternChecker();
  private _ledPatternTimeoutMs = 10000;
  private _ledPatternRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  // Subscription rate
  private _subscribeRateHz = 10;

  // Connection performance checker
  private readonly _testConnPerfBlockSize = 500;
  private readonly _testConnPerfNumBlocks = 7;
  private readonly _connPerfRsltDelayMs = 4000;

  // Retry connection if lost
  private _retryIfLostEnabled = true;
  private _retryIfLostForSecs = 10;
  private _retryIfLostIsConnected = false;
  private _retryIfLostDisconnectTime: number | null = null;
  private readonly _retryIfLostRetryDelayMs = 500;

  // File handler
  private _ricFileHandler: RICFileHandler = new RICFileHandler(
    this._ricMsgHandler,
    this._commsStats
  );

  // Stream handler
  private _ricStreamHandler: RICStreamHandler = new RICStreamHandler(
    this._ricMsgHandler,
    this._commsStats
  );

  // Event listener
  private _onEventFn: RICEventFn | null = null;

  // WiFi connection info
  _ricWifiConnStatus: RICWifiConnStatus = new RICWifiConnStatus();
  _defaultWiFiHostname = "Marty";
  _maxSecsToWaitForWiFiConn = 20;

  // RIC friendly name
  _ricFriendlyName: string | null = null;
  _ricFriendlyNameIsSet = false;

  constructor() {
    // Debug
    RICLog.debug("RICConnector starting up");
  }

  setEventListener(onEventFn: RICEventFn): void {
    this._onEventFn = onEventFn;
  }

  isConnected() {
    // Check if connected
    const isConnected =
      this._retryIfLostIsConnected ||
      (this._ricChannel ? this._ricChannel.isConnected() : false);
    return isConnected;
  }

  // Set retry channel mode
  setRetryConnectionIfLost(enableRetry: boolean, retryForSecs: number): void {
    this._retryIfLostEnabled = enableRetry;
    this._retryIfLostForSecs = retryForSecs;
    if (!this._retryIfLostEnabled) {
      this._retryIfLostIsConnected = false;
    }
    RICLog.debug(
      `setRetryConnectionIfLost ${enableRetry} retry for ${retryForSecs}`
    );
  }

  getConnMethod(): string {
    return this._channelConnMethod;
  }

  getRICSystem(): RICSystem {
    return this._ricSystem;
  }

  getRICState(): RICStateInfo {
    return this._ricStateInfo;
  }

  getCommsStats(): RICCommsStats {
    return this._commsStats;
  }

  /**
   * Connect to a RIC
   *
   * @param {string} method - can be "WebBLE" or "WebSocket"
   * @param {string | object} locator - either a string (WebSocket URL) or an object (WebBLE)
   * @returns Promise<boolean>
   *
   */
  async connect(method: string, locator: string | object): Promise<boolean> {
    // Ensure disconnected
    try {
      await this.disconnect();
    } catch (err) {
      // Ignore
    }

    // Check connection method
    let connMethod = "";
    if (method === "WebBLE" && typeof locator === "object") {
      // Create channel
      this._ricChannel = new RICChannelWebBLE();
      connMethod = "WebBLE";
    } else if (
      (method.toLocaleLowerCase() === "WebSocket" ||
        method.toLocaleLowerCase() === "wifi") &&
      typeof locator === "string"
    ) {
      // Create channel
      this._ricChannel = new RICChannelWebSocket();
      connMethod = "WebSocket";
    }

    // Check channel established
    let connOk = false;
    if (this._ricChannel !== null) {
      // Connection method and locator
      this._channelConnMethod = connMethod;
      this._channelConnLocator = locator;

      // Set message handler
      this._ricChannel.setMsgHandler(this._ricMsgHandler);
      this._ricChannel.setOnConnEvent(this.onConnEvent.bind(this));

      // Message handling in and out
      this._ricMsgHandler.registerForResults(this);
      this._ricMsgHandler.registerMsgSender(this._ricChannel);

      // Connect
      try {
        // Event
        this.onConnEvent(RICConnEvent.CONN_CONNECTING_RIC);

        // Connect
        connOk = await this._connectToChannel();
      } catch (err) {
        RICLog.error("RICConnector.connect - error: " + err);
      }

      // Events
      if (connOk) {
        this.onConnEvent(RICConnEvent.CONN_CONNECTED_RIC);
      } else {
        // Failed Event
        this.onConnEvent(RICConnEvent.CONN_CONNECTION_FAILED);
      }
    } else {
      this._channelConnMethod = "";
    }

    return connOk;
  }

  async disconnect(): Promise<void> {
    // Disconnect
    this._retryIfLostIsConnected = false;
    if (this._ricChannel) {
      this._ricChannel.disconnect();
    }
  }

  // Mark: Tx Message handling -----------------------------------------------------------------------------------------

  /**
   *
   * sendRICRESTMsg
   * @param commandName command API string
   * @param params parameters (simple name value pairs only) to parameterize trajectory
   * @returns Promise<RICOKFail>
   *
   */
  async sendRICRESTMsg(
    commandName: string,
    params: object
  ): Promise<RICOKFail> {
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
      RICLog.warn(`runCommand failed ${error}`);
      return new RICOKFail();
    }
  }

  // Mark: Rx Message handling -----------------------------------------------------------------------------------------

  onRxReply(
    msgHandle: number,
    msgRsltCode: RICMsgResultCode,
    msgRsltJsonObj: object | null
  ): void {
    RICLog.verbose(
      `onRxReply msgHandle ${msgHandle} rsltCode ${msgRsltCode} obj ${JSON.stringify(
        msgRsltJsonObj
      )}`
    );
  }

  onRxUnnumberedMsg(msgRsltJsonObj: { [key: string]: number | string }): void {
    RICLog.verbose(
      `onRxUnnumberedMsg rsltCode obj ${JSON.stringify(msgRsltJsonObj)}`
    );

    // Inform the file handler
    if ("okto" in msgRsltJsonObj) {
      this._ricFileHandler.onOktoMsg(msgRsltJsonObj.okto as number);
    } else if ("sokto" in msgRsltJsonObj) {
      this._ricStreamHandler.onSoktoMsg(msgRsltJsonObj.sokto as number);
    }
  }

  // Mark: Published data handling -----------------------------------------------------------------------------------------

  onRxOtherROSSerialMsg(topicID: number, payload: Uint8Array): void {
    RICLog.debug(
      `onRxOtherROSSerialMsg topicID ${topicID} payload ${RICUtils.bufferToHex(
        payload
      )}`
    );
  }

  onRxSmartServo(smartServos: ROSSerialSmartServos): void {
    // RICLog.verbose(`onRxSmartServo ${JSON.stringify(smartServos)}`);
    this._ricStateInfo.smartServos = smartServos;
    this._ricStateInfo.smartServosValidMs = Date.now();
  }

  onRxIMU(imuData: ROSSerialIMU): void {
    // RICLog.verbose(`onRxIMU ${JSON.stringify(imuData)}`);
    this._ricStateInfo.imuData = imuData;
    this._ricStateInfo.imuDataValidMs = Date.now();
  }

  onRxPowerStatus(powerStatus: ROSSerialPowerStatus): void {
    // RICLog.verbose(`onRxPowerStatus ${JSON.stringify(powerStatus)}`);
    this._ricStateInfo.power = powerStatus;
    this._ricStateInfo.powerValidMs = Date.now();
  }

  onRxAddOnPub(addOnInfo: ROSSerialAddOnStatusList): void {
    // RICLog.verbose(`onRxAddOnPub ${JSON.stringify(addOnInfo)}`);
    this._ricStateInfo.addOnInfo = addOnInfo;
    this._ricStateInfo.addOnInfoValidMs = Date.now();
  }

  onRobotStatus(robotStatus: ROSSerialRobotStatus): void {
    // RICLog.verbose(`onRobotStatus ${JSON.stringify(robotStatus)}`);
    this._ricStateInfo.robotStatus = robotStatus;
    this._ricStateInfo.robotStatusValidMs = Date.now();
  }

  getRICStateInfo(): RICStateInfo {
    return this._ricStateInfo;
  }

  // Mark: Check correct RIC -----------------------------------------------------------------------------------------

  /**
   * Start checking correct RIC using LED pattern
   *
   *  @param {string} ricToConnectTo - RIC to connect to
   *  @return boolean - true if started ok
   *
   */
  async checkCorrectRICStart(
    ricLedLcdColours: RICLedLcdColours
  ): Promise<boolean> {
    // Set colour pattern checker colours
    const randomColours = this._ledPatternChecker.setup(ricLedLcdColours);

    // Start timer to repeat checking LED pattern
    RICLog.debug(`checkCorrectRICStart: starting LED pattern checker`);
    if (!(await this._checkCorrectRICRefreshLEDs())) {
      return false;
    }

    // Event
    this.onConnEvent(RICConnEvent.CONN_VERIFYING_CORRECT_RIC, randomColours);

    // Start timer to repeat sending of LED pattern
    // This is because RIC's LED pattern override times out after a while
    // so has to be refreshed periodically
    this._ledPatternRefreshTimer = setInterval(async () => {
      RICLog.verbose(`checkCorrectRICStart: loop`);
      if (!this._checkCorrectRICRefreshLEDs()) {
        RICLog.debug("checkCorrectRICStart no longer active - clearing timer");
        this._clearLedPatternRefreshTimer();
      }
    }, this._ledPatternTimeoutMs / 2.1);
    return true;
  }

  /**
   * Stop checking correct RIC
   *
   *  @return void
   *
   */
  async checkCorrectRICStop(confirmCorrectRIC: boolean): Promise<boolean> {
    // Stop refreshing LED pattern on RIC
    this._clearLedPatternRefreshTimer();

    // Stop the LED pattern checker if connected
    if (this.isConnected()) {
      this._ledPatternChecker.clearRICColors(this._ricMsgHandler);
    }

    // Check correct
    if (!confirmCorrectRIC) {
      // Event
      this.onConnEvent(RICConnEvent.CONN_REJECTED_RIC);
      // Indicate as rejected if we're not connected or if user didn't confirm
      return false;
    }
    // Event
    this.onConnEvent(RICConnEvent.CONN_VERIFIED_CORRECT_RIC);
    return true;
  }

  /**
   * Refresh LED pattern on RIC
   *
   *  @return boolean - true if checking still active
   *
   */
  async _checkCorrectRICRefreshLEDs(): Promise<boolean> {
    // Check LED pattern is active
    if (!this._ledPatternChecker.isActive()) {
      return false;
    }

    // Check connected
    RICLog.debug(`_verificationRepeat getting isConnected`);
    if (!this.isConnected()) {
      console.warn("_verificationRepeat not connected");
      return false;
    }

    // Repeat the LED pattern (RIC times out the LED override after ~10 seconds)
    RICLog.debug(`_verificationRepeat setting pattern`);
    return await this._ledPatternChecker.setRICColors(
      this._ricMsgHandler,
      this._ledPatternTimeoutMs
    );
  }

  _clearLedPatternRefreshTimer(): void {
    if (this._ledPatternRefreshTimer) {
      clearInterval(this._ledPatternRefreshTimer);
      this._ledPatternRefreshTimer = null;
    }
  }

  // Mark: Marty system info ------------------------------------------------------------------------------------

  /**
   * Get information Marty system
   *
   *  @return void
   *
   */
  async retrieveMartySystemInfo(): Promise<boolean> {
    // Retrieve system info
    try {
      const retrieveResult = await this._ricSystem.retrieveInfo();
      if (!retrieveResult) {
        return false;
      }
    } catch (err) {
      RICLog.error(`retrieveMartySystemInfo: error ${err}`);
      return false;
    }

    // RIC verified and connected
    if (this._ricChannel) {
      // Subscribe for updates if required
      if (this._ricChannel.requiresSubscription()) {
        try {
          await this.subscribeForUpdates(true);
        } catch (error) {
          RICLog.warn(`eventConnect - subscribe for updates failed ${error}`);
        }
      }
      return true;
    }
    return false;
  }

  // Mark: RIC Subscription to Updates --------------------------------------------------------------------------------

  /**
   *
   * subscribeForUpdates
   * @param enable - true to send command to enable subscription (false to remove sub)
   * @returns Promise<void>
   *
   */
  async subscribeForUpdates(enable: boolean): Promise<void> {
    try {
      const subscribeDisable =
        '{"cmdName":"subscription","action":"update",' +
        '"pubRecs":[' +
        `{"name":"MultiStatus","rateHz":0,}` +
        '{"name":"PowerStatus","rateHz":0},' +
        `{"name":"AddOnStatus","rateHz":0}` +
        "]}";
      const subscribeEnable =
        '{"cmdName":"subscription","action":"update",' +
        '"pubRecs":[' +
        `{"name":"MultiStatus","rateHz":${this._subscribeRateHz.toString()}}` +
        `{"name":"PowerStatus","rateHz":1.0},` +
        `{"name":"AddOnStatus","rateHz":${this._subscribeRateHz.toString()}}` +
        "]}";

      const ricResp = await this._ricMsgHandler.sendRICRESTCmdFrame<RICOKFail>(
        enable ? subscribeEnable : subscribeDisable
      );

      // Debug
      RICLog.debug(
        `subscribe enable/disable returned ${JSON.stringify(ricResp)}`
      );
    } catch (error) {
      RICLog.warn(`getRICCalibInfo Failed subscribe for updates ${error}`);
    }
  }

  // Mark: Streaming --------------------------------------------------------------------------------
  streamAudio(streamContents: Uint8Array, clearExisting: boolean): void {
    if (this._ricStreamHandler && this.isConnected()) {
      this._ricStreamHandler.streamAudio(streamContents, clearExisting);
    }
  }

  // Mark: Connection performance--------------------------------------------------------------------------

  parkmiller_next(seed: number) {
    const hi = Math.round(16807 * (seed & 0xffff));
    let lo = Math.round(16807 * (seed >> 16));
    lo += (hi & 0x7fff) << 16;
    lo += hi >> 15;
    if (lo > 0x7fffffff) lo -= 0x7fffffff;
    return lo;
  }

  async checkConnPerformance(): Promise<number | undefined> {
    // Send empty blocks of data - these will be ignored by RIC - but will still be counted for performance
    // evaluation
    let prbsState = 1;
    const testData = new Uint8Array(this._testConnPerfBlockSize);
    for (let i = 0; i < this._testConnPerfNumBlocks; i++) {
      testData.set([
        0,
        (i >> 24) & 0xff,
        (i >> 16) & 0xff,
        (i >> 8) & 0xff,
        i & 0xff,
        0x1f,
        0x9d,
        0xf4,
        0x7a,
        0xb5,
      ]);
      for (let j = 10; j < this._testConnPerfBlockSize; j++) {
        prbsState = this.parkmiller_next(prbsState);
        testData[j] = prbsState & 0xff;
      }
      if (this._ricChannel) {
        await this._ricChannel.sendTxMsg(testData, false);
      }
    }

    // Wait a little to allow RIC to process the data
    await new Promise((resolve) =>
      setTimeout(resolve, this._connPerfRsltDelayMs)
    );

    // Get performance
    const blePerf = await this._ricSystem.getSysModInfoBLEMan();
    if (blePerf) {
      console.log(
        `startConnPerformanceCheck timer rate = ${blePerf.tBPS}BytesPS`
      );
      return blePerf.tBPS;
    } else {
      throw new Error("checkConnPerformance: failed to get BLE performance");
    }
  }

  // Mark: Connection event --------------------------------------------------------------------------

  onConnEvent(
    eventEnum: RICConnEvent,
    data: object | string | null | undefined = undefined
  ): void {
    // Handle information clearing on disconnect
    switch (eventEnum) {
      case RICConnEvent.CONN_DISCONNECTED_RIC:
        // Disconnect time
        this._retryIfLostDisconnectTime = Date.now();

        // Check if retry required
        if (this._retryIfLostIsConnected && this._retryIfLostEnabled) {
          // Indicate connection disrupted
          if (this._onEventFn) {
            this._onEventFn(
              "conn",
              RICConnEvent.CONN_ISSUE_DETECTED,
              RICConnEventNames[RICConnEvent.CONN_ISSUE_DETECTED]
            );
          }

          // Retry connection
          this._retryConnection();

          // Don't allow disconnection to propagate until retries have occurred
          return;
        }

        // Invalidate connection details
        this._ricSystem.invalidate();
        break;
    }

    // Notify
    if (this._onEventFn) {
      this._onEventFn("conn", eventEnum, RICConnEventNames[eventEnum], data);
    }
  }

  _retryConnection(): void {
    // Check timeout
    if (
      this._retryIfLostDisconnectTime !== null &&
      Date.now() - this._retryIfLostDisconnectTime <
        this._retryIfLostForSecs * 1000
    ) {
      // Set timer to try to reconnect
      setTimeout(async () => {
        // Try to connect
        const isConn = await this._connectToChannel();
        if (!isConn) {
          this._retryConnection();
        } else {
          // No longer retrying
          this._retryIfLostDisconnectTime = null;

          // Indicate connection problem resolved
          if (this._onEventFn) {
            this._onEventFn(
              "conn",
              RICConnEvent.CONN_ISSUE_RESOLVED,
              RICConnEventNames[RICConnEvent.CONN_ISSUE_RESOLVED]
            );
          }
        }
      }, this._retryIfLostRetryDelayMs);
    } else {
      // No longer connected after retry timeout
      this._retryIfLostIsConnected = false;

      // Indicate disconnection
      if (this._onEventFn) {
        this._onEventFn(
          "conn",
          RICConnEvent.CONN_DISCONNECTED_RIC,
          RICConnEventNames[RICConnEvent.CONN_DISCONNECTED_RIC]
        );
      }

      // Invalidate connection details
      this._ricSystem.invalidate();
    }
  }

  async _connectToChannel(): Promise<boolean> {
    // Connect
    try {
      if (this._ricChannel) {
        const connected = await this._ricChannel.connect(
          this._channelConnLocator
        );
        if (connected) {
          this._retryIfLostIsConnected = true;
          return true;
        }
      }
    } catch (error) {
      RICLog.error(`RICConnector.connect() error: ${error}`);
    }
    return false;
  }

  // Mark: WiFi Connection ------------------------------------------------------------------------------------

  getHostnameFromFriendlyName(): string {
    if (!this._ricFriendlyName) {
      return this._defaultWiFiHostname;
    }
    let hostname = this._ricFriendlyName;
    hostname = hostname?.replace(/ /g, "-");
    hostname = hostname.replace(/\W+/g, "");
    return hostname;
  }

  async pauseWifiConnection(pause: boolean): Promise<boolean> {
    try {
      if (pause) {
        await this._ricMsgHandler.sendRICRESTURL<RICOKFail>("wifipause/pause");
      } else {
        await this._ricMsgHandler.sendRICRESTURL<RICOKFail>("wifipause/resume");
      }
    } catch (error) {
      console.log("wifiConnect wifi pause", error);
      return true;
    }
    return false;
  }

  async getWiFiConnStatus(): Promise<boolean | null> {
    // Request the WiFi connection to be paused
    try {
      // Get status
      const ricSysModInfoWiFi = await this._ricMsgHandler.sendRICRESTURL<
        RICSysModInfoWiFi
      >("sysmodinfo/NetMan");

      console.log(
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
        return (
          ricSysModInfoWiFi.isConn !== 0 || ricSysModInfoWiFi.isPaused !== 0
        );
      }
    } catch (error) {
      console.log("[DEBUG]: wifiConnStatus sysmodinfo failed ", error);
    }
    this._ricWifiConnStatus.connState = RICWifiConnState.WIFI_CONN_NONE;
    this._ricWifiConnStatus.isPaused = false;
    return null;
  }

  async wifiConnect(ssid: string, password: string): Promise<boolean> {
    console.log(`Connect to WiFi ${ssid} password ${password}`);

    // Issue the command to connect WiFi
    try {
      console.log("Attempting to connect to wifi");
      let RICRESTURL_wifiCredentials =
        "w/" + ssid + "/" + password + "/" + this.getHostnameFromFriendlyName();
      console.log("RESTURL: " + RICRESTURL_wifiCredentials);

      await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(
        RICRESTURL_wifiCredentials
      );
    } catch (error) {
      console.log("wifiConnect failed ", error);
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
      console.log("connStat: " + connStat);
      if (connStat) {
        return true;
      }
    }
    return false;
  }

  async wifiDisconnect(): Promise<boolean> {
    try {
      console.log("Attempting to clear wifi info");

      await this._ricMsgHandler.sendRICRESTURL<RICOKFail>("wc");
      this.getWiFiConnStatus();
      return true;
    } catch (error) {
      console.log("Wifi clearing unsuccessful");
      return false;
    }
  }

  // Mark: RIC Naming -----------------------------------------------------------------------------------

  /**
   *
   * setRICName
   * @param newName name to refer to RIC - used for BLE advertising
   * @returns Promise<string> (name that has been set)
   *
   */
  async setRICName(newName: string): Promise<string> {
    try {
      const msgRsltJsonObj = await this._ricMsgHandler.sendRICRESTURL<
        RICFriendlyName
      >(`friendlyname/${newName}`);

      const nameThatHasBeenSet = msgRsltJsonObj.friendlyName;
      this._ricFriendlyName = nameThatHasBeenSet;
      this._ricFriendlyNameIsSet = true;
      return nameThatHasBeenSet;
    } catch (error) {
      return "";
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
      >("friendlyname");
      if (msgRsltJsonObj.rslt === "ok") {
        this._ricFriendlyName = msgRsltJsonObj.friendlyName;
        this._ricFriendlyNameIsSet = msgRsltJsonObj.friendlyNameIsSet != 0;
      }
      console.log("Friendly name set to: " + this._ricFriendlyName);
      return msgRsltJsonObj;
    } catch (error) {
      return new RICNameResponse();
    }
  }

  // Mark: Run API Command -------------------------------------------------------------------------------

  /**
   *
   * runTrajectory
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
      );
    } catch (error) {
      console.log('runCommand failed', error);
      return new RICOKFail();
    }
  }

  // Mark: Get AddOn list -----------------------------------------------------------

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
      );
      console.log('getAddOnList returned ' + addOnList);
      return addOnList;
    } catch (error) {
      console.log('getAddOnList Failed to get list of add-ons', error);
      return new RICAddOnList();
    }
  }

  // Mark: Set AddOn config -----------------------------------------------------------

  /**
   *
   * setAddOnConfig - set a specified add-on's configuration
   * @param serialNo used to identify the add-on
   * @param newName name to refer to add-on by
   * @returns Promise<RICOKFail>
   *
   */
   async setAddOnConfig(serialNo: string, newName: string): Promise<RICOKFail> {
    try {
      const msgRslt = await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(
        `addon/set?SN=${serialNo}&name=${newName}`,
      );
      return msgRslt;
    } catch (error) {
      return new RICOKFail();
    }
  }

  /**
   * deleteAddOn - remove an addon from the addonlist on RIC
   * @param serialNo used to identify the add-on
   * @returns Promise<RICOKFail>
   */
  async deleteAddOn(serialNo: string): Promise<RICOKFail> {
    try {
      const msgRslt = await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(
        `addon/del?SN=${serialNo}`,
      );
      return msgRslt;
    } catch (error) {
      return new RICOKFail();
    }
  }


  // Mark: Identify AddOn -----------------------------------------------------------

  /**
   *
   * identifyAddOn - send the 'identify' command to a specified add-on
   * @param name used to identify the add-on
   * @returns Promise<RICOKFail>
   *
   */
   async identifyAddOn(name: string): Promise<RICOKFail> {
    try {
      const msgRslt = await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(
        `elem/${name}/json?cmd=raw&hexWr=F8`,
      );
      return msgRslt;
    } catch (error) {
      return new RICOKFail();
    }
  }

  // Mark: Get HWElem list -----------------------------------------------------------

  /**
   *
   * getHWElemList - get list of HWElems on the robot (including add-ons)
   * @returns Promise<RICHWElemList>
   *
   */
  async getHWElemList(): Promise<RICHWElemList> {
    try {
      const ricHWList = await this._ricMsgHandler.sendRICRESTURL<RICHWElemList>(
        "hwstatus"
      );
      console.log("getHWElemList returned " + JSON.stringify(ricHWList));
      this._hwElems = ricHWList.hw;
      this._addOnManager.setHWElems(this._hwElems);

      let reports: Array<RICReportMsg> = [];
      // add callback to subscribe to report messages and store in reports array
      this._ricMsgHandler._reportMsgCallbacks.set("getHWElemCB", function (
        report
      ) {
        reports.push(report);
        console.log(`getHWElemCB Report callback ${JSON.stringify(report)}`);
      });

      // run any required initialisation for the addons
      const initCmds = this._addOnManager.getInitCmds();
      // send init commands to the robot
      const timeInitStart = Date.now();
      for (const initCmd of initCmds) {
        this.runCommand(initCmd, {});
      }
      // wait a couple of seconds for any report messages to be received
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // pass report messages to add on manager for processing
      this._addOnManager.processReportMsg(reports, timeInitStart);

      // clean up callback
      this._ricMsgHandler._reportMsgCallbacks.delete("getHWElemCB");

      return ricHWList;
    } catch (error) {
      console.log("getHWElemList Failed to get list of HWElems", error);
      return new RICHWElemList();
    }
  }
}
