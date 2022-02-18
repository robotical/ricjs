/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICAddOnBase
// Communications Connector for RIC V2
//
// RIC V2
// Rob Dobson & Chris Greening 2020
// (C) Robotical 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import { ROSSerialAddOnStatus } from './RICROSSerial';
import { RICReportMsg } from './RICTypes';

export default abstract class RICAddOnBase {
  _name = '';
  _deviceTypeID = 0;
  _initCmd: string | null = null;
  constructor(name: string) {
    this._name = name;
  }
  abstract processInit(_dataReceived: RICReportMsg): void;
  abstract processPublishedData(
    addOnID: number,
    statusByte: number,
    rawData: Uint8Array,
  ): ROSSerialAddOnStatus;
}
