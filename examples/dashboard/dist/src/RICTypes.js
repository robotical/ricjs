/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
import { ROSSerialSmartServos, ROSSerialIMU, ROSSerialPowerStatus, ROSSerialAddOnStatusList, ROSSerialRobotStatus, } from './RICROSSerial';
export var RICIFType;
(function (RICIFType) {
    RICIFType[RICIFType["RIC_INTERFACE_BLE"] = 0] = "RIC_INTERFACE_BLE";
    RICIFType[RICIFType["RIC_INTERFACE_WIFI"] = 1] = "RIC_INTERFACE_WIFI";
})(RICIFType || (RICIFType = {}));
export var RICFileSendType;
(function (RICFileSendType) {
    RICFileSendType[RICFileSendType["RIC_NORMAL_FILE"] = 0] = "RIC_NORMAL_FILE";
    RICFileSendType[RICFileSendType["RIC_FIRMWARE_UPDATE"] = 1] = "RIC_FIRMWARE_UPDATE";
})(RICFileSendType || (RICFileSendType = {}));
export var RICStreamType;
(function (RICStreamType) {
    RICStreamType[RICStreamType["RIC_REAL_TIME_STREAM"] = 0] = "RIC_REAL_TIME_STREAM";
})(RICStreamType || (RICStreamType = {}));
export class RICFriendlyName {
    friendlyName = '';
    friendlyNameIsSet = false;
    req = '';
    rslt = 'commsFail';
    validMs = 0;
}
export class RICSystemInfo {
    rslt = '';
    SystemName = 'Unknown';
    SystemVersion = '0.0.0';
    RicHwRevNo = 0;
    MAC = "";
    SerialNo = "";
    validMs = 0;
}
export class RICCalibInfo {
    rslt = '';
    calDone = 0;
    validMs = 0;
}
export class RICOKFail {
    RIC_OK = 'ok';
    set(rsltFlag) {
        if (rsltFlag) {
            this.rslt = this.RIC_OK;
        }
        else {
            this.rslt = 'fail';
        }
    }
    rslt = 'commsFail';
    isOk() {
        return this.rslt === this.RIC_OK;
    }
}
export class RICReportMsg {
    msgType;
    rslt = '';
    timeReceived;
    hexRd;
    elemName;
    IDNo;
    msgKey;
    addr;
    msgBody;
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
    st = new RICHWFWStat();
}
export class RICStateInfo {
    smartServos = new ROSSerialSmartServos();
    smartServosValidMs = 0;
    imuData = new ROSSerialIMU();
    imuDataValidMs = 0;
    power = new ROSSerialPowerStatus();
    powerValidMs = 0;
    addOnInfo = new ROSSerialAddOnStatusList();
    addOnInfoValidMs = 0;
    robotStatus = new ROSSerialRobotStatus();
    robotStatusValidMs = 0;
}
export class RICFileList {
    req = '';
    rslt = 'ok';
    fsName = 'spiffs';
    fsBase = '/spiffs';
    diskSize = 0;
    diskUsed = 0;
    folder = '/spiffs/';
    files = [];
}
export class RICHWElemList {
    req = '';
    rslt = 'ok';
    hw = [];
}
export class RICHWElemList_Min {
    // Members
    req = '';
    rslt = 'ok';
    hw = [];
    // Method to convert to RICHWElemList
    static expand(hwMin) {
        const hwList = new RICHWElemList();
        for (const hwElem of hwMin.hw) {
            hwList.hw.push({
                name: hwElem.n,
                type: hwElem.t,
                busName: '',
                addr: '',
                addrValid: 0,
                IDNo: hwElem.I,
                whoAmI: hwElem.w,
                whoAmITypeCode: hwElem.W,
                SN: hwElem.S,
                versionStr: hwElem.v,
                commsOk: hwElem.c,
            });
        }
        return hwList;
    }
}
// RICHWElemList containing coded strings for each HWElem field
export class RICHWElemList_Str {
    req = '';
    rslt = 'ok';
    hw = [];
    // Method to convert to RICHWElemList
    static expand(hwStr) {
        const hwList = new RICHWElemList();
        for (const hwElem of hwStr.hw) {
            if (hwElem.a) {
                const hwElemStr = hwElem.a.split('|');
                hwList.hw.push({
                    name: RICHWElemList_Str.unesc(hwElemStr[0]),
                    type: RICHWElemList_Str.unesc(hwElemStr[1]),
                    busName: "",
                    addr: "",
                    addrValid: 0,
                    IDNo: RICHWElemList_Str.unesc(hwElemStr[2]),
                    whoAmI: RICHWElemList_Str.unesc(hwElemStr[3]),
                    whoAmITypeCode: RICHWElemList_Str.unesc(hwElemStr[4]),
                    SN: RICHWElemList_Str.unesc(hwElemStr[5]),
                    versionStr: RICHWElemList_Str.unesc(hwElemStr[6]),
                    commsOk: Number(hwElemStr[7]),
                });
            }
        }
        return hwList;
    }
    // Method to unescape a pipe character
    static unesc(s) {
        return s.replace(/\/x7c/g, '|');
    }
}
export class RICConfiguredAddOns {
    req = '';
    rslt = 'ok';
    addons = [];
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
    constructor(addOnConfig, hwElemRec, elemIdx) {
        this.isConfigured = addOnConfig !== null;
        this.isConnected = hwElemRec !== null;
        if (addOnConfig != null) {
            this.SN = addOnConfig.SN;
            this.name = addOnConfig.name;
        }
        else if (hwElemRec != null) {
            this.SN = hwElemRec.SN;
            this.name = hwElemRec.name;
        }
        this.addOnConfig = addOnConfig;
        this.hwElemRec = hwElemRec;
        this.id = elemIdx.toString();
    }
    // Fields from config (stored in RIC NVS using addon REST API)
    addOnConfig = null;
    // Fields from HWElem (from hwstatus command)
    hwElemRec = null;
    // Fields allocated when combining records
    name = '';
    SN = '';
    id = '0';
    isConnected = false;
    isConfigured = false;
}
export class RICSysModInfoBLEMan {
    req = '';
    rslt = 'ok';
    isConn = false;
    isAdv = false;
    advName = "";
    BLEMAC = "";
    rssi = -200;
    rxM = 0;
    rxB = 0;
    rxBPS = 0.0;
    txM = 0;
    txB = 0;
    txBPS = 0.0;
    txErr = 0;
    txErrPS = 0;
    tM = 0;
    tB = 0;
    tBPS = 0.0;
    tSeqErrs = 0;
    tDatErrs = 0;
}
export class RICFileDownloadResult {
    fileData = null;
    downloadedOk = false;
}
