/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export default class RICCommsStats {
  _msgRxCount = 0;
  _msgRxCountInWindow = 0;
  _msgRxLastCalcMs = 0;
  _msgRxRate = 0;
  _msgTooShort = 0;
  _msgTxCount = 0;
  _msgTxCountInWindow = 0;
  _msgTxLastCalcMs = 0;
  _msgTxRate = 0;
  _msgNumCollisions = 0;
  _msgNumUnmatched = 0;
  _msgRoundtripWorstMs = 0;
  _msgRoundtripBestMs = 0;
  _msgRoundtripLastMs = 0;
  _msgTimeout = 0;
  _msgRetry = 0;

  _msgSmartServos = 0;
  _msgIMU = 0;
  _msgPowerStatus = 0;
  _msgAddOnPub = 0;
  _msgRobotStatus = 0;

  _msgSmartServosPS = 0;
  _msgIMUPS = 0;
  _msgPowerStatusPS = 0;
  _msgAddOnPubPS = 0;
  _msgRobotStatusPS = 0;

  _msgSmartServosCountInWindow = 0;
  _msgIMUCountInWindow = 0;
  _msgPowerStatusCountInWindow = 0;
  _msgAddOnPubCountInWindow = 0;
  _msgRobotStatusCountInWindow = 0;

  _msgSmartServosLastCalcMs = 0;
  _msgIMULastCalcMs = 0;
  _msgPowerStatusLastCalcMs = 0;
  _msgAddOnPubLastCalcMs = 0;
  _msgRobotStatusLastCalcMs = 0;

  _msgOtherTopic = 0;
  _msgNoConnection = 0;
  _streamBytes = 0;
  _fileBytes = 0;

  clear() {
    this._msgRxCount = 0;
    this._msgRxCountInWindow = 0;
    this._msgRxLastCalcMs = Date.now();
    this._msgRxRate = 0;
    this._msgTooShort = 0;
    this._msgTxCount = 0;
    this._msgTxCountInWindow = 0;
    this._msgTxLastCalcMs = Date.now();
    this._msgTxRate = 0;
    this._msgNumCollisions = 0;
    this._msgNumUnmatched = 0;
    this._msgRoundtripBestMs = 0;
    this._msgRoundtripWorstMs = 0;
    this._msgRoundtripLastMs = 0;
    this._msgTimeout = 0;
    this._msgRetry = 0;
    this._msgSmartServos = 0;
    this._msgIMU = 0;
    this._msgPowerStatus = 0;
    this._msgAddOnPub = 0;
    this._msgRobotStatus = 0;
    this._msgSmartServosPS = 0;
    this._msgIMUPS = 0;
    this._msgPowerStatusPS = 0;
    this._msgAddOnPubPS = 0;
    this._msgRobotStatusPS = 0;
    this._msgSmartServosCountInWindow = 0;
    this._msgIMUCountInWindow = 0;
    this._msgPowerStatusCountInWindow = 0;
    this._msgAddOnPubCountInWindow = 0;
    this._msgRobotStatusCountInWindow = 0;
    this._msgSmartServosLastCalcMs = Date.now();
    this._msgIMULastCalcMs = Date.now();
    this._msgPowerStatusLastCalcMs = Date.now();
    this._msgAddOnPubLastCalcMs = Date.now();
    this._msgRobotStatusLastCalcMs = Date.now();
    this._msgOtherTopic = 0;
    this._msgNoConnection = 0;
    this._streamBytes = 0;
    this._fileBytes = 0;
  }

  msgRx(): void {
    this._msgRxCount++;
    this._msgRxCountInWindow++;
  }

  getMsgRxRate(): number {
    if (this._msgRxLastCalcMs + 1000 < Date.now()) {
      this._msgRxRate =
        (1000.0 * this._msgRxCountInWindow) /
        (Date.now() - this._msgRxLastCalcMs);
      this._msgRxLastCalcMs = Date.now();
      this._msgRxCountInWindow = 0;
    }
    return this._msgRxRate;
  }

  msgTooShort(): void {
    this._msgTooShort++;
  }

  msgTx(): void {
    this._msgTxCount++;
    this._msgTxCountInWindow++;
  }

  getMsgTxRate(): number {
    if (this._msgTxLastCalcMs + 1000 < Date.now()) {
      this._msgTxRate =
        (1000.0 * this._msgTxCountInWindow) /
        (Date.now() - this._msgTxLastCalcMs);
      this._msgTxLastCalcMs = Date.now();
      this._msgTxCountInWindow = 0;
    }
    return this._msgTxRate;
  }

  getSmartServosRate(): number {
    if (this._msgSmartServosLastCalcMs + 1000 < Date.now()) {
      this._msgSmartServosPS =
        (1000.0 * this._msgSmartServosCountInWindow) /
        (Date.now() - this._msgSmartServosLastCalcMs);
      this._msgSmartServosLastCalcMs = Date.now();
      this._msgSmartServosCountInWindow = 0;
    }
    return this._msgSmartServosPS;
  }

  getIMURate(): number {
    if (this._msgIMULastCalcMs + 1000 < Date.now()) {
      this._msgIMUPS =
        (1000.0 * this._msgIMUCountInWindow) /
        (Date.now() - this._msgIMULastCalcMs);
      this._msgIMULastCalcMs = Date.now();
      this._msgIMUCountInWindow = 0;
    }
    return this._msgIMUPS;
  }

  getPowerStatusRate(): number {
    if (this._msgPowerStatusLastCalcMs + 1000 < Date.now()) {
      this._msgPowerStatusPS =
        (1000.0 * this._msgPowerStatusCountInWindow) /
        (Date.now() - this._msgPowerStatusLastCalcMs);
      this._msgPowerStatusLastCalcMs = Date.now();
      this._msgPowerStatusCountInWindow = 0;
    }
    return this._msgPowerStatusPS;
  }

  getAddOnPubRate(): number {
    if (this._msgAddOnPubLastCalcMs + 1000 < Date.now()) {
      this._msgAddOnPubPS =
        (1000.0 * this._msgAddOnPubCountInWindow) /
        (Date.now() - this._msgAddOnPubLastCalcMs);
      this._msgAddOnPubLastCalcMs = Date.now();
      this._msgAddOnPubCountInWindow = 0;
    }
    return this._msgAddOnPubPS;
  }

  getRobotStatusRate(): number {
    if (this._msgRobotStatusLastCalcMs + 1000 < Date.now()) {
      this._msgRobotStatusPS =
        (1000.0 * this._msgRobotStatusCountInWindow) /
        (Date.now() - this._msgRobotStatusLastCalcMs);
      this._msgRobotStatusLastCalcMs = Date.now();
      this._msgRobotStatusCountInWindow = 0;
    }
    return this._msgRobotStatusPS;
  }

  getRTWorstMs(): number {
    return this._msgRoundtripWorstMs;
  }

  getRTLastMs(): number {
    return this._msgRoundtripLastMs;
  }

  getRTBestMs(): number {
    return this._msgRoundtripBestMs;
  }

  getRetries(): number {
    return this._msgRetry;
  }

  recordMsgNumCollision(): void {
    this._msgNumCollisions++;
  }

  recordMsgNumUnmatched(): void {
    this._msgNumUnmatched++;
  }

  recordMsgResp(roundTripMs: number): void {
    if (this._msgRoundtripWorstMs < roundTripMs)
      this._msgRoundtripWorstMs = roundTripMs;
    if (this._msgRoundtripBestMs == 0 || this._msgRoundtripBestMs > roundTripMs)
      this._msgRoundtripBestMs = roundTripMs;
    this._msgRoundtripLastMs = roundTripMs;
  }

  recordMsgTimeout(): void {
    this._msgTimeout++;
  }

  recordMsgNoConnection(): void {
    this._msgNoConnection++;
  }

  recordMsgRetry(): void {
    this._msgRetry++;
  }

  recordSmartServos(): void {
    this._msgSmartServos++;
    this._msgSmartServosCountInWindow++;
    this.msgRx();
  }

  recordIMU(): void {
    this._msgIMU++;
    this._msgIMUCountInWindow++;
    // Don't call msgRx() as double counting msgs with smartServos
  }

  recordPowerStatus(): void {
    this._msgPowerStatus++;
    this._msgPowerStatusCountInWindow++;
    this.msgRx();
  }

  recordAddOnPub(): void {
    this._msgAddOnPub++;
    this._msgAddOnPubCountInWindow++;
    this.msgRx();
  }

  recordRobotStatus(): void {
    this._msgRobotStatus++;
    this._msgRobotStatusCountInWindow++;
    this.msgRx();
  }

  recordOtherTopic(): void {
    this._msgOtherTopic++;
    this.msgRx();
  }

  recordStreamBytes(bytes: number): void {
    this._streamBytes += bytes;
  }

  recordFileBytes(bytes: number): void {
    this._fileBytes += bytes;
  }
}
