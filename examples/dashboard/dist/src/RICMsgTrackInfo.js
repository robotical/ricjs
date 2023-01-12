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
    static MAX_MSG_NUM = 255;
    static MSG_RESPONSE_TIMEOUT_MS = 5000;
    static MSG_RETRY_COUNT = 5;
    msgOutstanding = false;
    msgFrame = new Uint8Array();
    msgSentMs = 0;
    retryCount = 0;
    withResponse = false;
    msgHandle = 0;
    msgTimeoutMs = undefined;
    resolve;
    reject;
    constructor() {
        this.msgOutstanding = false;
    }
    set(msgOutstanding, msgFrame, withResponse, msgHandle, msgTimeoutMs, resolve, reject) {
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
