import RICChannel from "./RICChannel";
import RICChannelWebBLE from "./RICChannelWebBLE";
import RICMsgHandler, { RICMsgResultCode } from "./RICMsgHandler";
import RICChannelWebSocket from "./RICChannelWebSocket";
import RICLEDPatternChecker, { RICLEDPatternCheckerColour } from "./RICLEDPatternChecker";
import RICCommsStats from "./RICCommsStats";
import { RICEventFn, RICOKFail, RICStateInfo } from "./RICTypes";
import RICAddOnManager from "./RICAddOnManager";
import RICSystem from "./RICSystem";
import RICFileHandler from "./RICFileHandler";
import RICStreamHandler from "./RICStreamHandler";
import { ROSSerialAddOnStatusList, ROSSerialIMU, ROSSerialPowerStatus, ROSSerialRobotStatus, ROSSerialSmartServos } from "./RICROSSerial";
import RICUtils from "./RICUtils";
import RICLog from "./RICLog";
import { RICConnEvent, RICConnEventNames } from "./RICConnEvents";

export type LedLcdColours = Array<RICLEDPatternCheckerColour>;

export class RICConnector {

  // Channel
  private _ricChannel: RICChannel | null = null;

  // Channel connection method
  private _channelConnMethod: string = "";

  // Comms stats
  private _commsStats: RICCommsStats = new RICCommsStats();

  // Latest data from servos, IMU, etc
  private _ricStateInfo: RICStateInfo = new RICStateInfo();

  // Add-on Manager
  private _addOnManager = new RICAddOnManager();

  // Message handler
  private _ricMsgHandler: RICMsgHandler = new RICMsgHandler(
    this._commsStats,
    this._addOnManager,
  );

  // RICSystem
  private _ricSystem: RICSystem = new RICSystem(this._ricMsgHandler, this._addOnManager);

  // LED Pattern checker
  private _ledPatternChecker: RICLEDPatternChecker = new RICLEDPatternChecker();
  private _ledPatternTimeoutMs = 10000;
  private _ledPatternRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  // Subscription rate
  private _subscribeRateHz = 10;

  // Connection performance checker
  // private _connPerfTimer: typeof setTimeout | null = null;
  // private _testConnPerfBlockSize = 500;
  // private _testConnPerfNumBlocks = 7;

  // File handler
  private _ricFileHandler: RICFileHandler = new RICFileHandler(
    this._ricMsgHandler,
    this._commsStats,
  );

  // Stream handler
  private _ricStreamHandler: RICStreamHandler = new RICStreamHandler(
    this._ricMsgHandler,
    this._commsStats,
  );

  // Event listener
  private _onEventFn: RICEventFn | null = null;

  constructor() {
    // Debug
    RICLog.debug('RICConnector starting up');
  }

  setEventListener(onEventFn: RICEventFn): void {
    this._onEventFn = onEventFn;
  }
  
  isConnected() {
    // Check if connected
    const isConnected = this._ricChannel ? this._ricChannel.isConnected() : false;
    return isConnected;
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
    if (method === 'WebBLE' && typeof locator === 'object') {

      // Create channel
      this._ricChannel = new RICChannelWebBLE();
      connMethod = 'WebBLE';

    } else if (((method.toLocaleLowerCase() === 'WebSocket') || (method.toLocaleLowerCase() === 'wifi')) && (typeof locator === 'string')) {

      // Create channel
      this._ricChannel = new RICChannelWebSocket();
      connMethod = 'WebSocket';
    }

    // Check channel established
    if (this._ricChannel !== null) {

      // Connection method
      this._channelConnMethod = connMethod;

      // Set message handler
      this._ricChannel.setMsgHandler(this._ricMsgHandler);
      this._ricChannel.setOnConnEvent(this.onConnEvent.bind(this));

      // Message handling in and out
      this._ricMsgHandler.registerForResults(this);
      this._ricMsgHandler.registerMsgSender(this._ricChannel);

      // Connect
      try {
        return await this._ricChannel.connect(locator);
      } catch (error) {
        RICLog.error(`RICConnector.connect() error: ${error}`);
        return false;
      }
    } else {
      this._channelConnMethod = "";
    }

    return false;
  }

