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
import { RICOKFail, RICStreamStartResp, RICStreamType } from './RICTypes';

export default class RICStreamHandler {

  // Queue of audio stream requests
  private _streamAudioQueue: {
    streamContents: Uint8Array;
  }[] = [];

  // Stream state
  private _streamID: number | null = null;
  DEFAULT_MAX_BLOCK_SIZE = 400;
  private _maxBlockSize: number = this.DEFAULT_MAX_BLOCK_SIZE;

  // Handler of messages
  private _msgHandler: RICMsgHandler;

  // RICCommsStats
  // private _commsStats: RICCommsStats;

  // Cancel flag
  private _isCancelled = false;

  // Flow control
  private _soktoReceived = false;
  private _soktoPos = 0;

  constructor(msgHandler: RICMsgHandler, _commsStats: RICCommsStats) {
    this._msgHandler = msgHandler;
    // this._commsStats = commsStats;
    this.onSoktoMsg = this.onSoktoMsg.bind(this);
  }

  // Start streaming audio
  streamAudio(streamContents: Uint8Array, clearExisting: boolean): void {
    // Clear (if required) and add to queue
    if (clearExisting) {
      this._streamAudioQueue = [];
      if (this._streamID !== null) {
        this._isCancelled = true;
      }
    }
    this._streamAudioQueue.push({
      streamContents,
    });

    // Check if we need to start streaming
    if (this._streamAudioQueue.length > 0) {
      this._handleStreamStart();
    }
  }

  async streamCancel(): Promise<void> {
    this._isCancelled = true;
  }

  // Handle starting of streaming
  private _handleStreamStart(): void {
    // Get next stream
    const stream = this._streamAudioQueue[0];
    this._streamAudioQueue.splice(0, 1);
    if (stream === undefined) {
      return;
    }

    // Send stream
    setTimeout(async () => {
      try {
        this._streamAudioSend("audio.mp3", "streamaudio", RICStreamType.RIC_REAL_TIME_STREAM, stream.streamContents);
      } catch (error) {
        RICLog.error(`RICStreamHandler._handleStreamStart ${error}`);
      }
    }, 0);
  }

  private async _streamAudioSend(
    streamName: string,
    targetEndpoint: string,
    streamType: RICStreamType,
    streamContents: Uint8Array,
  ): Promise<boolean> {

    // Check if waiting for cancel
    if (this._isCancelled) {
      // Send cancel message
      console.log('_streamAudioSend cancelling');
      try {
        await this._sendStreamCancelMsg();
      } catch (error) {
        RICLog.error(`RICStreamHandler._streamAudioSend ${error}`);
      }
      console.log('_streamAudioSend cancelled');
      // Clear state
      this._streamID = null;
      this._isCancelled = false;
    }

    // Send file start message
    if (await this._sendStreamStartMsg(streamName, targetEndpoint, streamType, streamContents)) {

      // Send contents
      if (await this._sendStreamContents(streamContents)) {
      
        // Send file end
        await this._sendStreamEndMsg(this._streamID);
      }
    }

    // Check if any more audio to play
    if (this._streamAudioQueue.length > 0) {
      this._handleStreamStart();
    }

    // Complete
    return true;
  }

  // Send the start message
  private async _sendStreamStartMsg(
    streamName: string,
    targetEndpoint: string,
    streamTypeEnum: RICStreamType,
    streamContents: Uint8Array,
  ): Promise<boolean> {
    // Stream start command message
    const streamType = 'rtstream';
    const cmdMsg = `{"cmdName":"ufStart","reqStr":"ufStart","fileType":"${streamType}","fileName":"${streamName}","endpoint":"${targetEndpoint}","fileLen":${streamContents.length}}`;

    // Debug
    RICLog.debug(`sendStreamStartMsg ${cmdMsg}`);

    // Send
    let streamStartResp = null;
    try {    
      streamStartResp = await this._msgHandler.sendRICREST<RICStreamStartResp>(
        cmdMsg,
        RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME,
      );
    } catch (err) {
      RICLog.error(`sendStreamStartMsg error ${err}`);
      return false;
    }

    // Extract params
    if (streamStartResp.rslt === 'ok') {
      this._streamID = streamStartResp.streamID;
      this._maxBlockSize = streamStartResp.maxBlockSize || this.DEFAULT_MAX_BLOCK_SIZE;
      RICLog.debug(
        `sendStreamStartMsg streamID ${this._streamID} maxBlockSize ${this._maxBlockSize} streamType ${streamTypeEnum}`,
      );
    } else {
      RICLog.warn(`sendStreamStartMsg failed ${streamStartResp.rslt}`);
      return false;
    }
    return true;
  }

  private async _sendStreamEndMsg(
    streamID: number | null,
  ): Promise<boolean> {
    if (streamID === null) {
      return false;
    }
    // Stram end command message
    const cmdMsg = `{"cmdName":"ufEnd","reqStr":"ufEnd","streamID":${streamID}}`;

    // Debug
    RICLog.debug(`sendStreamEndMsg ${cmdMsg}`);

    // Send
    let streamEndResp = null;
    try {    
      streamEndResp = await this._msgHandler.sendRICREST<RICOKFail>(
        cmdMsg,
        RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME,
      );
    } catch (err) {
      RICLog.error(`sendStreamEndMsg error ${err}`);
      return false;
    }
    return streamEndResp.rslt === 'ok';
  }

  private async _sendStreamCancelMsg(): Promise<RICOKFail> {
    // File cancel command message
    const cmdMsg = `{"cmdName":"ufCancel"}`;

    // Debug
    RICLog.debug(`sendStreamCancelMsg ${cmdMsg}`);

    // Send
    return this._msgHandler.sendRICREST<RICOKFail>(
      cmdMsg,
      RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME,
    );
  }

  private async _sendStreamContents(
    streamContents: Uint8Array,
  ) : Promise<boolean> {

    this._soktoReceived = false;
    this._soktoPos = 0;
    let streamPos = 0;
    const streamStartTime = Date.now();

    // Check streamID is valid
    if (this._streamID === null) {
      return false;
    }

    // Send stream blocks
    while (this._soktoPos < streamContents.length) {

      // Check if cancelled
      if (this._isCancelled) {
        return false;
      }

      // Check for new sokto
      if (this._soktoReceived) {
        streamPos = this._soktoPos;
        RICLog.debug(`sendStreamContents ${Date.now()-streamStartTime}ms soktoReceived for ${streamPos}`);
        this._soktoReceived = false;
      }

      // Send stream block
      const blockSize = Math.min(streamContents.length - streamPos, this._maxBlockSize);
      const block = streamContents.slice(streamPos, streamPos + blockSize);
      if (block.length > 0) {
        const sentOk = await this._msgHandler.sendStreamBlock(block, streamPos, this._streamID);

        RICLog.debug(
          `sendStreamContents ${sentOk ? "OK" : "FAILED"} ${Date.now()-streamStartTime}ms pos ${streamPos} ${blockSize} ${block.length} ${this._soktoPos}`,
        );
        if (!sentOk) {
          return false;
        }
        streamPos += blockSize;
      }

      // Wait to ensure we don't hog the CPU
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    return true;
  }

  onSoktoMsg(soktoPos: number) {
    // Get how far we've progressed in file
    this._soktoPos = soktoPos;
    this._soktoReceived = true;
    RICLog.verbose(`onSoktoMsg received file up to ${this._soktoPos}`);
  }
}
