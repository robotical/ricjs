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

export class RICMsgTrackInfo {
  msgOutstanding = false;
  msgFrame: Uint8Array = new Uint8Array();
  msgSentMs = 0;
  retryCount = 0;
  withResponse = false;
  msgHandle = 0;
  msgTimeoutMs: number | undefined = undefined;
  resolve: unknown;
  reject: unknown;

  constructor() {
    this.msgOutstanding = false;
  }

  set(
    msgOutstanding: boolean,
    msgFrame: Uint8Array,
    withResponse: boolean,
    msgHandle: number,
    msgTimeoutMs: number | undefined,
    resolve: unknown,
    reject: unknown,
  ) {
    this.msgOutstanding = msgOutstanding;
    this.msgFrame = msgFrame;
    this.retryCount = 0;
    this.msgSentMs = Date.now();
    this.withResponse = withResponse;
    this.msgHandle = msgHandle;
    this.msgTimeoutMs = msgTimeoutMs;
    this.resolve = resolve;
    this.reject = reject;
  }
}
