/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
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
  RICSERIAL_MSG_NUM_POS,
  RICSERIAL_PAYLOAD_POS,
  RICSERIAL_PROTOCOL_POS,
  RICREST_REST_ELEM_CODE_POS,
  RICREST_HEADER_PAYLOAD_POS,
  RICREST_FILEBLOCK_FILEPOS_POS,
  RICREST_FILEBLOCK_PAYLOAD_POS,
  RICREST_BRIDGE_PAYLOAD_POS,
  RICREST_BRIDGE_ID_POS,
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
  MSG_PROTOCOL_ROSSERIAL = 0,
  MSG_PROTOCOL_RESERVED_1 = 1,
  MSG_PROTOCOL_RICREST = 2,
  MSG_PROTOCOL_BRIDGE_RICREST = 3,
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
  onRxFileBlock(
    filePos: number,
    fileBlockData: Uint8Array
  ): void;
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
  ): Promise<boolean>;
  sendTxMsgNoAwait(
    msg: Uint8Array,
    sendWithResponse: boolean,
  ): Promise<boolean>;
}

export default class RICMsgHandler {
  // Message numbering and tracking
  private _currentMsgNumber = 1;
  private _currentMsgHandle = 1;
  private _msgTrackInfos: Array<RICMsgTrackInfo> = new Array<RICMsgTrackInfo>(
    RICMsgTrackInfo.MAX_MSG_NUM + 1,
  );
  private _msgTrackTimerMs = 50;
  private _msgTrackLastCheckIdx = 0;

  // report message callback dictionary. Add a callback to subscribe to report messages
  private _reportMsgCallbacks = new Map<string, (report: RICReportMsg) => void>();

  // Interface to inform of message results
  private _msgResultHandler: RICMessageResult | null = null;

  // Interface to send messages
  private _msgSender: RICMessageSender | null = null;

  // Comms stats
  private _commsStats: RICCommsStats;

  // RICMiniHDLC - handles part of RICSerial protocol
  private _miniHDLC: RICMiniHDLC;

  // Add-on manager
  private _addOnManager: RICAddOnManager;

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
    setTimeout(async () => {
      this._onMsgTrackTimer(true);
    }, this._msgTrackTimerMs);

    // HDLC used to encode/decode the RICREST protocol
    this._miniHDLC = new RICMiniHDLC();
    this._miniHDLC.setOnRxFrame(this._onHDLCFrameDecode.bind(this));
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

  reportMsgCallbacksSet(callbackName: string, callback: (report: RICReportMsg) => void): void {
    this._reportMsgCallbacks.set(callbackName, callback);
  }

