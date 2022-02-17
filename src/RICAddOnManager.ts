import { RICLog } from './RICLog'
import { Dictionary, RICHWElem, RICReportMsg } from './RICTypes';
import {
  RICAddOnBase,
  RIC_WHOAMI_TYPE_CODE_ADDON_GRIPSERVO,
  RICAddOnGripServo,
  RIC_WHOAMI_TYPE_CODE_ADDON_LEDFOOT,
  RICAddOnLEDFoot,
  RIC_WHOAMI_TYPE_CODE_ADDON_LEDARM_V1,
  RIC_WHOAMI_TYPE_CODE_ADDON_LEDARM_V2,
  RICAddOnLEDArm,
  RIC_WHOAMI_TYPE_CODE_ADDON_LEDEYE,
  RICAddOnLEDEye,
  RIC_WHOAMI_TYPE_CODE_ADDON_IRFOOT_V1,
  RIC_WHOAMI_TYPE_CODE_ADDON_IRFOOT_V2,
  RICAddOnIRFoot,
  RIC_WHOAMI_TYPE_CODE_ADDON_COLOUR,
  RICAddOnColourSensor,
  RIC_WHOAMI_TYPE_CODE_ADDON_DISTANCE,
  RICAddOnDistanceSensor,
  RIC_WHOAMI_TYPE_CODE_ADDON_LIGHT,
  RICAddOnLightSensor,
  RIC_WHOAMI_TYPE_CODE_ADDON_NOISE,
  RICAddOnNoiseSensor,
} from './RICAddOns';
import { ROSSerialAddOnStatus } from './RICROSSerial';

export class RICAddOnManager {

  _addOnMap: Dictionary<RICAddOnBase> = {};

  setHWElems(hwElems: Array<RICHWElem>) {
    this._addOnMap = this.getMappingOfAddOns(hwElems);
  }

  clear() {
    this._addOnMap = {};
  }

  getMappingOfAddOns(hwElems: Array<RICHWElem>): Dictionary<RICAddOnBase> {
    const addOnMap: Dictionary<RICAddOnBase> = {};
    // Iterate HWElems to find addons
    for (const hwElem of hwElems) {
      RICLog.debug(`getMappingOfAddOns whoAmITypeCode ${hwElem.whoAmITypeCode}`);
      if (hwElem.type === 'RSAddOn') {
        const dtid = parseInt("0x" + hwElem.whoAmITypeCode);
        switch (dtid) {
          case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_GRIPSERVO):
            addOnMap[hwElem.IDNo.toString()] = new RICAddOnGripServo(hwElem.name);
            break;
          case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LEDFOOT):
            addOnMap[hwElem.IDNo.toString()] = new RICAddOnLEDFoot(
              hwElem.name
            );
            break;
          case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LEDARM_V1):
          case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LEDARM_V2):
            addOnMap[hwElem.IDNo.toString()] = new RICAddOnLEDArm(
              hwElem.name,
              dtid //LED Arm needs the dtid, since there are two
            );
            break;
          case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LEDEYE):
            addOnMap[hwElem.IDNo.toString()] = new RICAddOnLEDEye(
              hwElem.name
            );
            break;
          // both IRFoot IDs treated the same way:
          case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_IRFOOT_V1):
          case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_IRFOOT_V2):
            addOnMap[hwElem.IDNo.toString()] = new RICAddOnIRFoot(
              hwElem.name,
              dtid //IR sensor needs the dtid, since there are two
            );
            break;
          case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_COLOUR):
            addOnMap[hwElem.IDNo.toString()] = new RICAddOnColourSensor(
              hwElem.name,
            );
            break;
          case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_DISTANCE):
            addOnMap[hwElem.IDNo.toString()] = new RICAddOnDistanceSensor(
              hwElem.name,
            );
            break;
          case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_LIGHT):
            addOnMap[hwElem.IDNo.toString()] = new RICAddOnLightSensor(
              hwElem.name,
            );
            break;
          case parseInt("0x" + RIC_WHOAMI_TYPE_CODE_ADDON_NOISE):
            addOnMap[hwElem.IDNo.toString()] = new RICAddOnNoiseSensor(
              hwElem.name,
            );
            break;
        }
      }
    }
    //good to check here that the items aren't NULL
    //if the callback processPublishedData() isn't correct
    //extractAddOnStatus in RICROSSerial adds null and this breaks Scratch
    // RICLog.debug("ADD ON MAP");
    // RICLog.debug(addOnMap);
    return addOnMap;
  }

  processPublishedData(
    addOnID: number,
    statusByte: number,
    rawData: Uint8Array,
  ): ROSSerialAddOnStatus | null {
    // Lookup in map
    const addOnIdStr = addOnID.toString();
    if (addOnIdStr in this._addOnMap) {
      const addOnHandler = this._addOnMap[addOnIdStr];
      return addOnHandler.processPublishedData(addOnID, statusByte, rawData);
    }
    return null;
  }

  getIDNoFromName(name: string): string | null {
    for (const key in this._addOnMap) {
      if (key in this._addOnMap) {
        if (this._addOnMap[key]._name == name)
          return key;
      }
    }
    return null;
  }

  getInitCmds(): Array<string> {
    const cmds: Array<string> = [];
    for (const key in this._addOnMap) {
      if (key in this._addOnMap) {
        const initCmd = this._addOnMap[key]._initCmd;
        if (initCmd) {
          cmds.push(initCmd);
        }
      }
    }
    return cmds;
  }

  processReportMsg(reportMsgs: Array<RICReportMsg>, timeInitStart: number) {
    for (const reportID in reportMsgs) {
      const report = reportMsgs[reportID];
      //RICLog.debug(`Report message: ${JSON.stringify(report)}`);
      if ((report.timeReceived) && (report.timeReceived < timeInitStart)) {
        continue;
      }
      if (report.elemName) {
        let hwElemIDNoStr = "";
        if (report.IDNo) {
          hwElemIDNoStr = report.IDNo.toString();
        } else if (report.elemName) {
          const maybeIdno = this.getIDNoFromName(report.elemName);
          if (maybeIdno) {
            hwElemIDNoStr = maybeIdno;
          }
        }
        if (hwElemIDNoStr.length > 0) {
          this._addOnMap[hwElemIDNoStr].processInit(report);
        }
      }
    }
  }
}
