import { RICLog } from './RICLog'
import { RICDataExtractor, RICDataExtractorVarType } from './RICDataExtractor';
import { ROSSerialAddOnStatus } from './RICROSSerial';
import { RICReportMsg } from './RICTypes';

// RIC ADDON CODES
export const RIC_WHOAMI_TYPE_CODE_ADDON_DISTANCE = '00000083';
export const RIC_WHOAMI_TYPE_CODE_ADDON_LIGHT = '00000084';
export const RIC_WHOAMI_TYPE_CODE_ADDON_COLOUR = '00000085';
export const RIC_WHOAMI_TYPE_CODE_ADDON_IRFOOT_V1 = '00000086';
export const RIC_WHOAMI_TYPE_CODE_ADDON_LEDFOOT = '00000087';
export const RIC_WHOAMI_TYPE_CODE_ADDON_LEDARM_V1 = '00000088';
export const RIC_WHOAMI_TYPE_CODE_ADDON_LEDEYE = '00000089';
export const RIC_WHOAMI_TYPE_CODE_ADDON_NOISE = '0000008A';
export const RIC_WHOAMI_TYPE_CODE_ADDON_GRIPSERVO = '0000008B';
export const RIC_WHOAMI_TYPE_CODE_ADDON_IRFOOT_V2 = '0000008C';
export const RIC_WHOAMI_TYPE_CODE_ADDON_LEDARM_V2 = '0000008D';



// Format definitions
const ADDON_IRFOOT_FORMAT_DEF = {
  fields: [
    {
      type: RICDataExtractorVarType.VAR_BOOL,
      suffix: 'Touch',
      atBit: 8,
      bits: 1,
      postMult: 1,
      postAdd: 0,
    },
    {
      type: RICDataExtractorVarType.VAR_BOOL,
      suffix: 'Air',
      atBit: 9,
      bits: 1,
      postMult: 1,
      postAdd: 0,
    },
    {
      type: RICDataExtractorVarType.VAR_UNSIGNED,
      suffix: 'Val',
      atBit: 16,
      bits: 16,
      postMult: 1,
      postAdd: 0,
    },
  ],
};

const ADDON_COLOURSENSOR_FORMAT_DEF = {
  fields: [
    {
      type: RICDataExtractorVarType.VAR_UNSIGNED,
      suffix: 'Clear',
      atBit: 8,
      bits: 8,
      postMult: 1,
      postAdd: 0,
      littleEndian: false,
    },
    {
      type: RICDataExtractorVarType.VAR_UNSIGNED,
      suffix: 'Red',
      atBit: 16,
      bits: 8,
      postMult: 1.65,
      postAdd: 0,
    },
    {
      type: RICDataExtractorVarType.VAR_UNSIGNED,
      suffix: 'Green',
      atBit: 24,
      bits: 8,
      postMult: 1.15,
      postAdd: 0,
    },
    {
      type: RICDataExtractorVarType.VAR_UNSIGNED,
      suffix: 'Blue',
      atBit: 32,
      bits: 8,
      postMult: 1.0,
      postAdd: 0,
    },
    {
      type: RICDataExtractorVarType.VAR_BOOL,
      suffix: 'Touch',
      atBit: 48,
      bits: 1,
      postMult: 1,
      postAdd: 0,
    },
    {
      type: RICDataExtractorVarType.VAR_BOOL,
      suffix: 'Air',
      atBit: 49,
      bits: 1,
      postMult: 1,
      postAdd: 0,
    },
  ],
};

const ADDON_DISTANCESENSOR_FORMAT_DEF = {
  fields: [
    {
      type: RICDataExtractorVarType.VAR_UNSIGNED,
      suffix: 'Reading',
      atBit: 8,
      bits: 16,
      postMult: 1,
      postAdd: 0,
    },
  ],
};

const ADDON_LIGHTSENSOR_FORMAT_DEF = {
  fields: [
    {
      type: RICDataExtractorVarType.VAR_UNSIGNED,
      suffix: 'Reading1',
      atBit: 8,
      bits: 16,
      postMult: 1,
      postAdd: 0,
    },
    {
      type: RICDataExtractorVarType.VAR_UNSIGNED,
      suffix: 'Reading2',
      atBit: 24,
      bits: 16,
      postMult: 1,
      postAdd: 0,
    },
    {
      type: RICDataExtractorVarType.VAR_UNSIGNED,
      suffix: 'Reading3',
      atBit: 40,
      bits: 16,
      postMult: 1,
      postAdd: 0,
    },
  ],
};

