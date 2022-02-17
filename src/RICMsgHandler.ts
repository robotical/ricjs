/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICMsgHandler
// Communications Connector for RIC V2
//
// RIC V2
// Rob Dobson & Chris Greening 2020-2022
// (C) Robotical 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import RICCommsStats from './RICCommsStats';
import { RICMsgTrackInfo } from './RICMsgTrackInfo';
import RICLog from './RICLog';
import RICUtils from './RICUtils';
import {
  RICROSSerial,
  ROSSerialIMU,
  ROSSerialSmartServos,
  ROSSerialPowerStatus,
  ROSSerialAddOnStatusList,
  ROSSerialRobotStatus,
} from './RICROSSerial';
import {
  PROTOCOL_RICREST,
  RICSERIAL_MSG_NUM_POS,
  RICSERIAL_PAYLOAD_POS,
  RICSERIAL_PROTOCOL_POS,
  RICREST_REST_ELEM_CODE_POS,
  RICREST_HEADER_PAYLOAD_POS,
} from './RICProtocolDefs';
import RICMiniHDLC from './RICMiniHDLC';
import RICAddOnManager from './RICAddOnManager';
import { RICReportMsg } from './RICTypes';

// Protocol enums
export enum RICRESTElemCode {
  RICREST_ELEM_CODE_URL,
  RICREST_ELEM_CODE_CMDRESPJSON,
  RICREST_ELEM_CODE_BODY,
  RICREST_ELEM_CODE_COMMAND_FRAME,
  RICREST_ELEM_CODE_FILEBLOCK,
}

export enum RICCommsMsgTypeCode {
  MSG_TYPE_COMMAND,
  MSG_TYPE_RESPONSE,
  MSG_TYPE_PUBLISH,
  MSG_TYPE_REPORT,
}

export enum RICCommsMsgProtocol {
  MSG_PROTOCOL_ROSSERIAL,
  MSG_PROTOCOL_RESERVED_1,
  MSG_PROTOCOL_RICREST,
}

// Message results
export enum RICMsgResultCode {
  MESSAGE_RESULT_TIMEOUT,
  MESSAGE_RESULT_OK,
  MESSAGE_RESULT_FAIL,
  MESSAGE_RESULT_UNKNOWN,
}

export interface RICMessageResult {
  onRxReply(
    msgHandle: number,
    msgRsltCode: RICMsgResultCode,
    msgRsltJsonObj: object | null,
  ): void;
  onRxUnnumberedMsg(msgRsltJsonObj: object): void;
  onRxSmartServo(smartServos: ROSSerialSmartServos): void;
  onRxIMU(imuData: ROSSerialIMU): void;
  onRxPowerStatus(powerStatus: ROSSerialPowerStatus): void;
  onRxAddOnPub(addOnInfo: ROSSerialAddOnStatusList): void;
  onRobotStatus(robotStatus: ROSSerialRobotStatus): void;
  onRxOtherROSSerialMsg(topicID: number, payload: Uint8Array): void;
}

export interface RICMessageSender {
  sendTxMsg(
    msg: Uint8Array,
    sendWithResponse: boolean,
  ): Promise<void>;
  sendTxMsgNoAwait(
    msg: Uint8Array,
    sendWithResponse: boolean,
  ): Promise<boolean>;
}

// Message tracking
const MAX_MSG_NUM = 255;
const MSG_RESPONSE_TIMEOUT_MS = 5000;
const MSG_RETRY_COUNT = 5;

export default class RICMsgHandler {
  // Message numbering and tracking
  _currentMsgNumber = 1;
  _currentMsgHandle = 1;
  _msgTrackInfos: Array<RICMsgTrackInfo> = new Array<RICMsgTrackInfo>(
    MAX_MSG_NUM + 1,
  );
  _msgTrackCheckTimer: ReturnType<typeof setTimeout> | null = null;
  _msgTrackTimerMs = 100;

  // report message callback dictionary. Add a callback to subscribe to report messages
  _reportMsgCallbacks = new Map<string, (report: RICReportMsg) => void>();

  // Interface to inform of message results
  _msgResultHandler: RICMessageResult | null = null;

  // Interface to send messages
  _msgSender: RICMessageSender | null = null;

  // Comms stats
  _commsStats: RICCommsStats;

  // RICMiniHDLC - handles part of RICSerial protocol
  _miniHDLC: RICMiniHDLC;

