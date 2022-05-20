/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import { ROSSerialAddOnStatus } from './RICROSSerial';
import { RICReportMsg } from './RICTypes';

export default abstract class RICAddOnBase {
  _name = '';
  _typeName = '';
  _whoAmI = "";
  _deviceTypeID = 0;
  _initCmd: string | null = null;
  constructor(name: string, deviceTypeID: number, typeName: string, whoAmI: string) {
    this._name = name;
    this._deviceTypeID = deviceTypeID;
    this._typeName = typeName;
    this._whoAmI = whoAmI;
  }
  abstract processInit(_dataReceived: RICReportMsg): void;
  abstract processPublishedData(
    addOnID: number,
    statusByte: number,
    rawData: Uint8Array,
  ): ROSSerialAddOnStatus;
}
