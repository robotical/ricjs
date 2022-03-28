/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICTypes
// Communications Connector for RIC V2
//
// RIC V2
// Rob Dobson & Chris Greening 2020
// (C) Robotical 2020
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import { RICConnEvent } from './RICConnEvents';
import {
  ROSSerialSmartServos,
  ROSSerialIMU,
  ROSSerialPowerStatus,
  ROSSerialAddOnStatusList,
  ROSSerialRobotStatus,
} from './RICROSSerial';
import { RICUpdateEvent } from './RICUpdateEvents';

export enum RICIFType {
  RIC_INTERFACE_BLE,
  RIC_INTERFACE_WIFI,
}

export enum RICFileSendType {
  RIC_NORMAL_FILE,
  RIC_FIRMWARE_UPDATE,
}

export enum RICStreamType {
  RIC_REAL_TIME_STREAM,
}

export type RICEventFn = (
  eventType: string,
  eventEnum: RICConnEvent | RICUpdateEvent,
  eventName: string,
  data?: object | string | null,
) => void;

export interface RICSubscription {
  remove(): void;
}

export type RICFriendlyName = {
  friendlyName: string;
};

export class RICNameResponse {
  friendlyName = '';
  friendlyNameIsSet = 0;
  req = '';
  rslt = 'commsFail';
}

export class RICSystemInfo {
  rslt = '';
  SystemName = 'Unknown';
  SystemVersion = '0.0.0';
  RicHwRevNo = 0;
}

export class RICCalibInfo {
  rslt = '';
  calDone = 0;
}

export class RICOKFail {
  RIC_OK = 'ok';
  set(rsltFlag: boolean) {
    if (rsltFlag) {
      this.rslt = this.RIC_OK;
    } else {
      this.rslt = 'fail';
    }
  }
  rslt = 'commsFail';
  isOk() {
    return this.rslt === this.RIC_OK;
  }
}

export class RICReportMsg {
  msgType?: string;
  rslt = '';
  timeReceived?: number;
  hexRd?: string;
  elemName?: string;
  IDNo?: number;
  msgKey?: string;
  addr?: number;
  msgBody?: string;
}

export class RICHWFWStat {
  s = '';
  m = '';
  v = '';
  n = '';
  p = 0;
  i = 0;
}

export class RICHWFWUpdRslt {
  req = '';
  rslt = 'commsFail';
  st: RICHWFWStat = new RICHWFWStat();
}

export type RICFWInfo = {
  elemType: string;
  version: string;
  destname: string;
  md5: string;
  releaseNotes: string;
  comments: string;
  updaters: Array<string>;
  downloadUrl: string;
  firmware?: string;
};

export type RICUpdateInfo = {
  rslt: string;
  firmwareVersion: string;
  ricRevision: string;
  files: Array<RICFWInfo>;
  minimumUpdaterVersion: Dictionary<string>;
  note: string;
};

export type RICFileStartResp = {
  rslt: string;
  batchMsgSize: number;
  batchAckSize: number;
};

export type RICStreamStartResp = {
  rslt: string;
  streamID: number;
  maxBlockSize?: number;
};

export class RICStateInfo {
  smartServos: ROSSerialSmartServos = new ROSSerialSmartServos();
  smartServosValidMs = 0;
  imuData: ROSSerialIMU = new ROSSerialIMU();
  imuDataValidMs = 0;
  power: ROSSerialPowerStatus = new ROSSerialPowerStatus();
  powerValidMs = 0;
  addOnInfo: ROSSerialAddOnStatusList = new ROSSerialAddOnStatusList();
  addOnInfoValidMs = 0;
  robotStatus: ROSSerialRobotStatus = new ROSSerialRobotStatus();
  robotStatusValidMs = 0;
}

export type RICFile = {
  name: string;
  size: number;
};

export class RICFileList {
  req = '';
  rslt = 'ok';
  fsName = 'spiffs';
  fsBase = '/spiffs';
  diskSize = 0;
  diskUsed = 0;
  folder = '/spiffs/';
  files: Array<RICFile> = [];
}

