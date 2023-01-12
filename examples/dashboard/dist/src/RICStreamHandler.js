/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
import RICLog from './RICLog';
import { RICRESTElemCode, } from './RICMsgHandler';
import { RICStreamType } from './RICTypes';
import { RICConnEvent } from './RICConnEvents';
export default class RICStreamHandler {
    // Queue of audio stream requests
    _streamAudioQueue = [];
    // Stream state
    _streamID = null;
    DEFAULT_MAX_BLOCK_SIZE = 400;
    _maxBlockSize = this.DEFAULT_MAX_BLOCK_SIZE;
    // Handler of messages
    _msgHandler;
    // RICCommsStats
    _commsStats;
    // RICConnector 
    _ricConnector;
    // Cancel flag
    _isCancelled = false;
    // Flow control
    _soktoReceived = false;
    _soktoPos = 0;
    // audio duration
    audioDuration = 0;
    streamingEnded = false;
    _streamIsStarting = false;
    // soundFinishPoint timer
    soundFinishPoint = null;
    constructor(msgHandler, commsStats, ricConnector) {
        this._ricConnector = ricConnector;
        this._msgHandler = msgHandler;
        this._commsStats = commsStats;
        this.onSoktoMsg = this.onSoktoMsg.bind(this);
    }
    // Start streaming audio
    streamAudio(streamContents, clearExisting, audioDuration) {
        if (this._streamIsStarting) {
            RICLog.error(`Unable to start sound, previous stream is still starting`);
            return;
        }
        this.audioDuration = audioDuration;
        // Clear (if required) and add to queue
        if (clearExisting) {
            // clear streaming issue timer
            this.clearFinishPointTimeout();
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
    async streamCancel() {
        this._isCancelled = true;
    }
    // Handle starting of streaming
    _handleStreamStart() {
        // Get next stream
        const stream = this._streamAudioQueue[0];
        this._streamAudioQueue.splice(0, 1);
        if (stream === undefined) {
            return;
        }
        this._streamIsStarting = true;
        // Send stream
        setTimeout(async () => {
            try {
                this._streamAudioSend("audio.mp3", "streamaudio", RICStreamType.RIC_REAL_TIME_STREAM, stream.streamContents);
            }
            catch (error) {
                RICLog.error(`RICStreamHandler._handleStreamStart ${error}`);
                this._streamIsStarting = false;
            }
        }, 0);
    }
    isStreamStarting() {
        return this._streamIsStarting;
    }
    async _streamAudioSend(streamName, targetEndpoint, streamType, streamContents) {
        // Check if waiting for cancel
        if (this._isCancelled) {
            // Send cancel message
            RICLog.debug('_streamAudioSend cancelling');
            try {
                await this._sendStreamCancelMsg();
            }
            catch (error) {
                RICLog.error(`RICStreamHandler._streamAudioSend ${error}`);
            }
            // Clear state
            this._streamID = null;
            this._isCancelled = false;
        }
        // Send file start message
        if (await this._sendStreamStartMsg(streamName, targetEndpoint, streamType, streamContents)) {
            this._streamIsStarting = false;
            // Send contents
            if (await this._sendStreamContents(streamContents)) {
                // Send file end
                await this._sendStreamEndMsg(this._streamID);
            }
        }
        this._streamIsStarting = false;
        // Check if any more audio to play
        if (this._streamAudioQueue.length > 0) {
            this._handleStreamStart();
        }
        // Complete
        return true;
    }
    clearFinishPointTimeout() {
        if (this.soundFinishPoint) {
            clearTimeout(this.soundFinishPoint);
            this.soundFinishPoint = null;
        }
    }
    streamingPerformanceChecker() {
        if (this.audioDuration) {
            this.soundFinishPoint = setTimeout(() => {
                // if the streaming hasn't finished before the end of the audio
                // we can assume we are having streaming issues
                // publish event in case we are having issues
                !this.streamingEnded && this._ricConnector.onConnEvent(RICConnEvent.CONN_STREAMING_ISSUE);
                this.clearFinishPointTimeout();
            }, this.audioDuration + 500);
        }
    }
    // Send the start message
    async _sendStreamStartMsg(streamName, targetEndpoint, streamTypeEnum, streamContents) {
        this.streamingEnded = false;
        // Stream start command message
        const streamType = 'rtstream';
        const cmdMsg = `{"cmdName":"ufStart","reqStr":"ufStart","fileType":"${streamType}","fileName":"${streamName}","endpoint":"${targetEndpoint}","fileLen":${streamContents.length}}`;
        // Debug
        RICLog.debug(`sendStreamStartMsg ${cmdMsg}`);
        // Send
        let streamStartResp = null;
        try {
            streamStartResp = await this._msgHandler.sendRICREST(cmdMsg, RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME);
        }
        catch (err) {
            RICLog.error(`sendStreamStartMsg error ${err}`);
            return false;
        }
        // Extract params
        if (streamStartResp && (streamStartResp.rslt === 'ok')) {
            this._streamID = streamStartResp.streamID;
            this._maxBlockSize = streamStartResp.maxBlockSize || this.DEFAULT_MAX_BLOCK_SIZE;
            this.streamingPerformanceChecker();
            RICLog.verbose(`sendStreamStartMsg streamID ${this._streamID} maxBlockSize ${this._maxBlockSize} streamType ${streamTypeEnum}`);
        }
        else {
            RICLog.warn(`sendStreamStartMsg failed ${streamStartResp ? streamStartResp.rslt : 'no response'}`);
            return false;
        }
        return true;
    }
    async _sendStreamEndMsg(streamID) {
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
            streamEndResp = await this._msgHandler.sendRICREST(cmdMsg, RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME);
        }
        catch (err) {
            RICLog.error(`sendStreamEndMsg error ${err}`);
            return false;
        }
        this.streamingEnded = true;
        return streamEndResp.rslt === 'ok';
    }
    async _sendStreamCancelMsg() {
        // File cancel command message
        const cmdMsg = `{"cmdName":"ufCancel"}`;
        // Debug
        RICLog.debug(`sendStreamCancelMsg ${cmdMsg}`);
        // Send
        return this._msgHandler.sendRICREST(cmdMsg, RICRESTElemCode.RICREST_ELEM_CODE_COMMAND_FRAME);
    }
    async _sendStreamContents(streamContents) {
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
                RICLog.verbose(`sendStreamContents ${Date.now() - streamStartTime}ms soktoReceived for ${streamPos}`);
                this._soktoReceived = false;
            }
            // Send stream block
            const blockSize = Math.min(streamContents.length - streamPos, this._maxBlockSize);
            const block = streamContents.slice(streamPos, streamPos + blockSize);
            if (block.length > 0) {
                const sentOk = await this._msgHandler.sendStreamBlock(block, streamPos, this._streamID);
                this._commsStats.recordStreamBytes(block.length);
                RICLog.verbose(`sendStreamContents ${sentOk ? "OK" : "FAILED"} ${Date.now() - streamStartTime}ms pos ${streamPos} ${blockSize} ${block.length} ${this._soktoPos}`);
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
    onSoktoMsg(soktoPos) {
        // Get how far we've progressed in file
        this._soktoPos = soktoPos;
        this._soktoReceived = true;
        RICLog.verbose(`onSoktoMsg received file up to ${this._soktoPos}`);
    }
}
