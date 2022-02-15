/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICUpdateEvents
// Communications Connector for RIC V2
//
// RIC V2
// Rob Dobson & Chris Greening 2020-2022
// (C) Robotical 2020-2022
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
  
export type RICUpdateEventFn = (
  eventType: RICUpdateEvent,
  data?: object | string | null,
) => Promise<void>;


export interface RICUpdateEventIF {
    onUpdateManagerEvent: RICUpdateEventFn;
  }
  