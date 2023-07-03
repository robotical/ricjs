/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import RICChannel from "./RICChannel";
import WebSocket from "isomorphic-ws";
import RICMsgHandler from "./RICMsgHandler";
import RICLog from "./RICLog";
import RICUtils from "./RICUtils";
import { RICConnEvent, RICConnEventFn } from "./RICConnEvents";

export default class RICChannelWebSocket implements RICChannel {

  // Message handler
  private _ricMsgHandler: RICMsgHandler | null = null;

  // Websocket we are connected to
  private _webSocket: WebSocket | null = null;

  // Last message tx time
  // private _msgTxTimeLast = Date.now();
  // private _msgTxMinTimeBetweenMs = 15;

  // Is connected
  private _isConnected = false;

  // Conn event fn
  private _onConnEvent: RICConnEventFn | null = null;

  // File Handler parameters
  private _requestedBatchAckSize = 10;
  private _requestedFileBlockSize = 500;

  fhBatchAckSize(): number { return this._requestedBatchAckSize; }
  fhFileBlockSize(): number { return this._requestedFileBlockSize; }

  
  // isConnected
  isConnected(): boolean {
    return this._isConnected;
  }

  // Set message handler
  setMsgHandler(ricMsgHandler: RICMsgHandler): void {
    this._ricMsgHandler = ricMsgHandler;
  }

  // WebSocket interfaces require subscription to published messages
  requiresSubscription(): boolean {
    return true;
  }

  // Set onConnEvent handler
  setOnConnEvent(connEventFn: RICConnEventFn): void {
    this._onConnEvent = connEventFn;
  }

  // Get connected locator
  getConnectedLocator(): string | object {
    return this._webSocket;
  }

  // Connect to a device
  async connect(locator: string | object): Promise<boolean> {

    // Debug
    RICLog.debug("RICChannelWebSocket.connect " + locator.toString());

    // Connect
    const connOk = await this._wsConnect("ws://" + locator + "/ws");
    return connOk;
  }

  // Disconnect
  async disconnect(): Promise<void> {
    
    // Not connected
    this._isConnected = false;
    
    // Disconnect websocket
    this._webSocket?.close(1000);

    // Debug
    RICLog.debug(`RICChannelWebSocket.disconnect attempting to close websocket`);
  }

  // Handle notifications
  _onMsgRx(msg: Uint8Array | null): void {

    // Debug
    if (msg !== null) {
      RICLog.verbose(`RICChannelWebSocket._onMsgRx ${RICUtils.bufferToHex(msg)}`);
    }

    // Handle message
    if (msg !== null && this._ricMsgHandler) {
      this._ricMsgHandler.handleNewRxMsg(msg);
    }

  }

  // Send a message
  async sendTxMsg(
    msg: Uint8Array,
    sendWithResponse: boolean
  ): Promise<boolean> {

    // Check connected
    if (!this._isConnected)
      return false;

    // Debug
    RICLog.verbose(`RICChannelWebSocket.sendTxMsg ${msg.toString()} sendWithResp ${sendWithResponse.toString()}`);

    // Send over websocket
    try {
      await this._webSocket?.send(msg);
    } catch (error: unknown) {
      RICLog.warn(`RICChannelWebSocket.sendTxMsg - send failed ${error}`);
      return false;
    }
    return true;
  }

  async sendTxMsgNoAwait(
    msg: Uint8Array,
    sendWithResponse: boolean
  ): Promise<boolean> {

    // Check connected
    if (!this._isConnected)
      return false;

    // Debug
    RICLog.verbose(`RICChannelWebSocket.sendTxMsgNoAwait ${msg.toString()} sendWithResp ${sendWithResponse.toString()}`);

    // Send over websocket
    this._webSocket?.send(msg);

    return true;
  }

  async _wsConnect(locator: string | object): Promise<boolean> {

    // Check already connected
    if (await this.isConnected()) {
      return true;
    }

    // Form websocket address
    const wsURL = locator.toString();

    // Connect to websocket
    // try {
    //     this._webSocket = await this._webSocketOpen(wsURL);
    // } catch (error: any) {
    //     RICLog.debug(`Unable to create WebSocket ${error.toString()}`);
    //     return false;
    // }
    this._webSocket = null;
    return new Promise((resolve: (value: boolean | PromiseLike<boolean>) => void,
      reject: (reason?: unknown) => void) => {
      this._webSocketOpen(wsURL).then((ws) => {
        this._webSocket = ws;
        RICLog.debug(`_wsConnect - opened connection`);

        // Handle messages
        this._webSocket.onmessage = (evt: WebSocket.MessageEvent) => {
          // RICLog.debug("WebSocket rx");
          if (evt.data instanceof ArrayBuffer) {
            const msg = new Uint8Array(evt.data);
            this._onMsgRx(msg);
          }
        }

        // Handle close event
        this._webSocket.onclose = (evt: WebSocket.CloseEvent) => {
          RICLog.info(`_wsConnect - closed code ${evt.code} wasClean ${evt.wasClean} reason ${evt.reason}`);
          this._webSocket = null;
          this._isConnected = false;

          // Event handler
          if (this._onConnEvent) {
            this._onConnEvent(RICConnEvent.CONN_DISCONNECTED_RIC);
          }
        }

        // Resolve the promise - success
        resolve(true);
      }).catch((err: unknown) => {
        if (err instanceof Error) {
          RICLog.verbose(`WS open failed ${err.toString()}`)
        }
        // Resolve - failed
        reject(false);
      })
    });
  }

  private async _webSocketOpen(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {

      // Debug
      // RICLog.debug('Attempting WebSocket connection');

      // Open the socket
      try {
        const webSocket = new WebSocket(url);

        // Open socket
        webSocket.binaryType = "arraybuffer";
        webSocket.onopen = (_evt: WebSocket.Event) => {
          RICLog.debug(`RICChannelWebSocket._webSocketOpen - onopen ${_evt.toString()}`);
          // // We're connected
          this._isConnected = true;
          resolve(webSocket);
        };
        webSocket.onerror = function (evt: WebSocket.ErrorEvent) {
          RICLog.warn(`RICChannelWebSocket._webSocketOpen - onerror: ${evt.message}`);
          reject(evt);
        }
      } catch (error: unknown) {
        RICLog.warn(`RICChannelWebSocket._webSocketOpen - open failed ${error}`);
        reject(error);
      }
    });
  }
}