const ADDON_NOISESENSOR_FORMAT_DEF = {
  fields: [
    {
      type: RICDataExtractorVarType.VAR_UNSIGNED,
      suffix: 'Smoothed',
      atBit: 8,
      bits: 16,
      postMult: 1,
      postAdd: 0,
    },
    {
      type: RICDataExtractorVarType.VAR_UNSIGNED,
      suffix: 'HighestSinceLastReading',
      atBit: 24,
      bits: 16,
      postMult: 1,
      postAdd: 0,
    },
    {
      type: RICDataExtractorVarType.VAR_UNSIGNED,
      suffix: 'Raw',
      atBit: 40,
      bits: 16,
      postMult: 1,
      postAdd: 0,
    },
  ],
};

export function getHWElemTypeStr(whoAmITypeCode: string | undefined, whoAmI: string | undefined) {
  RICLog.debug(`getting type code for ${whoAmITypeCode}`);
  if (whoAmITypeCode === undefined) {
    return `Undefined whoamiTypeCode`;
  }
  switch (parseInt("0x" + whoAmITypeCode)) {

    case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_GRIPSERVO):
      RICLog.debug("Found Gripper");
      return 'Gripper';

    case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LEDFOOT):
      //RICLog.debug("Found LED Foot");
      return 'DiscoFoot';

    case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LEDARM_V1):
      //RICLog.debug("Found LED Arm");
      return 'DiscoArm';

    case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LEDARM_V2):
      //RICLog.debug("Found LED Arm");
      return 'DiscoArm';

    case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LEDEYE):
      //RICLog.debug("Found LED Eye");
      return 'DiscoEyes';

    case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_IRFOOT_V1):
      return 'IRFoot';

    case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_IRFOOT_V2):
      return 'IRFoot';

    case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_COLOUR):
      return 'ColourSensor';

    case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_DISTANCE):
      return 'DistanceSensor';

    case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_NOISE):
      return 'NoiseSensor';

    case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LIGHT):
      return 'LightSensor';
  }
  return `Unknown (${whoAmI} - ${whoAmITypeCode})`;
}

export abstract class RICAddOnBase {
  _name = '';
  _deviceTypeID = 0;
  _initCmd: string | null = null;
  abstract processInit(_dataReceived: RICReportMsg): void;
  constructor(name: string) {
    this._name = name;
  }
  processPublishedData(
    addOnID: number,
    statusByte: number,
    rawData: Uint8Array,
  ): ROSSerialAddOnStatus {
    RICLog.debug(
      `RICAddOnBase processPub NOT OVERRIDDEN addOnID ${addOnID} statusByte ${statusByte} dataLen ${rawData.length}`,
    );
    return new ROSSerialAddOnStatus();
  }
}

/* eslint no-unused-vars: ['error', { argsIgnorePattern: "^_" }] */
/* eslint-disable @typescript-eslint/no-unused-vars */
/*eslint no-empty-function: ["error", { "allow": ["methods"] }]*/
/* eslint-disable @typescript-eslint/no-empty-function */
export class RICAddOnGripServo extends RICAddOnBase {
  constructor(name: string) {
    super(name);
    this._deviceTypeID = parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_GRIPSERVO);
  }

  processPublishedData(
    addOnID: number,
    statusByte: number,
  ): ROSSerialAddOnStatus {
    // Status to return
    const retStatus = new ROSSerialAddOnStatus();

    // RICLog.debug("RICADDONMANAGER: debugging info");

    // Extract data
    retStatus.id = addOnID;
    retStatus.deviceTypeID = this._deviceTypeID;
    retStatus.name = this._name;
    retStatus.status = statusByte;
    return retStatus;
  }
  processInit(_dataReceived: RICReportMsg): void {
  }
}