  // Add-on manager
  _addOnManager: RICAddOnManager;

  // Constructor
  constructor(commsStats: RICCommsStats, addOnManager: RICAddOnManager) {
    this._commsStats = commsStats;
    this._addOnManager = addOnManager;
    RICLog.debug('RICMsgHandler constructor');

    // Message tracking
    for (let i = 0; i < this._msgTrackInfos.length; i++) {
      this._msgTrackInfos[i] = new RICMsgTrackInfo();
    }

    // Timer for checking messages
    this._msgTrackCheckTimer = setTimeout(async () => {
      this._onMsgTrackTimer();
    }, this._msgTrackTimerMs);

    // HDLC used to encode/decode the RICREST protocol
    this._miniHDLC = new RICMiniHDLC();
    this._miniHDLC.onRxFrame = this._onHDLCFrameDecode.bind(this);
  }

  registerForResults(msgResultHandler: RICMessageResult) {
    this._msgResultHandler = msgResultHandler;
  }

  registerMsgSender(RICMessageSender: RICMessageSender) {
    this._msgSender = RICMessageSender;
  }

  handleNewRxMsg(rxMsg: Uint8Array): void {
    this._miniHDLC.addRxBytes(rxMsg);
    // RICLog.verbose(`handleNewRxMsg len ${rxMsg.length} ${RICUtils.bufferToHex(rxMsg)}`)
  }

  _onHDLCFrameDecode(rxMsg: Uint8Array): void {
    // Add to stats
    this._commsStats.msgRx();

    // Validity
    if (rxMsg.length < RICSERIAL_PAYLOAD_POS) {
      this._commsStats.msgTooShort();
      return;
    }

    // RICLog.verbose(`_onHDLCFrameDecode len ${rxMsg.length}`);

    // Decode the RICFrame header
    const rxMsgNum = rxMsg[RICSERIAL_MSG_NUM_POS] & 0xff;
    const rxProtocol = rxMsg[RICSERIAL_PROTOCOL_POS] & 0x3f;
    const rxMsgType = (rxMsg[RICSERIAL_PROTOCOL_POS] >> 6) & 0x03;

    // Decode payload
    if (rxProtocol == PROTOCOL_RICREST) {
      RICLog.verbose(
        `_onHDLCFrameDecode RICREST rx msgNum ${rxMsgNum} msgDirn ${rxMsgType} ${RICUtils.bufferToHex(
          rxMsg,
        )}`,
      );
      // Extract payload
      const ricRestElemCode =
        rxMsg[RICSERIAL_PAYLOAD_POS + RICREST_REST_ELEM_CODE_POS] & 0xff;
      if (
        ricRestElemCode == RICRESTElemCode.RICREST_ELEM_CODE_URL ||
        ricRestElemCode == RICRESTElemCode.RICREST_ELEM_CODE_CMDRESPJSON ||
        ricRestElemCode == RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME
      ) {
        // These are all text-based messages
        const restStr = RICUtils.getStringFromBuffer(
          rxMsg,
          RICSERIAL_PAYLOAD_POS + RICREST_HEADER_PAYLOAD_POS,
          rxMsg.length - RICSERIAL_PAYLOAD_POS - RICREST_HEADER_PAYLOAD_POS - 1,
        );
        RICLog.verbose(
          `_onHDLCFrameDecode RICREST rx elemCode ${ricRestElemCode} ${restStr}`,
        );

        // Check message types
        if (rxMsgType == RICCommsMsgTypeCode.MSG_TYPE_RESPONSE) {

          // Handle response messages
          this._handleResponseMessages(restStr, rxMsgNum);

        } else if (rxMsgType == RICCommsMsgTypeCode.MSG_TYPE_REPORT) {

          // Handle report messages
          this._handleReportMessages(restStr);

        }

      } else {
        const binMsgLen = rxMsg.length - RICSERIAL_PAYLOAD_POS - RICREST_HEADER_PAYLOAD_POS;
        RICLog.debug(
          `_onHDLCFrameDecode RICREST rx binary message elemCode ${ricRestElemCode} len ${binMsgLen}`,
        );
      }
    } else if (rxProtocol == RICCommsMsgProtocol.MSG_PROTOCOL_ROSSERIAL) {
      // Extract ROSSerial messages - decoded messages returned via _msgResultHandler
      RICROSSerial.decode(
        rxMsg,
        RICSERIAL_PAYLOAD_POS,
        this._msgResultHandler,
        this._commsStats,
        this._addOnManager,
      );
    } else {
      RICLog.warn(`_onHDLCFrameDecode unsupported protocol ${rxProtocol}`);
    }
  }

