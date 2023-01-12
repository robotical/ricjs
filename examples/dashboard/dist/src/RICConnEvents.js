/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export var RICConnEvent;
(function (RICConnEvent) {
    RICConnEvent[RICConnEvent["CONN_CONNECTING_RIC"] = 0] = "CONN_CONNECTING_RIC";
    RICConnEvent[RICConnEvent["CONN_CONNECTED_RIC"] = 1] = "CONN_CONNECTED_RIC";
    RICConnEvent[RICConnEvent["CONN_CONNECTION_FAILED"] = 2] = "CONN_CONNECTION_FAILED";
    RICConnEvent[RICConnEvent["CONN_DISCONNECTED_RIC"] = 3] = "CONN_DISCONNECTED_RIC";
    RICConnEvent[RICConnEvent["CONN_REJECTED_RIC"] = 4] = "CONN_REJECTED_RIC";
    RICConnEvent[RICConnEvent["CONN_ISSUE_DETECTED"] = 5] = "CONN_ISSUE_DETECTED";
    RICConnEvent[RICConnEvent["CONN_ISSUE_RESOLVED"] = 6] = "CONN_ISSUE_RESOLVED";
    RICConnEvent[RICConnEvent["CONN_VERIFYING_CORRECT_RIC"] = 7] = "CONN_VERIFYING_CORRECT_RIC";
    RICConnEvent[RICConnEvent["CONN_VERIFIED_CORRECT_RIC"] = 8] = "CONN_VERIFIED_CORRECT_RIC";
    RICConnEvent[RICConnEvent["CONN_GETTING_RIC_INFO"] = 9] = "CONN_GETTING_RIC_INFO";
    RICConnEvent[RICConnEvent["CONN_GOT_RIC_INFO"] = 10] = "CONN_GOT_RIC_INFO";
    RICConnEvent[RICConnEvent["CONN_BLUETOOTH_STATE"] = 11] = "CONN_BLUETOOTH_STATE";
    RICConnEvent[RICConnEvent["CONN_STREAMING_ISSUE"] = 12] = "CONN_STREAMING_ISSUE";
})(RICConnEvent || (RICConnEvent = {}));
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
    [RICConnEvent.CONN_STREAMING_ISSUE]: 'CONN_STREAMING_ISSUE',
};