export class RICAddOnLEDFoot extends RICAddOnBase {
  constructor(name: string) {
    super(name);
    this._deviceTypeID = parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LEDFOOT);
  }
  processPublishedData(
    addOnID: number,
    statusByte: number,
  ): ROSSerialAddOnStatus {
    // Status to return
    const retStatus = new ROSSerialAddOnStatus();

    // RICLog.debug("RICADDONMANAGER: debugging info");

    // Extract data
    retStatus.id = addOnID;
    retStatus.deviceTypeID = this._deviceTypeID;
    retStatus.name = this._name;
    retStatus.status = statusByte;
    return retStatus;
  }
  processInit(_dataReceived: RICReportMsg): void {
  }
}

export class RICAddOnLEDArm extends RICAddOnBase {
  constructor(name: string, deviceTypeID: number) {
    super(name);
    this._deviceTypeID = deviceTypeID;
  }
  processPublishedData(
    addOnID: number,
    statusByte: number,
  ): ROSSerialAddOnStatus {
    // Status to return
    const retStatus = new ROSSerialAddOnStatus();

    // Extract data
    retStatus.id = addOnID;
    retStatus.deviceTypeID = this._deviceTypeID;
    retStatus.name = this._name;
    retStatus.status = statusByte;
    return retStatus;
  }
  processInit(_dataReceived: RICReportMsg): void {
  }
}

export class RICAddOnLEDEye extends RICAddOnBase {
  constructor(name: string) {
    super(name);
    this._deviceTypeID = parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LEDEYE);
  }
  processPublishedData(
    addOnID: number,
    statusByte: number,
  ): ROSSerialAddOnStatus {
    // Status to return
    const retStatus = new ROSSerialAddOnStatus();

    // Extract data
    retStatus.id = addOnID;
    retStatus.deviceTypeID = this._deviceTypeID;
    retStatus.name = this._name;
    retStatus.status = statusByte;
    return retStatus;
  }
  processInit(_dataReceived: RICReportMsg): void {
  }
}

export class RICAddOnIRFoot extends RICAddOnBase {
  _dataExtractor: RICDataExtractor;
  constructor(name: string, deviceTypeID: number) {
    super(name);
    this._deviceTypeID = deviceTypeID;
    this._dataExtractor = new RICDataExtractor(name, ADDON_IRFOOT_FORMAT_DEF);
  }
  processPublishedData(
    addOnID: number,
    statusByte: number,
    rawData: Uint8Array,
  ): ROSSerialAddOnStatus {
    // Status to return
    const retStatus = new ROSSerialAddOnStatus();

    // Extract data
    retStatus.id = addOnID;
    retStatus.deviceTypeID = this._deviceTypeID;
    retStatus.name = this._name;
    retStatus.status = statusByte;
    retStatus.vals = this._dataExtractor.extractData(rawData);
    return retStatus;
  }
  processInit(_dataReceived: RICReportMsg): void {
  }
}

export class RICAddOnColourSensor extends RICAddOnBase {
  _dataExtractor: RICDataExtractor;
  constructor(name: string) {
    super(name);
    this._deviceTypeID = parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_COLOUR);
    this._dataExtractor = new RICDataExtractor(
      name,
      ADDON_COLOURSENSOR_FORMAT_DEF,
    );
    this._initCmd = `elem/${name}/json?cmd=raw&hexWr=104020&numToRd=20&msgKey=1234`;
  }
  processPublishedData(
    addOnID: number,
    statusByte: number,
    rawData: Uint8Array,
  ): ROSSerialAddOnStatus {
    // Status to return
    const retStatus = new ROSSerialAddOnStatus();

    // Extract data
    retStatus.id = addOnID;
    retStatus.deviceTypeID = this._deviceTypeID;
    retStatus.name = this._name;
    retStatus.status = statusByte;
    retStatus.vals = this._dataExtractor.extractData(rawData);
    return retStatus;
  }

  setCalibration(cal: Array<number>) {
    if (cal.length != 4) {
      console.warn(`Colour sensor calibration function called with ${cal.length} parameters, expected 4`);
    }
    const [c, r, g, b] = cal;
    this._dataExtractor._formatDef.fields[0].postMult = c;
    this._dataExtractor._formatDef.fields[1].postMult = r;
    this._dataExtractor._formatDef.fields[2].postMult = g;
    this._dataExtractor._formatDef.fields[3].postMult = b;
    RICLog.debug(`Setting colour Sensor ${this._name} calibration: ${c}, ${r}, ${g}, ${b}`);
    this._dataExtractor.preCalcs();
  }

  getCalibration(): Array<number> {
    const c = this._dataExtractor._formatDef.fields[0].postMult ? this._dataExtractor._formatDef.fields[0].postMult : 1.0;
    const r = this._dataExtractor._formatDef.fields[1].postMult ? this._dataExtractor._formatDef.fields[1].postMult : 1.0;
    const g = this._dataExtractor._formatDef.fields[2].postMult ? this._dataExtractor._formatDef.fields[2].postMult : 1.0;
    const b = this._dataExtractor._formatDef.fields[3].postMult ? this._dataExtractor._formatDef.fields[3].postMult : 1.0;
    RICLog.debug(`Colour Sensor calibration: ${c}, ${r}, ${g}, ${b}`);
    return [c, r, g, b];
  }

  processInit(dataReceived: RICReportMsg) {
    RICLog.debug(`Addon ${this._name} init data received ${JSON.stringify(dataReceived)}`)
    if (dataReceived.elemName != this._name) {
      RICLog.warn(`Addon init Rx received  for ${this._name} but addon name wrong: ${JSON.stringify(dataReceived)}`);
    }
    if (dataReceived.hexRd) {
      const cal = this.getCalibration();

      for (let i = 0; i < 4; i++) {
        const calRcv = parseInt(dataReceived.hexRd.substring(4 * i, 4), 16);
        if (calRcv > 0) { cal[i] = 255 / calRcv; }
      }

      this.setCalibration(cal);
    }
  }
}

