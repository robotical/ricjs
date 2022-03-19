/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICFileHandler
// Communications Connector for RIC V2
//
// RIC V2
// Rob Dobson & Chris Greening 2020
// (C) Robotical 2020
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import RICLog from './RICLog'
import RICMsgHandler, {
  RICRESTElemCode,
} from './RICMsgHandler';
import RICCommsStats from './RICCommsStats';
import { RICStreamStartResp, RICStreamType } from './RICTypes';

export default class RICStreamHandler {
  _msgHandler: RICMsgHandler;

  // Stream state
  _streamID: number | null = null;
  DEFAULT_MAX_BLOCK_SIZE = 400;
  _maxBlockSize: number = this.DEFAULT_MAX_BLOCK_SIZE;

  // RICCommsStats
  _commsStats: RICCommsStats;

  // Cancel flag
  _isCancelled = false;

  // Flow control
  _soktoReceived = false;
  _soktoPos = 0;

  constructor(msgHandler: RICMsgHandler, commsStats: RICCommsStats) {
    this._msgHandler = msgHandler;
    this._commsStats = commsStats;
    this.onSoktoMsg = this.onSoktoMsg.bind(this);
  }

  async streamBytes(
    dataBytes: Uint8Array,
    streamName: string,
    streamType: RICStreamType,
    targetEndpoint: string,
    progressCallback: ((sent: number, total: number, progress: number) => void) | undefined,
  ): Promise<boolean> {

    RICLog.debug(`streamData ${streamName}`);
    try {
      if (dataBytes) {
        RICLog.debug(`streamFromURL fileBytesLen ${dataBytes.length}`);
        this.streamSend(streamName, targetEndpoint, streamType, dataBytes, progressCallback);
      }
    } catch (err) {
      RICLog.error(`streamBytes ${err}`);
      return false;
    }
    return true;
  }

  async streamSend(
    streamName: string,
    targetEndpoint: string,
    streamType: RICStreamType,
    streamContents: Uint8Array,
    progressCallback: ((sent: number, total: number, progress: number) => void) | undefined,
  ): Promise<boolean> {
    this._isCancelled = false;

    // Send file start message
    await this._sendStreamStartMsg(streamName, targetEndpoint, streamType, streamContents);

    // Send contents
    await this._sendStreamContents(streamContents, progressCallback);

    // Send file end
    await this._sendStreamEndMsg(this._streamID);

    // Complete
    return true;
  }

  async streamSendCancel(): Promise<void> {
    this._isCancelled = true;
  }

  // Send the start message
  async _sendStreamStartMsg(
    streamName: string,
    targetEndpoint: string,
    streamTypeEnum: RICStreamType,
    streamContents: Uint8Array,
  ): Promise<void> {
    // Stream start command message
    const streamType = 'rtstream';
    const cmdMsg = `{"cmdName":"ufStart","reqStr":"ufStart","fileType":"${streamType}","fileName":"${streamName}","endpoint":"${targetEndpoint}","fileLen":${streamContents.length}}`;

    // Debug
    RICLog.debug(`sendStreamStartMsg ${cmdMsg}`);

    // Send
    const streamStartResp = await this._msgHandler.sendRICREST<RICStreamStartResp>(
      cmdMsg,
      RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME,
      true,
    );

    // Extract params
    if (streamStartResp.rslt === 'ok') {
      this._streamID = streamStartResp.streamID;
      this._maxBlockSize = streamStartResp.maxBlockSize || this.DEFAULT_MAX_BLOCK_SIZE;
      RICLog.debug(
        `sendStreamStartMsg streamID ${this._streamID} maxBlockSize ${this._maxBlockSize} streamType ${streamTypeEnum}`,
      );
    } else {
      RICLog.warn(`sendStreamStartMsg failed ${streamStartResp.rslt}`);
    }
  }

  async _sendStreamEndMsg(
    streamID: number | null,
  ): Promise<void> {
    if (streamID === null) {
      return;
    }
    // Stram end command message
    const cmdMsg = `{"cmdName":"ufEnd","reqStr":"ufEnd","streamID":${streamID}}`;

    // Debug
    RICLog.debug(`sendStreamEndMsg ${cmdMsg}`);

    // Send
    return await this._msgHandler.sendRICREST(
      cmdMsg,
      RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME,
      true,
    );
  }

  async _sendStreamCancelMsg(): Promise<void> {
    // File cancel command message
    const cmdMsg = `{"cmdName":"ufCancel"}`;

    // Debug
    RICLog.debug(`sendStreamCancelMsg ${cmdMsg}`);

    // Send
    return await this._msgHandler.sendRICREST(
      cmdMsg,
      RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME,
      true,
    );
  }

  async _sendStreamContents(
    streamContents: Uint8Array,
    progressCallback: ((sent: number, total: number, progress: number) => void) | undefined,
  ) : Promise<void> {
    if (progressCallback) {
      progressCallback(0, streamContents.length, 0);
    }

    this._soktoReceived = false;
    this._soktoPos = 0;
    let streamPos = 0;
    const streamStartTime = Date.now();

    // Send stream blocks
    let progressUpdateCtr = 0;
    while (this._soktoPos < streamContents.length) {

      // Check for new sokto
      if (this._soktoReceived) {
        streamPos = this._soktoPos;
        RICLog.debug(`sendStreamContents ${Date.now()-streamStartTime}ms soktoReceived for ${streamPos}`);
        this._soktoReceived = false;
      }

      // Send stream block
      if (this._isCancelled) {
        await this._sendStreamCancelMsg();
        break;
      }

      const blockSize = Math.min(streamContents.length - streamPos, this._maxBlockSize);
      const block = streamContents.slice(streamPos, streamPos + blockSize);
      if (block.length > 0) {
        await this._msgHandler.sendStreamBlock(block, streamPos);

        RICLog.debug(
          `sendStreamContents ${Date.now()-streamStartTime}ms pos ${streamPos} ${blockSize} ${block.length} ${this._soktoPos}`,
        );

        streamPos += blockSize;
      }

      // Show progress
      progressUpdateCtr++;
      if ((progressUpdateCtr >= 20) && progressCallback) {
        // Update UI
        progressCallback(
          this._soktoPos,
          streamContents.length,
          this._soktoPos / streamContents.length,
        );

        // Debug
        RICLog.verbose(
          `sendStreamContents ${Date.now()-streamStartTime}ms progress ${progressUpdateCtr} sokto ${this._soktoPos} block len ${this._maxBlockSize}`,
        );

        // Continue
        progressUpdateCtr = 0;
      }

      // Wait to ensure we don't hog the CPU
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  onSoktoMsg(soktoPos: number) {
    // Get how far we've progressed in file
    this._soktoPos = soktoPos;
    this._soktoReceived = true;
    RICLog.verbose(`onOktoMsg received file up to ${this._soktoPos}`);
  }
}