  _handleResponseMessages(restStr: string, rxMsgNum: number): void {
    try {
      let msgRsltCode = RICMsgResultCode.MESSAGE_RESULT_UNKNOWN;
      const msgRsltJsonObj = JSON.parse(restStr);
      if ('rslt' in msgRsltJsonObj) {
        const rsltStr = msgRsltJsonObj.rslt.toLowerCase();
        if (rsltStr === 'ok') {
          msgRsltCode = RICMsgResultCode.MESSAGE_RESULT_OK;
        } else if (rsltStr === 'fail') {
          msgRsltCode = RICMsgResultCode.MESSAGE_RESULT_FAIL;
        } else {
          RICLog.warn(
            `_onHDLCFrameDecode RICREST rslt not recognized ${msgRsltJsonObj.rslt}`,
          );
        }
      } else {
        RICLog.warn(
          `_onHDLCFrameDecode RICREST response doesn't contain rslt ${restStr}`,
        );
      }

      // Handle matching of request and response
      this.msgTrackingRxRespMsg(rxMsgNum, msgRsltCode, msgRsltJsonObj);

    } catch (excp: unknown) {
      if (excp instanceof Error) {
        RICLog.warn(
          `_onHDLCFrameDecode Failed to parse JSON response ${excp.toString()}`,
        );
      }
    }

  }

  _handleReportMessages(restStr: string): void {
    try {
      const reportMsg: RICReportMsg = JSON.parse(restStr);
      reportMsg.timeReceived = Date.now();
      RICLog.verbose(`_onHDLCFrameDecode ${JSON.stringify(reportMsg)}`);
      this._reportMsgCallbacks.forEach((callback) => callback(reportMsg));
    } catch (excp: unknown) {
      if (excp instanceof Error) {
        RICLog.warn(
          `_onHDLCFrameDecode Failed to parse JSON report ${excp.toString()}`,
        );
      }
    }
  }

  async sendRICRESTURL<T>(
    cmdStr: string,
    msgTracking: boolean,
  ): Promise<T> {
    // Send
    return await this.sendRICREST(
      cmdStr,
      RICRESTElemCode.RICREST_ELEM_CODE_URL,
      msgTracking,
    );
  }

  async sendRICREST<T>(
    cmdStr: string,
    ricRESTElemCode: RICRESTElemCode,
    msgTracking: boolean,
  ): Promise<T> {
    // Put cmdStr into buffer
    const cmdStrTerm = new Uint8Array(cmdStr.length + 1);
    RICUtils.addStringToBuffer(cmdStrTerm, cmdStr, 0);
    cmdStrTerm[cmdStrTerm.length - 1] = 0;

    // Send
    return await this.sendRICRESTBytes(
      cmdStrTerm,
      ricRESTElemCode,
      msgTracking,
      true,
    );
  }

  async sendRICRESTBytes<T>(
    cmdBytes: Uint8Array,
    ricRESTElemCode: RICRESTElemCode,
    isNumbered: boolean,
    withResponse: boolean,
  ): Promise<T> {
    // Form message
    const cmdMsg = new Uint8Array(cmdBytes.length + RICREST_HEADER_PAYLOAD_POS);
    cmdMsg[RICREST_REST_ELEM_CODE_POS] = ricRESTElemCode;
    cmdMsg.set(cmdBytes, RICREST_HEADER_PAYLOAD_POS);

    // Send
    return await this.sendCommsMsg(
      cmdMsg,
      RICCommsMsgTypeCode.MSG_TYPE_COMMAND,
      RICCommsMsgProtocol.MSG_PROTOCOL_RICREST,
      isNumbered,
      withResponse
    );
  }

