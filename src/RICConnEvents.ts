/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export enum RICConnEvent {
    CONN_CONNECTING_RIC,
    CONN_CONNECTED_RIC,
    CONN_CONNECTION_FAILED,
    CONN_DISCONNECTED_RIC,
    CONN_REJECTED_RIC,
    CONN_ISSUE_DETECTED,
    CONN_ISSUE_RESOLVED,
    CONN_VERIFYING_CORRECT_RIC,
    CONN_VERIFIED_CORRECT_RIC,
    CONN_GETTING_RIC_INFO,
    CONN_GOT_RIC_INFO,
    CONN_BLUETOOTH_STATE,
}

export const RICConnEventNames = {
    [RICConnEvent.CONN_CONNECTING_RIC]: 'CONNECTING_RIC',
    [RICConnEvent.CONN_CONNECTED_RIC]: 'CONNECTED_RIC',
    [RICConnEvent.CONN_CONNECTION_FAILED]: 'CONNECTION_FAILED',
    [RICConnEvent.CONN_DISCONNECTED_RIC]: 'DISCONNECTED_RIC',
    [RICConnEvent.CONN_REJECTED_RIC]: 'REJECTED_RIC',
    [RICConnEvent.CONN_ISSUE_DETECTED]: 'ISSUE_DETECTED',
    [RICConnEvent.CONN_ISSUE_RESOLVED]: 'ISSUE_RESOLVED',
    [RICConnEvent.CONN_VERIFYING_CORRECT_RIC]: 'VERIFYING_CORRECT_RIC',
    [RICConnEvent.CONN_VERIFIED_CORRECT_RIC]: 'VERIFIED_CORRECT_RIC',
    [RICConnEvent.CONN_GETTING_RIC_INFO]: 'GETTING_RIC_INFO',
    [RICConnEvent.CONN_GOT_RIC_INFO]: 'GOT_RIC_INFO',
    [RICConnEvent.CONN_BLUETOOTH_STATE]: 'BLUETOOTH_STATE',
};
  
export type RICConnEventFn = (
  eventType: RICConnEvent,
  data?: object | string | null,
) => void;
