/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export var RICUpdateEvent;
(function (RICUpdateEvent) {
    RICUpdateEvent[RICUpdateEvent["UPDATE_CANT_REACH_SERVER"] = 0] = "UPDATE_CANT_REACH_SERVER";
    RICUpdateEvent[RICUpdateEvent["UPDATE_APP_UPDATE_REQUIRED"] = 1] = "UPDATE_APP_UPDATE_REQUIRED";
    RICUpdateEvent[RICUpdateEvent["UPDATE_IS_AVAILABLE"] = 2] = "UPDATE_IS_AVAILABLE";
    RICUpdateEvent[RICUpdateEvent["UPDATE_NOT_AVAILABLE"] = 3] = "UPDATE_NOT_AVAILABLE";
    RICUpdateEvent[RICUpdateEvent["UPDATE_STARTED"] = 4] = "UPDATE_STARTED";
    RICUpdateEvent[RICUpdateEvent["UPDATE_PROGRESS"] = 5] = "UPDATE_PROGRESS";
    RICUpdateEvent[RICUpdateEvent["UPDATE_PROGRESS_FILESYSTEM"] = 6] = "UPDATE_PROGRESS_FILESYSTEM";
    RICUpdateEvent[RICUpdateEvent["UPDATE_FAILED"] = 7] = "UPDATE_FAILED";
    RICUpdateEvent[RICUpdateEvent["UPDATE_SUCCESS_ALL"] = 8] = "UPDATE_SUCCESS_ALL";
    RICUpdateEvent[RICUpdateEvent["UPDATE_SUCCESS_MAIN_ONLY"] = 9] = "UPDATE_SUCCESS_MAIN_ONLY";
    RICUpdateEvent[RICUpdateEvent["UPDATE_CANCELLING"] = 10] = "UPDATE_CANCELLING";
    RICUpdateEvent[RICUpdateEvent["UPDATE_NOT_CONFIGURED"] = 11] = "UPDATE_NOT_CONFIGURED";
})(RICUpdateEvent || (RICUpdateEvent = {}));
export const RICUpdateEventNames = {
    [RICUpdateEvent.UPDATE_CANT_REACH_SERVER]: 'CANT_REACH_SERVER',
    [RICUpdateEvent.UPDATE_APP_UPDATE_REQUIRED]: 'APP_UPDATE_REQUIRED',
    [RICUpdateEvent.UPDATE_IS_AVAILABLE]: 'IS_AVAILABLE',
    [RICUpdateEvent.UPDATE_NOT_AVAILABLE]: 'NOT_AVAILABLE',
    [RICUpdateEvent.UPDATE_STARTED]: 'STARTED',
    [RICUpdateEvent.UPDATE_PROGRESS]: 'PROGRESS',
    [RICUpdateEvent.UPDATE_PROGRESS_FILESYSTEM]: 'PROGRESS_FILESYSTEM',
    [RICUpdateEvent.UPDATE_FAILED]: 'FAILED',
    [RICUpdateEvent.UPDATE_SUCCESS_ALL]: 'SUCCESS_ALL',
    [RICUpdateEvent.UPDATE_SUCCESS_MAIN_ONLY]: 'SUCCESS_MAIN_ONLY',
    [RICUpdateEvent.UPDATE_CANCELLING]: 'CANCELLING',
    [RICUpdateEvent.UPDATE_NOT_CONFIGURED]: 'NOT_CONFIGURED',
};
