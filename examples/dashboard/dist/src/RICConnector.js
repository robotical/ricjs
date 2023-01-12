/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
import RICChannelWebBLE from "./RICChannelWebBLE";
import RICMsgHandler from "./RICMsgHandler";
import RICChannelWebSocket from "./RICChannelWebSocket";
import RICLEDPatternChecker from "./RICLEDPatternChecker";
import RICCommsStats from "./RICCommsStats";
import { RICOKFail, RICStateInfo } from "./RICTypes";
import RICAddOnManager from "./RICAddOnManager";
import RICSystem from "./RICSystem";
import RICFileHandler from "./RICFileHandler";
import RICStreamHandler from "./RICStreamHandler";
import RICUtils from "./RICUtils";
import RICLog from "./RICLog";
import { RICConnEvent, RICConnEventNames } from "./RICConnEvents";
import RICUpdateManager from "./RICUpdateManager";
import { RICUpdateEvent, RICUpdateEventNames } from "./RICUpdateEvents";
export default class RICConnector {
    // Channel
    _ricChannel = null;
    // Channel connection method and locator
    _channelConnMethod = "";
    _channelConnLocator = "";
    // Comms stats
    _commsStats = new RICCommsStats();
    // Latest data from servos, IMU, etc
    _ricStateInfo = new RICStateInfo();
    // Add-on Manager
    _addOnManager = new RICAddOnManager();
    // Message handler
    _ricMsgHandler = new RICMsgHandler(this._commsStats, this._addOnManager);
    // RICSystem
    _ricSystem = new RICSystem(this._ricMsgHandler, this._addOnManager);
    // LED Pattern checker
    _ledPatternChecker = new RICLEDPatternChecker();
    _ledPatternTimeoutMs = 10000;
    _ledPatternRefreshTimer = null;
    // Subscription rate
    _subscribeRateHz = 10;
    // Connection performance checker
    _testConnPerfBlockSize = 500;
    _testConnPerfNumBlocks = 7;
    _connPerfRsltDelayMs = 4000;
    // Retry connection if lost
    _retryIfLostEnabled = true;
    _retryIfLostForSecs = 10;
    _retryIfLostIsConnected = false;
    _retryIfLostDisconnectTime = null;
    _retryIfLostRetryDelayMs = 500;
    // File handler
    _ricFileHandler = new RICFileHandler(this._ricMsgHandler, this._commsStats);
    // Stream handler
    _ricStreamHandler = new RICStreamHandler(this._ricMsgHandler, this._commsStats, this);
    // Update manager
    _ricUpdateManager = null;
    // Event listener
    _onEventFn = null;
    constructor() {
        // Debug
        RICLog.debug('RICConnector starting up');
    }
    setupUpdateManager(appVersion, appUpdateURL, fileDownloader) {
        // Setup update manager
        const firmwareTypeStrForMainFw = 'main';
        const nonFirmwareElemTypes = ['sound', 'traj'];
        this._ricUpdateManager = new RICUpdateManager(this._ricMsgHandler, this._ricFileHandler, this._ricSystem, this._onUpdateEvent.bind(this), firmwareTypeStrForMainFw, nonFirmwareElemTypes, appVersion, fileDownloader, appUpdateURL);
    }
    setEventListener(onEventFn) {
        this._onEventFn = onEventFn;
    }
    isConnected() {
        // Check if connected
        const isConnected = this._retryIfLostIsConnected || (this._ricChannel ? this._ricChannel.isConnected() : false);
        return isConnected;
    }
    // Set retry channel mode
    setRetryConnectionIfLost(enableRetry, retryForSecs) {
        this._retryIfLostEnabled = enableRetry;
        this._retryIfLostForSecs = retryForSecs;
        if (!this._retryIfLostEnabled) {
            this._retryIfLostIsConnected = false;
        }
        RICLog.debug(`setRetryConnectionIfLost ${enableRetry} retry for ${retryForSecs}`);
    }
    getConnMethod() {
        return this._channelConnMethod;
    }
    getAddOnManager() {
        return this._addOnManager;
    }
    getRICSystem() {
        return this._ricSystem;
    }
    getRICState() {
        return this._ricStateInfo;
    }
    getCommsStats() {
        return this._commsStats;
    }
    getRICMsgHandler() {
        return this._ricMsgHandler;
    }
    getRICChannel() {
        return this._ricChannel;
    }
    /**
     * Connect to a RIC
     *
     * @param {string} method - can be "WebBLE" or "WebSocket"
     * @param {string | object} locator - either a string (WebSocket URL) or an object (WebBLE)
     * @returns Promise<boolean>
     *
     */
    async connect(method, locator) {
        // Ensure disconnected
        try {
            await this.disconnect();
        }
        catch (err) {
            // Ignore
        }
        // Check connection method
        let connMethod = "";
        if (method === 'WebBLE' && typeof locator === 'object') {
            // Create channel
            this._ricChannel = new RICChannelWebBLE();
            connMethod = 'WebBLE';
        }
        else if (((method === 'WebSocket') || (method === 'wifi')) && (typeof locator === 'string')) {
            // Create channel
            this._ricChannel = new RICChannelWebSocket();
            connMethod = 'WebSocket';
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
            }
            catch (err) {
                RICLog.error('RICConnector.connect - error: ' + err);
            }
            // Events
            if (connOk) {
                this.onConnEvent(RICConnEvent.CONN_CONNECTED_RIC);
            }
            else {
                // Failed Event
                this.onConnEvent(RICConnEvent.CONN_CONNECTION_FAILED);
            }
            // Subscribe for updates if required
            if (this._ricChannel.requiresSubscription()) {
                try {
                    await this.subscribeForUpdates(true);
                    RICLog.info(`connect subscribed for updates`);
                }
                catch (error) {
                    RICLog.warn(`connect subscribe for updates failed ${error}`);
                }
            }
        }
        else {
            this._channelConnMethod = "";
        }
        return connOk;
    }
    async disconnect() {
        // Disconnect
        this._retryIfLostIsConnected = false;
        if (this._ricChannel) {
            // await this.sendRICRESTMsg("bledisc", {});
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
    async sendRICRESTMsg(commandName, params) {
        try {
            // Format the paramList as query string
            const paramEntries = Object.entries(params);
            let paramQueryStr = '';
            for (const param of paramEntries) {
                if (paramQueryStr.length > 0)
                    paramQueryStr += '&';
                paramQueryStr += param[0] + '=' + param[1];
            }
            // Format the url to send
            if (paramQueryStr.length > 0)
                commandName += '?' + paramQueryStr;
            return await this._ricMsgHandler.sendRICRESTURL(commandName);
        }
        catch (error) {
            RICLog.warn(`runCommand failed ${error}`);
            return new RICOKFail();
        }
    }
    // Mark: Rx Message handling -----------------------------------------------------------------------------------------
    onRxReply(msgHandle, msgRsltCode, msgRsltJsonObj) {
        RICLog.verbose(`onRxReply msgHandle ${msgHandle} rsltCode ${msgRsltCode} obj ${JSON.stringify(msgRsltJsonObj)}`);
    }
    onRxUnnumberedMsg(msgRsltJsonObj) {
        RICLog.verbose(`onRxUnnumberedMsg rsltCode obj ${JSON.stringify(msgRsltJsonObj)}`);
        // Inform the file handler
        if ('okto' in msgRsltJsonObj) {
            this._ricFileHandler.onOktoMsg(msgRsltJsonObj.okto);
        }
        else if ('sokto' in msgRsltJsonObj) {
            this._ricStreamHandler.onSoktoMsg(msgRsltJsonObj.sokto);
        }
    }
    // Mark: Published data handling -----------------------------------------------------------------------------------------
    onRxOtherROSSerialMsg(topicID, payload) {
        RICLog.debug(`onRxOtherROSSerialMsg topicID ${topicID} payload ${RICUtils.bufferToHex(payload)}`);
    }
    onRxSmartServo(smartServos) {
        // RICLog.verbose(`onRxSmartServo ${JSON.stringify(smartServos)}`);
        this._ricStateInfo.smartServos = smartServos;
        this._ricStateInfo.smartServosValidMs = Date.now();
    }
    onRxIMU(imuData) {
        // RICLog.verbose(`onRxIMU ${JSON.stringify(imuData)}`);
        this._ricStateInfo.imuData = imuData;
        this._ricStateInfo.imuDataValidMs = Date.now();
    }
    onRxPowerStatus(powerStatus) {
        // RICLog.verbose(`onRxPowerStatus ${JSON.stringify(powerStatus)}`);
        this._ricStateInfo.power = powerStatus;
        this._ricStateInfo.powerValidMs = Date.now();
    }
    onRxAddOnPub(addOnInfo) {
        // RICLog.verbose(`onRxAddOnPub ${JSON.stringify(addOnInfo)}`);
        this._ricStateInfo.addOnInfo = addOnInfo;
        this._ricStateInfo.addOnInfoValidMs = Date.now();
    }
    onRobotStatus(robotStatus) {
        // RICLog.verbose(`onRobotStatus ${JSON.stringify(robotStatus)}`);
        this._ricStateInfo.robotStatus = robotStatus;
        this._ricStateInfo.robotStatusValidMs = Date.now();
    }
    getRICStateInfo() {
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
    async checkCorrectRICStart(ricLedLcdColours) {
        // Set colour pattern checker colours
        const randomColours = this._ledPatternChecker.setup(ricLedLcdColours);
        // Start timer to repeat checking LED pattern
        RICLog.debug(`checkCorrectRICStart: starting LED pattern checker`);
        if (!await this._checkCorrectRICRefreshLEDs()) {
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
    async checkCorrectRICStop(confirmCorrectRIC) {
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
    async _checkCorrectRICRefreshLEDs() {
        // Check LED pattern is active
        if (!this._ledPatternChecker.isActive()) {
            return false;
        }
        // Check connected
        RICLog.debug(`_verificationRepeat getting isConnected`);
        if (!this.isConnected()) {
            console.warn('_verificationRepeat not connected');
            return false;
        }
        // Repeat the LED pattern (RIC times out the LED override after ~10 seconds)
        RICLog.debug(`_verificationRepeat setting pattern`);
        return await this._ledPatternChecker.setRICColors(this._ricMsgHandler, this._ledPatternTimeoutMs);
    }
    _clearLedPatternRefreshTimer() {
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
    async retrieveMartySystemInfo() {
        // Retrieve system info
        try {
            const retrieveResult = await this._ricSystem.retrieveInfo();
            return retrieveResult;
        }
        catch (err) {
            RICLog.error(`retrieveMartySystemInfo: error ${err}`);
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
    async subscribeForUpdates(enable) {
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
            const ricResp = await this._ricMsgHandler.sendRICRESTCmdFrame(enable ? subscribeEnable : subscribeDisable);
            // Debug
            RICLog.debug(`subscribe enable/disable returned ${JSON.stringify(ricResp)}`);
        }
        catch (error) {
            RICLog.warn(`getRICCalibInfo Failed subscribe for updates ${error}`);
        }
    }
    // Mark: Streaming --------------------------------------------------------------------------------
    streamAudio(streamContents, clearExisting, duration) {
        if (this._ricStreamHandler && this.isConnected()) {
            this._ricStreamHandler.streamAudio(streamContents, clearExisting, duration);
        }
    }
    isStreamStarting() {
        return this._ricStreamHandler.isStreamStarting();
    }
    // Mark: Connection performance--------------------------------------------------------------------------
    parkmiller_next(seed) {
        const hi = Math.round(16807 * (seed & 0xffff));
        let lo = Math.round(16807 * (seed >> 16));
        lo += (hi & 0x7fff) << 16;
        lo += hi >> 15;
        if (lo > 0x7fffffff)
            lo -= 0x7fffffff;
        return lo;
    }
    async checkConnPerformance() {
        // Send random blocks of data - these will be ignored by RIC - but will still be counted for performance
        // evaluation
        let prbsState = 1;
        const testData = new Uint8Array(this._testConnPerfBlockSize);
        for (let i = 0; i < this._testConnPerfNumBlocks; i++) {
            testData.set([0, (i >> 24) & 0xff, (i >> 16) & 0xff, (i >> 8) & 0xff, i & 0xff, 0x1f, 0x9d, 0xf4, 0x7a, 0xb5]);
            for (let j = 10; j < this._testConnPerfBlockSize; j++) {
                prbsState = this.parkmiller_next(prbsState);
                testData[j] = prbsState & 0xff;
            }
            if (this._ricChannel) {
                await this._ricChannel.sendTxMsg(testData, false);
            }
        }
        // Wait a little to allow RIC to process the data
        await new Promise(resolve => setTimeout(resolve, this._connPerfRsltDelayMs));
        // Get performance
        const blePerf = await this._ricSystem.getSysModInfoBLEMan();
        if (blePerf) {
            console.log(`startConnPerformanceCheck timer rate = ${blePerf.tBPS}BytesPS`);
            return blePerf.tBPS;
        }
        else {
            throw new Error('checkConnPerformance: failed to get BLE performance');
        }
    }
    // Mark: Connection event --------------------------------------------------------------------------
    onConnEvent(eventEnum, data = undefined) {
        // Handle information clearing on disconnect
        switch (eventEnum) {
            case RICConnEvent.CONN_DISCONNECTED_RIC:
                // Disconnect time
                this._retryIfLostDisconnectTime = Date.now();
                // Check if retry required
                if (this._retryIfLostIsConnected && this._retryIfLostEnabled) {
                    // Indicate connection disrupted
                    if (this._onEventFn) {
                        this._onEventFn("conn", RICConnEvent.CONN_ISSUE_DETECTED, RICConnEventNames[RICConnEvent.CONN_ISSUE_DETECTED]);
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
    _retryConnection() {
        // Check timeout
        if ((this._retryIfLostDisconnectTime !== null) &&
            (Date.now() - this._retryIfLostDisconnectTime < this._retryIfLostForSecs * 1000)) {
            // Set timer to try to reconnect
            setTimeout(async () => {
                // Try to connect
                const isConn = await this._connectToChannel();
                if (!isConn) {
                    this._retryConnection();
                }
                else {
                    // No longer retrying
                    this._retryIfLostDisconnectTime = null;
                    // Indicate connection problem resolved
                    if (this._onEventFn) {
                        this._onEventFn("conn", RICConnEvent.CONN_ISSUE_RESOLVED, RICConnEventNames[RICConnEvent.CONN_ISSUE_RESOLVED]);
                    }
                }
            }, this._retryIfLostRetryDelayMs);
        }
        else {
            // No longer connected after retry timeout
            this._retryIfLostIsConnected = false;
            // Indicate disconnection
            if (this._onEventFn) {
                this._onEventFn("conn", RICConnEvent.CONN_DISCONNECTED_RIC, RICConnEventNames[RICConnEvent.CONN_DISCONNECTED_RIC]);
            }
            // Invalidate connection details
            this._ricSystem.invalidate();
        }
    }
    async _connectToChannel() {
        // Connect
        try {
            if (this._ricChannel) {
                const connected = await this._ricChannel.connect(this._channelConnLocator);
                if (connected) {
                    this._retryIfLostIsConnected = true;
                    return true;
                }
            }
        }
        catch (error) {
            RICLog.error(`RICConnector.connect() error: ${error}`);
        }
        return false;
    }
    // Mark: OTA Update -----------------------------------------------------------------------------------------
    _onUpdateEvent(eventEnum, data = undefined) {
        // Notify
        if (this._onEventFn) {
            this._onEventFn("ota", eventEnum, RICUpdateEventNames[eventEnum], data);
        }
    }
    async otaUpdateCheck() {
        if (!this._ricUpdateManager)
            return RICUpdateEvent.UPDATE_NOT_CONFIGURED;
        return await this._ricUpdateManager.checkForUpdate(this._ricSystem.getCachedSystemInfo());
    }
    async otaUpdateStart() {
        if (!this._ricUpdateManager)
            return RICUpdateEvent.UPDATE_NOT_CONFIGURED;
        return await this._ricUpdateManager.firmwareUpdate();
    }
    async otaUpdateCancel() {
        if (!this._ricUpdateManager)
            return;
        return await this._ricUpdateManager.firmwareUpdateCancel();
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
    async setAddOnConfig(serialNo, newName) {
        try {
            const msgRslt = await this._ricMsgHandler.sendRICRESTURL(`addon/set?SN=${serialNo}&name=${newName}`);
            return msgRslt;
        }
        catch (error) {
            return new RICOKFail();
        }
    }
    /**
     * deleteAddOn - remove an addon from the addonlist on RIC
     * @param serialNo used to identify the add-on
     * @returns Promise<RICOKFail>
     */
    async deleteAddOn(serialNo) {
        try {
            const msgRslt = await this._ricMsgHandler.sendRICRESTURL(`addon/del?SN=${serialNo}`);
            return msgRslt;
        }
        catch (error) {
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
    async identifyAddOn(name) {
        try {
            const msgRslt = await this._ricMsgHandler.sendRICRESTURL(`elem/${name}/json?cmd=raw&hexWr=F8`);
            return msgRslt;
        }
        catch (error) {
            return new RICOKFail();
        }
    }
}
