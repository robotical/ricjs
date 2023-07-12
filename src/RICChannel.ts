/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import { RICConnEventFn } from "./RICConnEvents";
import RICMsgHandler from "./RICMsgHandler";

export default interface RICChannel
{
    isConnected(): boolean;
    connect(locator: string | object): Promise<boolean>;
    disconnect(): Promise<void>;
    getConnectedLocator(): string | object;
    setOnConnEvent(connEventFn: RICConnEventFn): void;
    setMsgHandler(ricMsgHandler: RICMsgHandler): void;
    sendTxMsg(msg: Uint8Array, sendWithResponse: boolean): Promise<boolean>;
    sendTxMsgNoAwait(msg: Uint8Array, sendWithResponse: boolean): Promise<boolean>;
    requiresSubscription(): boolean;
    fhBatchAckSize(): number;
    fhFileBlockSize(): number;
    pauseConnection(pause: boolean): void;
}