  reportMsgCallbacksDelete(callbackName: string) {
    this._reportMsgCallbacks.delete(callbackName);
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
    let rxMsgNum = rxMsg[RICSERIAL_MSG_NUM_POS] & 0xff;
    let rxProtocol = rxMsg[RICSERIAL_PROTOCOL_POS] & 0x3f;
    let rxMsgType = (rxMsg[RICSERIAL_PROTOCOL_POS] >> 6) & 0x03;

    // Check for RICREST bridging protocol
    if (rxProtocol == RICCommsMsgProtocol.MSG_PROTOCOL_BRIDGE_RICREST) {

      // Debug
      const bridgeID = rxMsg.length > RICREST_BRIDGE_ID_POS ? rxMsg[RICREST_BRIDGE_ID_POS] : 0;
      RICLog.info(
        `_onHDLCFrameDecode RICREST bridge rx bridgeID ${bridgeID} len ${rxMsg.length}`
      ); 

      // Simply remove the wrapper
      rxMsg = rxMsg.slice(RICREST_BRIDGE_PAYLOAD_POS);

      // Get the message info from the unwrapped message
      rxMsgNum = rxMsg[RICSERIAL_MSG_NUM_POS] & 0xff;
      rxProtocol = rxMsg[RICSERIAL_PROTOCOL_POS] & 0x3f;
      rxMsgType = (rxMsg[RICSERIAL_PROTOCOL_POS] >> 6) & 0x03;
    }

    // Check for RICREST protocol
    if (rxProtocol == RICCommsMsgProtocol.MSG_PROTOCOL_RICREST) {
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
        RICLog.verbose(
          `_onHDLCFrameDecode RICREST rx binary message elemCode ${ricRestElemCode} len ${binMsgLen} data ${RICUtils.bufferToHex(rxMsg)}`,
        );
        if (ricRestElemCode == RICRESTElemCode.RICREST_ELEM_CODE_FILEBLOCK) {
          const filePos = RICUtils.getBEUint32FromBuf(rxMsg, RICSERIAL_PAYLOAD_POS + RICREST_HEADER_PAYLOAD_POS + RICREST_FILEBLOCK_FILEPOS_POS);
          this._msgResultHandler?.onRxFileBlock(
                filePos, 
                rxMsg.slice(RICSERIAL_PAYLOAD_POS + RICREST_HEADER_PAYLOAD_POS + RICREST_FILEBLOCK_PAYLOAD_POS, rxMsg.length));
        }
      }

    // ROSSERIAL
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
          RICLog.verbose(
            `_handleResponseMessages RICREST rslt Ok ${rxMsgNum == 0 ? "unnumbered" : "msgNum " + rxMsgNum.toString()} resp ${msgRsltJsonObj.rslt}`,
          );
          msgRsltCode = RICMsgResultCode.MESSAGE_RESULT_OK;
        } else if (rsltStr === 'fail') {
          msgRsltCode = RICMsgResultCode.MESSAGE_RESULT_FAIL;
          RICLog.warn(
            `_handleResponseMessages RICREST rslt fail ${rxMsgNum == 0 ? "unnumbered" : "msgNum " + rxMsgNum.toString()} resp ${restStr}`,
          );
        } else {
          RICLog.warn(
            `_handleResponseMessages RICREST rslt not recognized ${rxMsgNum == 0 ? "unnumbered" : "msgNum " + rxMsgNum.toString()}resp ${restStr}`,
          );
        }
        
      } else {
        RICLog.warn(
          `_handleResponseMessages RICREST response doesn't contain rslt ${rxMsgNum == 0 ? "unnumbered" : "msgNum " + rxMsgNum.toString()}resp ${restStr}`,
        );
      }

      // Handle matching of request and response
      this.msgTrackingRxRespMsg(rxMsgNum, msgRsltCode, msgRsltJsonObj);

    } catch (excp: unknown) {
      if (excp instanceof Error) {
        RICLog.warn(
          `_handleResponseMessages Failed to parse JSON ${rxMsgNum == 0 ? "unnumbered" : "msgNum " + rxMsgNum.toString()} JSON STR ${restStr} resp ${excp.toString()}`,
        );
      }
    }

  }

  _handleReportMessages(restStr: string): void {
    try {
      const reportMsg: RICReportMsg = JSON.parse(restStr);
      reportMsg.timeReceived = Date.now();
      RICLog.debug(`_handleReportMessages ${JSON.stringify(reportMsg)}`);
      this._reportMsgCallbacks.forEach((callback) => callback(reportMsg));
    } catch (excp: unknown) {
      if (excp instanceof Error) {
        RICLog.warn(
          `_handleReportMessages Failed to parse JSON report ${excp.toString()}`,
        );
      }
    }
  }

  async sendRICRESTURL<T>(
    cmdStr: string,
    bridgeID: number | undefined = undefined,
    msgTimeoutMs: number | undefined = undefined,
  ): Promise<T> {
    // Send
    return this.sendRICREST(
      cmdStr,
      RICRESTElemCode.RICREST_ELEM_CODE_URL,
      bridgeID,
      msgTimeoutMs,
    );
  }

  async sendRICRESTCmdFrame<T>(
    cmdStr: string,
    bridgeID: number | undefined = undefined,
    msgTimeoutMs: number | undefined = undefined,
  ): Promise<T> {
    // Send
    return this.sendRICREST(
      cmdStr,
      RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME,
      bridgeID,
      msgTimeoutMs,
    );
  }

  async sendRICREST<T>(
    cmdStr: string,
    ricRESTElemCode: RICRESTElemCode,
    bridgeID: number | undefined = undefined,
    msgTimeoutMs: number | undefined = undefined,
  ): Promise<T> {
    // Put cmdStr into buffer
    const cmdStrTerm = new Uint8Array(cmdStr.length + 1);
    RICUtils.addStringToBuffer(cmdStrTerm, cmdStr, 0);
    cmdStrTerm[cmdStrTerm.length - 1] = 0;

    // Send
    return this.sendRICRESTBytes(
      cmdStrTerm,
      ricRESTElemCode,
      true,
      bridgeID,
      msgTimeoutMs,
    );
  }

  async sendRICRESTNoResp(
    cmdStr: string,
    ricRESTElemCode: RICRESTElemCode,
    bridgeID: number | undefined = undefined,
  ): Promise<boolean> {

    // Check there is a sender
    if (!this._msgSender) {
      return false;
    }

    // Put cmdStr into buffer
    const cmdBytes = new Uint8Array(cmdStr.length + 1);
    RICUtils.addStringToBuffer(cmdBytes, cmdStr, 0);
    cmdBytes[cmdBytes.length - 1] = 0;

    // Form message
    const cmdMsg = new Uint8Array(cmdBytes.length + RICREST_HEADER_PAYLOAD_POS);
    cmdMsg[RICREST_REST_ELEM_CODE_POS] = ricRESTElemCode;
    cmdMsg.set(cmdBytes, RICREST_HEADER_PAYLOAD_POS);

    // Frame the message
    let framedMsg = this.frameCommsMsg(cmdMsg, 
      RICCommsMsgTypeCode.MSG_TYPE_COMMAND,
      RICCommsMsgProtocol.MSG_PROTOCOL_RICREST,
      true);

    // Wrap if bridged
    if (bridgeID !== undefined) {
      framedMsg = this.bridgeCommsMsg(framedMsg, bridgeID);
    } 
    
    // Encode like HDLC
    const encodedMsg = this._miniHDLC.encode(framedMsg);

    // Send
    if (!await this._msgSender.sendTxMsg(encodedMsg, false)) {
      RICLog.warn(`sendRICRESTNoResp failed to send message`);
      this._commsStats.recordMsgNoConnection();
    }

    return true;
  }

  async sendRICRESTBytes<T>(
    cmdBytes: Uint8Array,
    ricRESTElemCode: RICRESTElemCode,
    withResponse: boolean,
    bridgeID: number | undefined = undefined,
    msgTimeoutMs: number | undefined = undefined,
  ): Promise<T> {
    // Form message
    const cmdMsg = new Uint8Array(cmdBytes.length + RICREST_HEADER_PAYLOAD_POS);
    cmdMsg[RICREST_REST_ELEM_CODE_POS] = ricRESTElemCode;
    cmdMsg.set(cmdBytes, RICREST_HEADER_PAYLOAD_POS);

    // Send
    return this.sendMsgAndWaitForReply<T>(
      cmdMsg,
      RICCommsMsgTypeCode.MSG_TYPE_COMMAND,
      RICCommsMsgProtocol.MSG_PROTOCOL_RICREST,
      withResponse,
      bridgeID,
      msgTimeoutMs,
    );
  }

  async sendMsgAndWaitForReply<T>(
    msgPayload: Uint8Array,
    msgDirection: RICCommsMsgTypeCode,
    msgProtocol: RICCommsMsgProtocol,
    withResponse: boolean,
    bridgeID: number | undefined = undefined,
    msgTimeoutMs: number | undefined,
  ): Promise<T> {

    // Check there is a sender
    if (!this._msgSender) {
      throw new Error('sendMsgAndWaitForReply failed no sender');
    }

    // Frame the message
    let framedMsg = this.frameCommsMsg(msgPayload, msgDirection, msgProtocol, true);

    // Wrap if bridged
    if (bridgeID !== undefined) {
      framedMsg = this.bridgeCommsMsg(framedMsg, bridgeID);
      RICLog.info(`sendMsgAndWaitForReply - bridged idx ${bridgeID}`)
    } else {
      RICLog.info(`sendMsgAndWaitForReply - not bridged`)
    }

    // Encode like HDLC
    const encodedMsg = this._miniHDLC.encode(framedMsg);

    // Debug
    RICLog.info(
      `sendMsgAndWaitForReply ${RICUtils.bufferToHex(encodedMsg)}`,
    );

    // Return a promise that will be resolved when a reply is received or timeout occurs
    const promise = new Promise<T>((resolve, reject) => {

      // Update message tracking
      this.msgTrackingTxCmdMsg<T>(
        encodedMsg,
        withResponse,
        bridgeID,
        msgTimeoutMs,
        resolve,
        reject,
      );
      this._currentMsgHandle++;
    });

    return promise;
  }

  frameCommsMsg(
    msgPayload: Uint8Array,
    msgDirection: RICCommsMsgTypeCode,
    msgProtocol: RICCommsMsgProtocol,
    isNumbered: boolean,
  ): Uint8Array {
    // Header
    const msgBuf = new Uint8Array(
      msgPayload.length + RICSERIAL_PAYLOAD_POS,
    );
    msgBuf[RICSERIAL_MSG_NUM_POS] = isNumbered ? this._currentMsgNumber & 0xff : 0;
    msgBuf[RICSERIAL_PROTOCOL_POS] = (msgDirection << 6) + msgProtocol;

    // Payload
    msgBuf.set(msgPayload, RICSERIAL_PAYLOAD_POS);

    // Return framed message
    return msgBuf;
  }

  bridgeCommsMsg(
    msgBuf: Uint8Array,
    bridgeID: number
  ) {
    // 
    const bridgedMsg = new Uint8Array(msgBuf.length + RICREST_BRIDGE_PAYLOAD_POS);

    // Bridged messages are unnumbered (msgNum == 0)
    bridgedMsg[RICSERIAL_MSG_NUM_POS] = 0;
    bridgedMsg[RICSERIAL_PROTOCOL_POS] = (RICCommsMsgTypeCode.MSG_TYPE_COMMAND << 6) + RICCommsMsgProtocol.MSG_PROTOCOL_BRIDGE_RICREST;
    bridgedMsg[RICREST_BRIDGE_ID_POS] = bridgeID;
    bridgedMsg.set(msgBuf, RICREST_BRIDGE_PAYLOAD_POS);
    return bridgedMsg;
  }

  msgTrackingTxCmdMsg<T>(
    msgFrame: Uint8Array,
    withResponse: boolean,
    bridgeID: number | undefined = undefined,
    msgTimeoutMs: number | undefined,
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
      bridgeID,
      this._currentMsgHandle,
      msgTimeoutMs,
      resolve,
      reject,
    );

    // Debug
    RICLog.verbose(
      `msgTrackingTxCmdMsg msgNum ${this._currentMsgNumber
      } msg ${RICUtils.bufferToHex(msgFrame)} sanityCheck ${this._msgTrackInfos[this._currentMsgNumber].msgOutstanding
      }`,
    );
    // RICLog.debug(
    //   `msgTrackingTxCmdMsg msgNum ${this._currentMsgNumber} msgLen ${msgFrame.length}}`,
    // );

    // Stats
    this._commsStats.msgTx();

    // Bump msg number
    if (this._currentMsgNumber == RICMsgTrackInfo.MAX_MSG_NUM) {
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
      if (this._msgResultHandler !== null)
        this._msgResultHandler.onRxUnnumberedMsg(msgRsltJsonObj);
      return;
    }
    if (msgNum > RICMsgTrackInfo.MAX_MSG_NUM) {
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

    // Lookup message in tracking
    const msgHandle = this._msgTrackInfos[msgNum].msgHandle;
    this._msgTrackInfos[msgNum].msgOutstanding = false;

    // Check if message result handler should be informed
    if (this._msgResultHandler !== null) {
      this._msgResultHandler.onRxReply(msgHandle, msgRsltCode, msgRsltObj);
    }

    // Handle reply
    // if (msgRsltCode === RICMsgResultCode.MESSAGE_RESULT_OK) {
    const resolve = this._msgTrackInfos[msgNum].resolve;
    if (resolve) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      RICLog.debug(`_msgCompleted resolve ${msgRsltCode} ${JSON.stringify(msgRsltObj)}`);
      (resolve as ((arg: object | null) => void))(msgRsltObj);
    }
    // } else {
    //   const reject = this._msgTrackInfos[msgNum].reject;
    //   if (reject) {
    //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
    //     try {
    //       RICLog.debug(`_msgCompleted reject rsltCode ${msgRsltCode}`);
    //       // (reject as any)(new Error(`Message failed msgNum ${msgNum} rslt ${msgRsltCode}`));
    //     } catch (excp: unknown) {
    //       RICLog.warn(`_msgCompleted reject ${excp}`);
    //     }
    //   }
    // }

    // No longer waiting for reply
    this._msgTrackInfos[msgNum].resolve = null;
    this._msgTrackInfos[msgNum].reject = null;
  }

  // Check message timeouts
  async _onMsgTrackTimer(chainRecall: boolean): Promise<void> {
   
    if (this._msgSender !== null) {
      // Handle message tracking
      for (let loopIdx = 0; loopIdx < this._msgTrackInfos.length; loopIdx++) {

        // Index to check
        const checkIdx = this._msgTrackLastCheckIdx;
        this._msgTrackLastCheckIdx = (checkIdx + 1) % this._msgTrackInfos.length;
        
        // Check if message is outstanding
        if (!this._msgTrackInfos[checkIdx].msgOutstanding) continue;

        // Get message timeout and ensure valid
        let msgTimeoutMs = this._msgTrackInfos[checkIdx].msgTimeoutMs;
        if (msgTimeoutMs === undefined) {
          msgTimeoutMs = RICMsgTrackInfo.MSG_RESPONSE_TIMEOUT_MS;
        }

        // Check for timeout (or never sent)
        if ((this._msgTrackInfos[checkIdx].retryCount === 0) || (Date.now() > this._msgTrackInfos[checkIdx].msgSentMs + msgTimeoutMs)) {

          // Debug
          RICLog.debug(`msgTrackTimer msgNum ${checkIdx} ${this._msgTrackInfos[checkIdx].retryCount === 0 ? 'first send' : 'timeout - retrying'}`);
          // RICLog.verbose(`msgTrackTimer msg ${RICUtils.bufferToHex(this._msgTrackInfos[i].msgFrame)}`);
    
          // Handle timeout (or first send)
          if (this._msgTrackInfos[checkIdx].retryCount < RICMsgTrackInfo.MSG_RETRY_COUNT) {
            this._msgTrackInfos[checkIdx].retryCount++;
            try {

              // Send the message
              if (!await this._msgSender.sendTxMsg(
                this._msgTrackInfos[checkIdx].msgFrame,
                this._msgTrackInfos[checkIdx].withResponse)) {
                RICLog.warn(`msgTrackTimer Message send failed msgNum ${checkIdx}`);
                this._msgCompleted(checkIdx, RICMsgResultCode.MESSAGE_RESULT_FAIL, null);
                this._commsStats.recordMsgNoConnection();
              }

              // Message sent ok so break here
              break;

            } catch (error: unknown) {
              RICLog.warn(`Retry message failed ${error}`);
            }
            this._commsStats.recordMsgRetry();
            this._msgTrackInfos[checkIdx].msgSentMs = Date.now();
          } else {
            RICLog.warn(
              `msgTrackTimer TIMEOUT msgNum ${checkIdx} after ${RICMsgTrackInfo.MSG_RETRY_COUNT} retries`,
            );
            this._msgCompleted(checkIdx, RICMsgResultCode.MESSAGE_RESULT_TIMEOUT, null);
            this._commsStats.recordMsgTimeout();
          }
        }
      }
    }

    // Call again if required
    if (chainRecall) {
      setTimeout(async () => {
        this._onMsgTrackTimer(true);
      }, this._msgTrackTimerMs);
    }
  }

  encodeFileStreamBlock(blockContents: Uint8Array,
    blockStart: number,
    streamID: number): Uint8Array {
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
    msgBuf[msgBufPos++] = streamID & 0xff;
    msgBuf[msgBufPos++] = (blockStart >> 16) & 0xff;
    msgBuf[msgBufPos++] = (blockStart >> 8) & 0xff;
    msgBuf[msgBufPos++] = blockStart & 0xff;

    // Copy block info
    msgBuf.set(blockContents, msgBufPos);
    return msgBuf;
  }

  async sendFileBlock(
    blockContents: Uint8Array,
    blockStart: number
  ): Promise<boolean> {
    const msgBuf = this.encodeFileStreamBlock(blockContents, blockStart, 0);

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

        // Send
        return this._msgSender.sendTxMsg(
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

  async sendStreamBlock(
    blockContents: Uint8Array,
    blockStart: number,
    streamID: number,
  ): Promise<boolean> {

    // Ensure any waiting messages are sent first
    await this._onMsgTrackTimer(false);

    // Encode message
    const msgBuf = this.encodeFileStreamBlock(blockContents, blockStart, streamID);

    // // Debug
    // RICLog.debug(
    //   `sendStreamBlock frameLen ${msgBuf.length} start ${blockStart} end ${blockEnd} len ${blockLen}`,
    // );

    // Send
    try {
      // Send
      if (this._msgSender) {

        // Wrap into HDLC
        const framedMsg = this._miniHDLC.encode(msgBuf);

        // Send
        return await this._msgSender.sendTxMsg(
          framedMsg,
          true,
          // Platform.OS === 'ios',
        );
      }
    } catch (error: unknown) {
      RICLog.warn(`RICMsgHandler sendStreamBlock error${error}`);
    }
    return false;
  }
}