  // TODO - Investigate whether these lint errors are actually an issue
  /* eslint-disable no-async-promise-executor */
  /* eslint-disable @typescript-eslint/no-explicit-any */
  async sendCommsMsg<T>(
    msgPayload: Uint8Array,
    msgDirection: RICCommsMsgTypeCode,
    msgProtocol: RICCommsMsgProtocol,
    isNumbered: boolean,
    withResponse: boolean,
  ): Promise<T> {
    const promise = new Promise<T>(async (resolve, reject) => {
      try {
        // Header
        const msgBuf = new Uint8Array(
          msgPayload.length + RICSERIAL_PAYLOAD_POS,
        );
        msgBuf[0] = isNumbered ? this._currentMsgNumber & 0xff : 0;
        msgBuf[1] = (msgDirection << 6) + msgProtocol;

        // Payload
        msgBuf.set(msgPayload, RICSERIAL_PAYLOAD_POS);

        // Debug
        RICLog.verbose(
          `sendCommsMsg Message tx msgNum ${isNumbered ? this._currentMsgNumber : 'unnumbered'
          } data ${RICUtils.bufferToHex(msgBuf)}`,
        );

        // Wrap into HDLC
        const framedMsg = this._miniHDLC.encode(msgBuf);

        // Update message tracking
        if (isNumbered) {
          this.msgTrackingTxCmdMsg<T>(
            framedMsg,
            withResponse,
            resolve,
            reject,
          );
          this._currentMsgHandle++;
        }

        // Send
        if (this._msgSender) {
          await this._msgSender.sendTxMsg(framedMsg, withResponse);
        }

        // Return msg handle
        if (!isNumbered) {
          (resolve as any)();
        }
      } catch (error: unknown) {
        reject(error);
      }
    });
    promise.catch((error: unknown) => {
      if (error instanceof Error) {
        RICLog.warn(`sendCommsMsg error ${error.toString()}`);
      }
    });
    return promise;
  }
  /* eslint-enable no-async-promise-executor */
  /* eslint-enable @typescript-eslint/no-explicit-any */

  msgTrackingTxCmdMsg<T>(
    msgFrame: Uint8Array,
    withResponse: boolean,
    resolve: (arg: T) => void,
    reject: (reason: Error) => void,
  ): void {
    // Record message re-use of number
    if (this._msgTrackInfos[this._currentMsgNumber].msgOutstanding) {
      this._commsStats.recordMsgNumCollision();
    }

    // Set tracking info
    this._msgTrackInfos[this._currentMsgNumber].set(
      true,
      msgFrame,
      withResponse,
      this._currentMsgHandle,
      resolve,
      reject,
    );

    // Debug
    RICLog.verbose(
      `msgTrackingTxCmdMsg msgNum ${this._currentMsgNumber
      } msg ${RICUtils.bufferToHex(msgFrame)} sanityCheck ${this._msgTrackInfos[this._currentMsgNumber].msgOutstanding
      }`,
    );

    // Stats
    this._commsStats.msgTx();

    // Bump msg number
    if (this._currentMsgNumber == MAX_MSG_NUM) {
      this._currentMsgNumber = 1;
    } else {
      this._currentMsgNumber++;
    }
  }

  msgTrackingRxRespMsg(
    msgNum: number,
    msgRsltCode: RICMsgResultCode,
    msgRsltJsonObj: object,
  ) {
    // Check message number
    if (msgNum == 0) {
      // Callback on unnumbered message
      if (this._msgResultHandler != null)
        this._msgResultHandler.onRxUnnumberedMsg(msgRsltJsonObj);
      return;
    }
    if (msgNum > MAX_MSG_NUM) {
      RICLog.warn('msgTrackingRxRespMsg msgNum > 255');
      return;
    }
    if (!this._msgTrackInfos[msgNum].msgOutstanding) {
      RICLog.warn(`msgTrackingRxRespMsg unmatched msgNum ${msgNum}`);
      this._commsStats.recordMsgNumUnmatched();
      return;
    }

    // Handle message
    RICLog.verbose(
      `msgTrackingRxRespMsg Message response received msgNum ${msgNum}`,
    );
    this._commsStats.recordMsgResp(
      Date.now() - this._msgTrackInfos[msgNum].msgSentMs,
    );
    this._msgCompleted(msgNum, msgRsltCode, msgRsltJsonObj);
  }