  async disconnect(): Promise<void> {
    // Disconnect
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
  async sendRICRESTMsg(commandName: string, params: object): Promise<RICOKFail> {
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
    msgRsltJsonObj: object | null,
  ): void {
    RICLog.verbose(
      `onRxReply msgHandle ${msgHandle} rsltCode ${msgRsltCode} obj ${JSON.stringify(
        msgRsltJsonObj,
      )}`,
    );
  }

  onRxUnnumberedMsg(msgRsltJsonObj: { [key: string]: number | string }): void {
    RICLog.verbose(
      `onRxUnnumberedMsg rsltCode obj ${JSON.stringify(msgRsltJsonObj)}`,
    );

    // Inform the file handler
    if ('okto' in msgRsltJsonObj) {
      this._ricFileHandler.onOktoMsg(msgRsltJsonObj.okto as number);
    } else if ('sokto' in msgRsltJsonObj) {
      this._ricStreamHandler.onSoktoMsg(msgRsltJsonObj.sokto as number);
    }
  }

  // Mark: Published data handling -----------------------------------------------------------------------------------------

  onRxOtherROSSerialMsg(topicID: number, payload: Uint8Array): void {
    RICLog.debug(`onRxOtherROSSerialMsg topicID ${topicID} payload ${RICUtils.bufferToHex(payload)}`);
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
  async checkCorrectRICStart(ledLcdColours: LedLcdColours): Promise<boolean> {

    // Set colour pattern checker colours
    this._ledPatternChecker.setup(ledLcdColours);

    // Start timer to repeat checking LED pattern
    RICLog.debug(`checkCorrectRICStart: starting LED pattern checker`);
    if (!this._checkCorrectRICRefreshLEDs()) {
      return false;
    }

    // Start timer to repeat sending of LED pattern
    // This is because RIC's LED pattern override times out after a while
    // so has to be refreshed periodically
    this._ledPatternRefreshTimer = setInterval(async () => {
      RICLog.verbose(`checkCorrectRICStart: loop`);
      if (!this._checkCorrectRICRefreshLEDs()) {
        RICLog.debug('checkCorrectRICStart no longer active - clearing timer');
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
    } else if (!confirmCorrectRIC) {
      // Indicate as rejected if we're not connected or if user didn't confirm
      return false;
    }
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
      console.warn('_verificationRepeat no longer connected to BLE');
      return false;
    }

    // Repeat the LED pattern (RIC times out the LED override after ~10 seconds)
    RICLog.debug(`_verificationRepeat setting pattern`);
    return await this._ledPatternChecker.setRICColors(this._ricMsgHandler, this._ledPatternTimeoutMs);
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
        } catch (error: any) {
          RICLog.warn(`eventConnect - subscribe for updates failed ${error.toString()}`)
        }
      }

      // Set retry mode
      this._ricChannel.setRetryConnectionIfLost(true);
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
      const subscribeDisable = '{"cmdName":"subscription","action":"update",' +
        '"pubRecs":[' +
        `{"name":"MultiStatus","rateHz":0,}` +
        '{"name":"PowerStatus","rateHz":0},' +
        `{"name":"AddOnStatus","rateHz":0}` +
        ']}';
      const subscribeEnable = '{"cmdName":"subscription","action":"update",' +
        '"pubRecs":[' +
        `{"name":"MultiStatus","rateHz":${this._subscribeRateHz.toString()}}` +
        `{"name":"PowerStatus","rateHz":1.0},` +
        `{"name":"AddOnStatus","rateHz":${this._subscribeRateHz.toString()}}` +
        ']}';

      const ricResp = await this._ricMsgHandler.sendRICRESTCmdFrame<RICOKFail>(enable ? subscribeEnable : subscribeDisable);

      // Debug
      RICLog.debug(`subscribe enable/disable returned ${JSON.stringify(ricResp)}`);
    } catch (error: any) {
      RICLog.warn(`getRICCalibInfo Failed subscribe for updates ${error.toString()}`);
    }
  }

  // Mark: Streaming --------------------------------------------------------------------------------
  streamAudio(streamContents: Uint8Array, clearExisting: boolean): void {
    if (this._ricStreamHandler && this.isConnected()) {
      this._ricStreamHandler.streamAudio(streamContents, clearExisting);
    }
  }

  // On connection event
  onConnEvent(eventEnum: RICConnEvent, data: object | string | null | undefined): void {

    // Handle information clearing on disconnect
    switch(eventEnum) {
      case RICConnEvent.CONN_DISCONNECTED_RIC:
        this._ricSystem.invalidate();
        break;
    }

    // Notify
    if (this._onEventFn) {
      this._onEventFn("conn", eventEnum, RICConnEventNames[eventEnum], data);
    }
  }
}