/**
 * RICHWElem
 * 
 * @description
 * Information about a hardware element
 * 
 * @field name: string - element name
 * @field type: string - element type
 * @field busName: string - name of bus (e.g. I2C) attached to
 * @field addr: string - address of element on the bus
 * @field addrValid: number - 1 if address is valid
 * @field IDNo: string - unique identifier of element
 * @field whoAmI: string - name of element type
 * @field whoAmITypeCode: string - number of element type
 * @field SN: string - Serial number
 * @field versionStr: string - Version
 * @field commsOk: number - 1 if communications OK
 */
export type RICHWElem = {
  name: string;
  type: string;
  busName: string;
  addr: string;
  addrValid: number;
  IDNo: string;
  whoAmI: string;
  whoAmITypeCode: string;
  SN: string;
  versionStr: string;
  commsOk: number;
};

export class RICHWElemList {
  req = '';
  rslt = 'ok';
  hw: Array<RICHWElem> = [];
}

/**
 * RICAddOn
 * 
 * @description
 * Information about an add-on
 * 
 * @field name: string - Name of add-on
 * @field SN: string - Serial number
 * @field poll: string - polling type ("status")
 * @field pollRd: string - hex data most recently read
 * @field pollHz: number - rate of polling
 */
export type RICAddOn = {
  name: string;
  SN: string;
  poll: string;
  pollRd: number;
  pollHz: number;
};

export class RICAddOnList {
  req = '';
  rslt = 'ok';
  addons: Array<RICAddOn> = [];
}

/**
 * AddOnElemAndConfig
 * 
 * @description
 * Carrier of information about an add-on combining
 * the add-on element and the add-on configuration
 * 
 * @field addOnConfig: RICAddOn - Add-on configuration
 * @field hwElemRec: RICHWElem - Add-on element
 * @field elemIdx: number - Index of the add-on element
 */
export class AddOnElemAndConfig {
  constructor(
    addOnConfig: RICAddOn | null,
    hwElemRec: RICHWElem | null,
    elemIdx: number,
  ) {
    this.isConfigured = addOnConfig !== null;
    this.isConnected = hwElemRec !== null;
    if (addOnConfig != null) {
      this.SN = addOnConfig.SN;
      this.name = addOnConfig.name;
    } else if (hwElemRec != null) {
      this.SN = hwElemRec.SN;
      this.name = hwElemRec.name;
    }
    this.addOnConfig = addOnConfig;
    this.hwElemRec = hwElemRec;
    this.id = elemIdx.toString();
  }

  // Fields from config (stored in RIC NVS using addon REST API)
  addOnConfig: RICAddOn | null = null;
  // Fields from HWElem (from hwstatus command)
  hwElemRec: RICHWElem | null = null;
  // Fields allocated when combining records
  name = '';
  SN = '';
  id = '0';
  isConnected = false;
  isConfigured = false;
}

export class RICSysModInfoBLEMan {
  req? = '';
  rslt = 'ok';
  isConn = false;
  isAdv = false;
  advName? = "";
  BLEMAC = "";
  rxM = 0;
  rxB = 0;
  rxBPS = 0.0;
  txM = 0;
  txB = 0;
  txBPS = 0.0;
  txErr = 0;
  txErrPS = 0;
  tM? = 0;
  tB? = 0;
  tBPS? = 0.0;
  tSeqErrs? = 0;
  tDatErrs? = 0;
}

export type RICProgressCBType = (received: number, total: number) => void;

export class RICFileDownloadResult
{
    fileData: Uint8Array | null = null;
    downloadedOk = false;
}

export interface RICFileDownloadIF {
    // Download file
    downloadFile(downloadUrl: string, progressCB:RICProgressCBType): Promise<RICFileDownloadResult>;
}

export interface Dictionary<T> {
  [key: string]: T;
}
