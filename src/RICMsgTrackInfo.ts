/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export class RICMsgTrackInfo {
  static readonly MAX_MSG_NUM = 255;
  static readonly MSG_RESPONSE_TIMEOUT_MS = 5000;
  static readonly MSG_RETRY_COUNT = 5;
  msgOutstanding = false;
  msgFrame: Uint8Array = new Uint8Array();
  msgSentMs = 0;
  retryCount = 0;
  withResponse = false;
  bridgeID: number | undefined = undefined;
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
    bridgeID: number | undefined = undefined,
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
    this.bridgeID = bridgeID;
    this.msgHandle = msgHandle;
    this.msgTimeoutMs = msgTimeoutMs;
    this.resolve = resolve;
    this.reject = reject;
  }
}
