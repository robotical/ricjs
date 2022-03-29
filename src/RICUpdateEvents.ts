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
    UPDATE_FAILED,
    UPDATE_SUCCESS_ALL,
    UPDATE_SUCCESS_MAIN_ONLY,
    UPDATE_CANCELLING,
}

export const RICUpdateEventNames = {
    [RICUpdateEvent.UPDATE_CANT_REACH_SERVER]: 'CANT_REACH_SERVER',
    [RICUpdateEvent.UPDATE_APP_UPDATE_REQUIRED]: 'APP_UPDATE_REQUIRED',
    [RICUpdateEvent.UPDATE_IS_AVAILABLE]: 'IS_AVAILABLE',
    [RICUpdateEvent.UPDATE_NOT_AVAILABLE]: 'NOT_AVAILABLE',
    [RICUpdateEvent.UPDATE_STARTED]: 'STARTED',
    [RICUpdateEvent.UPDATE_PROGRESS]: 'PROGRESS',
    [RICUpdateEvent.UPDATE_FAILED]: 'FAILED',
    [RICUpdateEvent.UPDATE_SUCCESS_ALL]: 'SUCCESS_ALL',
    [RICUpdateEvent.UPDATE_SUCCESS_MAIN_ONLY]: 'SUCCESS_MAIN_ONLY',
    [RICUpdateEvent.UPDATE_CANCELLING]: 'CANCELLING',
};

export type RICUpdateEventFn = (
  eventType: RICUpdateEvent,
  data?: object | string | null,
) => void;

export interface RICUpdateEventIF {
    onUpdateManagerEvent: RICUpdateEventFn;
}
  