import RICMsgHandler from "./RICMsgHandler";

export default interface RICChannel
{
    isConnected(forceCheck: boolean): boolean;
    connect(locator: string | object): Promise<boolean>;
    disconnect(): Promise<void>;
    setMsgHandler(ricMsgHandler: RICMsgHandler): void;
    sendTxMsg(msg: Uint8Array, sendWithResponse: boolean): Promise<boolean>;
    sendTxMsgNoAwait(msg: Uint8Array, sendWithResponse: boolean): Promise<boolean>;
    setRetryConnectionIfLost(retry: boolean): void;
    requiresSubscription(): boolean;
}