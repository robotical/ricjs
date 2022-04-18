/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import RICLog from './RICLog'
import 
  RICMsgHandler, {
  RICRESTElemCode,
} from './RICMsgHandler';
import {
  RICFileSendType,
  RICFileStartResp,
  RICOKFail,
} from './RICTypes';
import RICCommsStats from './RICCommsStats';

class FileBlockTrackInfo {
  isDone = false;
  prom: Promise<boolean>;
  constructor(prom: Promise<boolean>) {
    this.prom = prom;
    this.prom.then(
      () => {
        // RICLog.debug('send complete');
        this.isDone = true;
      },
      rej => {
        RICLog.debug(`FileBlockTrackInfo send rejected ${rej}`);
        this.isDone = true;
      },
    );
  }
  isComplete() {
    return this.isDone;
  }
  get() {
    return this.prom;
  }
}

export default class RICFileHandler {
  private _msgHandler: RICMsgHandler;

  // Timeouts
  private BLOCK_ACK_TIMEOUT_MS = 30000;

  // Contents of file to send
  private _requestedFileBlockSize = 500;
  private _fileBlockSize = 0;
  private _requestedBatchAckSize = 10;
  private _batchAckSize = 0;

  // File sending flow control
  private _sendWithoutBatchAcks = false;
  private _ackedFilePos = 0;
  private _batchAckReceived = false;
  private _isCancelled = false;

  // RICCommsStats
  private _commsStats: RICCommsStats;

  // Message await list
  private _msgAwaitList: Array<FileBlockTrackInfo> = new Array<FileBlockTrackInfo>();
  private MAX_OUTSTANDING_FILE_BLOCK_SEND_PROMISES = 1;

  constructor(msgHandler: RICMsgHandler, commsStats: RICCommsStats) {
    this._msgHandler = msgHandler;
    this._commsStats = commsStats;
    this._fileBlockSize = this._requestedFileBlockSize;
    this.onOktoMsg = this.onOktoMsg.bind(this);
  }

  async fileSend(
    fileName: string,
    fileType: RICFileSendType,
    fileContents: Uint8Array,
    progressCallback: ((sent: number, total: number, progress: number) => void) | undefined,
  ): Promise<boolean> {
    this._isCancelled = false;

    // Send file start message
    // RICLog.verbose('XXXXXXXXX _sendFileStartMsg start');
    if (!await this._sendFileStartMsg(fileName, fileType, fileContents))
      return false;
    // RICLog.verbose('XXXXXXXXX _sendFileStartMsg done');

    // Send contents
    // RICLog.verbose('XXXXXXXXX _sendFileContents start');
    if (!await this._sendFileContents(fileContents, progressCallback))
      return false;
    // RICLog.verbose('XXXXXXXXX _sendFileContents done');

    // Send file end
    // RICLog.verbose('XXXXXXXXX _sendFileEndMsg start');
    await this._sendFileEndMsg(fileName, fileType, fileContents);
    // RICLog.verbose('XXXXXXXXX _sendFileEndMsg done');

    // Clean up
    await this.awaitOutstandingMsgPromises(true);

    // Complete
    return true;
  }

  async fileSendCancel(): Promise<void> {
    // Await outstanding promises
    await this.awaitOutstandingMsgPromises(true);
    this._isCancelled = true;
  }

