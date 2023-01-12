/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import RICLog from "./RICLog";
import { Dictionary, RICHWElem, RICReportMsg } from "./RICTypes";
import RICAddOnBase from "./RICAddOnBase";
import { ROSSerialAddOnStatus } from "./RICROSSerial";

export type RICAddOnCreator = (
  name: string,
  addOnFamily: string,
  whoAmI: string,
  whoAmITypeCode: string
) => RICAddOnBase;

class AddOnFactoryElem {
  typeName: string;
  addOnFamily: string;
  whoAmI: string;
  factoryFn: RICAddOnCreator;
  constructor(
    typeName: string,
    addOnFamily: string,
    whoAmI: string,
    factoryFn: RICAddOnCreator
  ) {
    this.addOnFamily = addOnFamily;
    this.typeName = typeName;
    this.whoAmI = whoAmI;
    this.factoryFn = factoryFn;
  }
}

export interface RICAddOnRegistry {
  registerHWElemType(
    typeName: string,
    addOnFamily: string,
    whoAmI: string,
    factoryFn: RICAddOnCreator
  ): void;
}

/**
 * RICAddOnManager
 *
 * @description
 * Handles the creation and management of RIC Add-Ons
 *
 */
export default class RICAddOnManager implements RICAddOnRegistry {
  _addOnFactoryMap: Dictionary<AddOnFactoryElem> = {};
  _configuredAddOns: Dictionary<RICAddOnBase> = {};

  registerHWElemType(
    typeName: string,
    addOnFamily: string,
    whoAmI: string,
    factoryFn: RICAddOnCreator
  ): void {
    RICLog.debug(`registerHWElemType ${whoAmI} ${typeName}`);
    const lookupStr = addOnFamily + "_" + whoAmI;
    this._addOnFactoryMap[lookupStr] = new AddOnFactoryElem(
      typeName,
      addOnFamily,
      whoAmI,
      factoryFn
    );
  }

  /**
   * @function getStaticAddonIds
   * Get the ids of the add-ons that are static
   * (their data do not get published from ricjs, eg buspixel ledeyes)
   * @returns {Array<number>} the ids of the static add-ons
   */
  getStaticAddonIds(): Array<number> {
    // at this point we will create the buspixel addon for the batch 4 ledeye,
    // as their data is not published the same way the RSAddOn do
    // to do so, however, we need to know if the batch 4 ledeye is connected
    const staticAddonIds = [];
    for (let addOnId in this._configuredAddOns) {
      const addon = this._configuredAddOns[addOnId];
      if (addon._isStatic) {
        staticAddonIds.push(+addOnId);
      }
    }
    return staticAddonIds;
  }

  /**
   * @function getStaticAddons
   * Get the add-ons that are static
   * (their data do not get published from ricjs, eg buspixel ledeyes)
   * @returns {Array<RICAddOnBase>} the static add-ons unprocessed
   */
  getStaticAddons(): Array<RICAddOnBase> {
    const staticAddons = [];
    for (let addOnId in this._configuredAddOns) {
      const addon = this._configuredAddOns[addOnId];
      if (addon._isStatic) {
        staticAddons.push(addon);
      }
    }
    return staticAddons;
  }

  /**
   * @function getProcessedStaticAddons
   * Get the add-ons that are static
   * (their data do not get published from ricjs, eg buspixel ledeyes)
   * @returns {Array<ROSSerialAddOnStatus>} the static add-ons processed
   */
  getProcessedStaticAddons(): Array<ROSSerialAddOnStatus> {
    const ids = this.getStaticAddonIds();
    const staticAddons: ROSSerialAddOnStatus[] = [];
    ids.forEach((id) => {
      const processedAddon = this.processPublishedData(
        id,
        0, 
        new Uint8Array(0) 
      );
      if (processedAddon) {
        staticAddons.push(processedAddon);
      }
    });
    return staticAddons;
  }

  /**
   * @function setHWElems
   * Set the hardware elements from a list of RICHWElem
   * @param hwElems
   *
   */
  setHWElems(hwElems: Array<RICHWElem>): void {
    this._configuredAddOns = this.configureAddOns(hwElems);
  }

  clear(): void {
    this._configuredAddOns = {};
  }

  configureAddOns(hwElems: Array<RICHWElem>): Dictionary<RICAddOnBase> {
    const addOnMap: Dictionary<RICAddOnBase> = {};
    // Iterate HWElems to find addons
    for (const hwElem of hwElems) {
      RICLog.debug(`configureAddOns whoAmITypeCode ${hwElem.whoAmI}`);

      // Lookup the add-on
      let lookupStr = hwElem.type + "_" + hwElem.whoAmI;
      if (lookupStr in this._addOnFactoryMap) {
        const addOnFactoryElem = this._addOnFactoryMap[lookupStr];
        const whoAmILen = hwElem.whoAmITypeCode.length;
        hwElem.whoAmITypeCode = hwElem.whoAmITypeCode.slice(
          whoAmILen - 2,
          whoAmILen
        );
        const addOn = addOnFactoryElem.factoryFn(
          hwElem.name,
          hwElem.type,
          hwElem.whoAmI,
          hwElem.whoAmITypeCode
        );
        if (addOn !== null) {
          addOnMap[hwElem.IDNo.toString()] = addOn;
        }
      }
    }
    return addOnMap;
  }

  getHWElemTypeStr(
    whoAmITypeCode: string | undefined,
    whoAmI: string | undefined
  ) {
    RICLog.debug(`getting type code for ${whoAmITypeCode}`);
    if (whoAmITypeCode === undefined) {
      return `Undefined whoamiTypeCode`;
    }
    if (whoAmITypeCode in this._addOnFactoryMap) {
      return this._addOnFactoryMap[whoAmITypeCode].typeName;
    }
    return `Unknown (${whoAmI} - ${whoAmITypeCode})`;
  }

  processPublishedData(
    addOnID: number,
    statusByte: number,
    rawData: Uint8Array
  ): ROSSerialAddOnStatus | null {
    // Lookup in map
    const addOnIdStr = addOnID.toString();
    if (addOnIdStr in this._configuredAddOns) {
      const addOnHandler = this._configuredAddOns[addOnIdStr];
      const data = addOnHandler.processPublishedData(
        addOnID,
        statusByte,
        rawData
      );
      return data;
    }
    return null;
  }
  getIDNoFromName(name: string): string | null {
    for (const key in this._configuredAddOns) {
      if (key in this._configuredAddOns) {
        if (this._configuredAddOns[key]._name == name) return key;
      }
    }
    return null;
  }

  getInitCmds(): Array<string> {
    const cmds: Array<string> = [];
    for (const key in this._configuredAddOns) {
      if (key in this._configuredAddOns) {
        const initCmd = this._configuredAddOns[key]._initCmd;
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
      if (report.timeReceived && report.timeReceived < timeInitStart) {
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
          this._configuredAddOns[hwElemIDNoStr].processInit(report);
        }
      }
    }
  }
}
