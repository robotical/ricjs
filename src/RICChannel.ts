import RICMsgHandler from "./RICMsgHandler";
import { RICDisconnectHandler } from "./RICTypes";

export default interface RICChannel
{
    isConnected(): boolean;
    connect(locator: string | object): Promise<boolean>;
    disconnect(): Promise<void>;
    setOnDisconnected(disconnectHandler: RICDisconnectHandler): void;
    setMsgHandler(ricMsgHandler: RICMsgHandler): void;
    sendTxMsg(msg: Uint8Array, sendWithResponse: boolean): Promise<boolean>;
    sendTxMsgNoAwait(msg: Uint8Array, sendWithResponse: boolean): Promise<boolean>;
    setRetryConnectionIfLost(retry: boolean): void;
    requiresSubscription(): boolean;
}