  // Send the start message
  async _sendFileStartMsg(
    fileName: string,
    fileType: RICFileSendType,
    fileContents: Uint8Array,
  ): Promise<boolean> {
    // File start command message
    const reqStr =
      fileType == RICFileSendType.RIC_FIRMWARE_UPDATE
        ? 'espfwupdate'
        : 'fileupload';
    const fileDest =
      fileType == RICFileSendType.RIC_FIRMWARE_UPDATE ? 'ricfw' : 'fs';
    const fileLen = fileContents.length;
    const cmdMsg = `{"cmdName":"ufStart","reqStr":"${reqStr}","fileType":"${fileDest}","fileName":"${fileName}","fileLen":${fileLen},"batchMsgSize":${this._requestedFileBlockSize},"batchAckSize":${this._requestedBatchAckSize}}`;

    // Debug
    RICLog.debug(`sendFileStartMsg ${cmdMsg}`);

    // Send
    let fileStartResp = null;
    try {
        fileStartResp = await this._msgHandler.sendRICREST<RICFileStartResp>(
                cmdMsg,
                RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME,
        );
    } catch (err) {
      RICLog.error(`sendFileStartMsg error ${err}`);
      return false;
    }
    if (fileStartResp.rslt !== 'ok') {
      RICLog.error(`sendFileStartMsg error ${fileStartResp.rslt}`);
      return false;
    }

    // Extract params
    if (fileStartResp.batchMsgSize) {
      this._fileBlockSize = fileStartResp.batchMsgSize;
    } else {
      this._fileBlockSize = this._requestedFileBlockSize;
    }
    if (fileStartResp.batchAckSize) {
      this._batchAckSize = fileStartResp.batchAckSize;
    } else {
      this._batchAckSize = this._requestedBatchAckSize;
    }
    RICLog.debug(
      `_fileSendStartMsg fileBlockSize req ${this._requestedFileBlockSize} resp ${fileStartResp.batchMsgSize} actual ${this._fileBlockSize}`,
    );
    RICLog.debug(
      `_fileSendStartMsg batchAckSize req ${this._requestedBatchAckSize} resp ${fileStartResp.batchAckSize} actual ${this._batchAckSize}`,
    );
    return true;
  }

  async _sendFileEndMsg(
    fileName: string,
    fileType: RICFileSendType,
    fileContents: Uint8Array,
  ): Promise<boolean> {
    // File end command message
    const reqStr =
      fileType == RICFileSendType.RIC_FIRMWARE_UPDATE
        ? 'espfwupdate'
        : 'fileupload';
    const fileDest =
      fileType == RICFileSendType.RIC_FIRMWARE_UPDATE ? 'ricfw' : 'fs';
    const fileLen = fileContents.length;
    const cmdMsg = `{"cmdName":"ufEnd","reqStr":"${reqStr}","fileType":"${fileDest}","fileName":"${fileName}","fileLen":${fileLen}}`;

    // Await outstanding promises
    try {
      await this.awaitOutstandingMsgPromises(true);
    } catch (err) {
      // Ignore
    }

    // Send
    let fileEndResp = null;
    try {
      fileEndResp = await this._msgHandler.sendRICREST<RICOKFail>(
        cmdMsg,
        RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME,
      );
    } catch (err) {
      RICLog.error(`sendFileEndMsg error ${err}`);
      return false;
    }
    return fileEndResp.rslt === 'ok';
  }

  async _sendFileCancelMsg(): Promise<void> {
    // File cancel command message
    const cmdMsg = `{"cmdName":"ufCancel"}`;

    // Await outstanding promises
    await this.awaitOutstandingMsgPromises(true);

    // Send
    try {
      return await this._msgHandler.sendRICREST(
        cmdMsg,
        RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME,
      );
    } catch (err) {
      RICLog.error(`sendFileCancelMsg error ${err}`);
    }
  }

  async _sendFileContents(
    fileContents: Uint8Array,
    progressCallback: ((sent: number, total: number, progress: number) => void) | undefined,
  ): Promise<boolean> {
    if (progressCallback) {
      progressCallback(0, fileContents.length, 0);
    }

    this._batchAckReceived = false;
    this._ackedFilePos = 0;

    // Send file blocks
    let progressUpdateCtr = 0;
    while (this._ackedFilePos < fileContents.length) {
      // Sending with or without batches
      if (this._sendWithoutBatchAcks) {
        // Debug
        RICLog.verbose(
          `_sendFileContents NO BATCH ACKS ${progressUpdateCtr} blocks total sent ${this._ackedFilePos} block len ${this._fileBlockSize}`,
        );
        if (!await this._sendFileBlock(fileContents, this._ackedFilePos))
          return false;
        this._ackedFilePos += this._fileBlockSize;
        progressUpdateCtr++;
      } else {
        // NOTE: first batch MUST be of size 1 (not _batchAckSize) because RIC performs a long-running
        // blocking task immediately after receiving the first message in a firmware
        // update - although this could be relaxed for non-firmware update file uploads
        let sendFromPos = this._ackedFilePos;
        const batchSize = sendFromPos == 0 ? 1 : this._batchAckSize;
        for (
          let i = 0;
          i < batchSize && sendFromPos < fileContents.length;
          i++
        ) {
          // Clear old batch acks
          if (i == batchSize - 1) {
            this._batchAckReceived = false;
          }
          // Debug
          // RICLog.debug(
          //   `_sendFileContents sendblock pos ${sendFromPos} len ${this._fileBlockSize} ackedTo ${this._ackedFilePos} fileLen ${fileContents.length}`,
          // );
          if (!await this._sendFileBlock(fileContents, sendFromPos))
            return false;
          sendFromPos += this._fileBlockSize;
        }

        // Wait for response (there is a timeout at the ESP end to ensure a response is always returned
        // even if blocks are dropped on reception at ESP) - the timeout here is for these responses
        // being dropped
        await this.batchAck(this.BLOCK_ACK_TIMEOUT_MS);
        progressUpdateCtr += this._batchAckSize;
      }

      // Show progress
      if ((progressUpdateCtr >= 20) && progressCallback) {
        // Update UI
        progressCallback(
          this._ackedFilePos,
          fileContents.length,
          this._ackedFilePos / fileContents.length,
        );

        // Debug
        RICLog.debug(
          `_sendFileContents ${progressUpdateCtr} blocks sent OkTo ${this._ackedFilePos} block len ${this._fileBlockSize}`,
        );

        // Continue
        progressUpdateCtr = 0;
      }
    }
    return true;
  }