  _msgCompleted(
    msgNum: number,
    msgRsltCode: RICMsgResultCode,
    msgRsltObj: object | null,
  ) {
    const msgHandle = this._msgTrackInfos[msgNum].msgHandle;
    this._msgTrackInfos[msgNum].msgOutstanding = false;
    if (this._msgResultHandler !== null) {
      this._msgResultHandler.onRxReply(msgHandle, msgRsltCode, msgRsltObj);
    }
    if (msgRsltCode === RICMsgResultCode.MESSAGE_RESULT_OK) {
      const resolve = this._msgTrackInfos[msgNum].resolve;
      if (resolve) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (resolve as any)(msgRsltObj);
      }
    } else {
      const reject = this._msgTrackInfos[msgNum].reject;
      if (reject) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (reject as any)(new Error(`Message failed ${msgRsltCode}`));
      }
    }
    this._msgTrackInfos[msgNum].resolve = null;
    this._msgTrackInfos[msgNum].reject = null;
  }

  // Check message timeouts
  async _onMsgTrackTimer(): Promise<void> {
    // Check message timeouts
    for (let i = 0; i < MAX_MSG_NUM + 1; i++) {
      if (!this._msgTrackInfos[i].msgOutstanding) continue;
      if (
        Date.now() >
        this._msgTrackInfos[i].msgSentMs + MSG_RESPONSE_TIMEOUT_MS
      ) {
        RICLog.debug(`msgTrackTimer Message response timeout msgNum ${i} retrying`);
        RICLog.verbose(`msgTrackTimer retryMsg ${RICUtils.bufferToHex(this._msgTrackInfos[i].msgFrame)}`);
        if (this._msgTrackInfos[i].retryCount < MSG_RETRY_COUNT) {
          this._msgTrackInfos[i].retryCount++;
          if (
            this._msgSender !== null
          ) {
            try {
              await this._msgSender.sendTxMsg(
                this._msgTrackInfos[i].msgFrame,
                this._msgTrackInfos[i].withResponse,
              );
            } catch (error: unknown) {
              RICLog.warn(`Retry message failed ${error}`);
            }
          }
          this._commsStats.recordMsgRetry();
          this._msgTrackInfos[i].msgSentMs = Date.now();
        } else {
          RICLog.warn(
            `msgTrackTimer TIMEOUT msgNum ${i} after ${MSG_RETRY_COUNT} retries`,
          );
          this._msgCompleted(i, RICMsgResultCode.MESSAGE_RESULT_TIMEOUT, null);
          this._commsStats.recordMsgTimeout();
        }
      }
    }

    // Call again
    this._msgTrackCheckTimer = setTimeout(async () => {
      this._onMsgTrackTimer();
    }, this._msgTrackTimerMs);
  }

  async sendFileBlock(
    blockContents: Uint8Array,
    blockStart: number,
  ): Promise<boolean> {
    // Create entire message buffer (including protocol wrappers)
    const msgBuf = new Uint8Array(
      blockContents.length + 4 + RICREST_HEADER_PAYLOAD_POS + RICSERIAL_PAYLOAD_POS,
    );
    let msgBufPos = 0;

    // RICSERIAL protocol
    msgBuf[msgBufPos++] = 0; // not numbered
    msgBuf[msgBufPos++] =
      (RICCommsMsgTypeCode.MSG_TYPE_COMMAND << 6) +
      RICCommsMsgProtocol.MSG_PROTOCOL_RICREST;

    // RICREST protocol
    msgBuf[msgBufPos++] = RICRESTElemCode.RICREST_ELEM_CODE_FILEBLOCK;

    // Buffer header
    msgBuf[msgBufPos++] = (blockStart >> 24) & 0xff;
    msgBuf[msgBufPos++] = (blockStart >> 16) & 0xff;
    msgBuf[msgBufPos++] = (blockStart >> 8) & 0xff;
    msgBuf[msgBufPos++] = blockStart & 0xff;

    // Copy block info
    msgBuf.set(blockContents, msgBufPos);

    // // Debug
    // RICLog.debug(
    //   `sendFileBlock frameLen ${msgBuf.length} start ${blockStart} end ${blockEnd} len ${blockLen}`,
    // );

    // Send
    try {
      // Send
      if (this._msgSender) {

        // Wrap into HDLC
        const framedMsg = this._miniHDLC.encode(msgBuf);

        // Send without awaiting immediately
        return this._msgSender.sendTxMsgNoAwait(
          framedMsg,
          true,
          // Platform.OS === 'ios',
        );
      }
    } catch (error: unknown) {
      RICLog.warn(`RICMsgHandler sendFileBlock error${error}`);
    }
    return false;
  }
}
