/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICCommsStats
// Communications Connector for RIC V2
//
// RIC V2
// Rob Dobson & Chris Greening 2020
// (C) Robotical 2020
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export enum RICCommsStatsDummy {
  RIC_COMMS_STATS_DUMMY_NONE,
}

export class RICCommsStats {
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
  _msgOtherTopic = 0;

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
    this._msgOtherTopic = 0;
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

  recordMsgRetry(): void {
    this._msgRetry++;
  }

  recordSmartServos(): void {
    this._msgSmartServos++;
    this.msgRx();
  }

  recordIMU(): void {
    this._msgIMU++;
    // Don't call msgRx() as double counting msgs with smartServos
  }

  recordPowerStatus(): void {
    this._msgPowerStatus++;
    this.msgRx();
  }

  recordAddOnPub(): void {
    this._msgAddOnPub++;
    this.msgRx();
  }

  recordRobotStatus(): void {
    this._msgRobotStatus++;
    this.msgRx();
  }

  recordOtherTopic(): void {
    this._msgOtherTopic++;
    this.msgRx();
  }
}