  async batchAck(timeout: number): Promise<void> {
    // Handle acknowledgement to a batch (OkTo message)
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkForAck = async () => {
        if (this._isCancelled) {
          RICLog.debug('checkForAck - cancelling file upload');
          this._isCancelled = false;
          // Send cancel
          await this._sendFileCancelMsg();
          // abort the upload process
          reject(new Error('Update Cancelled'));
          return;
        }
        if (this._batchAckReceived) {
          RICLog.debug(`checkForAck - rx OkTo ${this._ackedFilePos}`);
          this._batchAckReceived = false;
          resolve();
          return;
        } else {
          const now = Date.now();
          if (now - startTime > timeout) {
            RICLog.warn(`checkForAck - time-out no new ack received`);
            reject(new Error('Update failed. Please try again.'));
            return;
          }
          setTimeout(checkForAck, 100);
        }
      };
      checkForAck();
    });
  }

  async _sendFileBlock(
    fileContents: Uint8Array,
    blockStart: number,
  ): Promise<boolean> {
    // Calc block start and end
    const blockEnd = Math.min(
      fileContents.length,
      blockStart + this._fileBlockSize,
    );

    // Check if we need to await a message send promise
    await this.awaitOutstandingMsgPromises(false);

    // Send
    const promRslt = this._msgHandler.sendFileBlock(fileContents.subarray(blockStart, blockEnd), blockStart);
    if (!promRslt) {
      return false;
    }

    // Record
    this._commsStats.recordFileBytes(blockEnd - blockStart);

    // Add to list of pending messages
    this._msgAwaitList.push(new FileBlockTrackInfo(promRslt));

    // Debug
    // RICLog.debug(
    //   `sendFileBlock start ${blockStart} end ${blockEnd} len ${blockLen}`,
    // );
    return true;
  }

  onOktoMsg(fileOkTo: number) {
    // Get how far we've progressed in file
    this._ackedFilePos = fileOkTo;
    this._batchAckReceived = true;
    RICLog.verbose(`onOktoMsg received file up to ${this._ackedFilePos}`);
  }

  async awaitOutstandingMsgPromises(all: boolean): Promise<void> {
    // Check if all outstanding promises to be awaited
    if (all) {
      for (const promRslt of this._msgAwaitList) {
        try {
          await promRslt.get();
        } catch (error: unknown) {
          RICLog.warn(`awaitAll file part send failed ${error}`);
        }
      }
      this._msgAwaitList = [];
    } else {
      // RICLog.debug('Await list len', this._msgAwaitList.length);
      if (
        this._msgAwaitList.length >=
        this.MAX_OUTSTANDING_FILE_BLOCK_SEND_PROMISES
      ) {
        const fileBlockTrackInfo = this._msgAwaitList.shift();
        try {
          if (fileBlockTrackInfo) {
            await fileBlockTrackInfo.get();
          }
        } catch (error: unknown) {
          RICLog.warn(`awaitSome file part send failed ${error}`);
        }
      }
    }
  }
}
