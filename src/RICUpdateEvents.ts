/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export enum RICUpdateEvent {
    UPDATE_CANT_REACH_SERVER,
    UPDATE_APP_UPDATE_REQUIRED,
    UPDATE_IS_AVAILABLE,
    UPDATE_NOT_AVAILABLE,
    UPDATE_STARTED,
    UPDATE_PROGRESS,
    UPDATE_PROGRESS_FILESYSTEM,
    UPDATE_FAILED,
    UPDATE_SUCCESS_ALL,
    UPDATE_SUCCESS_MAIN_ONLY,
    UPDATE_CANCELLING,
    UPDATE_NOT_CONFIGURED,
    UPDATE_RIC_RECONNECTED,
    UPDATE_RIC_DISCONNECTED
}

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
    [RICUpdateEvent.UPDATE_RIC_RECONNECTED]: 'RIC_RECONNECTED',
    [RICUpdateEvent.UPDATE_RIC_DISCONNECTED]: 'RIC_DISCONNECTED',
};

export type RICUpdateEventFn = (
  eventType: RICUpdateEvent,
  data?: object | string | null,
) => void;