export class RICAddOnDistanceSensor extends RICAddOnBase {
  _dataExtractor: RICDataExtractor;
  constructor(name: string) {
    super(name);
    this._deviceTypeID = parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_DISTANCE);
    this._dataExtractor = new RICDataExtractor(
      name,
      ADDON_DISTANCESENSOR_FORMAT_DEF,
    );
  }
  processPublishedData(
    addOnID: number,
    statusByte: number,
    rawData: Uint8Array,
  ): ROSSerialAddOnStatus {
    // Status to return
    const retStatus = new ROSSerialAddOnStatus();

    // Extract data
    retStatus.id = addOnID;
    retStatus.deviceTypeID = this._deviceTypeID;
    retStatus.name = this._name;
    retStatus.status = statusByte;
    retStatus.vals = this._dataExtractor.extractData(rawData);
    return retStatus;
  }
  processInit(_dataReceived: RICReportMsg): void {
  }
}

export class RICAddOnLightSensor extends RICAddOnBase {
  _dataExtractor: RICDataExtractor;
  constructor(name: string) {
    super(name);
    this._deviceTypeID = parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LIGHT);
    this._dataExtractor = new RICDataExtractor(
      name,
      ADDON_LIGHTSENSOR_FORMAT_DEF,
    );
  }
  processPublishedData(
    addOnID: number,
    statusByte: number,
    rawData: Uint8Array,
  ): ROSSerialAddOnStatus {
    // Status to return
    const retStatus = new ROSSerialAddOnStatus();

    // Extract data
    retStatus.id = addOnID;
    retStatus.deviceTypeID = this._deviceTypeID;
    retStatus.name = this._name;
    retStatus.status = statusByte;
    retStatus.vals = this._dataExtractor.extractData(rawData);
    return retStatus;
  }
  processInit(_dataReceived: RICReportMsg): void {
  }
}

export class RICAddOnNoiseSensor extends RICAddOnBase {
  _dataExtractor: RICDataExtractor;
  constructor(name: string) {
    super(name);
    this._deviceTypeID = parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_NOISE);
    this._dataExtractor = new RICDataExtractor(
      name,
      ADDON_NOISESENSOR_FORMAT_DEF,
    );
  }
  processPublishedData(
    addOnID: number,
    statusByte: number,
    rawData: Uint8Array,
  ): ROSSerialAddOnStatus {
    // Status to return
    const retStatus = new ROSSerialAddOnStatus();

    // Extract data
    retStatus.id = addOnID;
    retStatus.deviceTypeID = this._deviceTypeID;
    retStatus.name = this._name;
    retStatus.status = statusByte;
    retStatus.vals = this._dataExtractor.extractData(rawData);
    return retStatus;
  }
  processInit(_dataReceived: RICReportMsg): void {
  }
}