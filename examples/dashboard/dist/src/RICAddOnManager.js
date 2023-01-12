/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
import RICLog from './RICLog';
class AddOnFactoryElem {
    typeName;
    addOnFamily;
    whoAmI;
    factoryFn;
    constructor(typeName, addOnFamily, whoAmI, factoryFn) {
        this.addOnFamily = addOnFamily;
        this.typeName = typeName;
        this.whoAmI = whoAmI;
        this.factoryFn = factoryFn;
    }
}
/**
 * RICAddOnManager
 *
 * @description
 * Handles the creation and management of RIC Add-Ons
 *
 */
export default class RICAddOnManager {
    _addOnFactoryMap = {};
    _configuredAddOns = {};
    registerHWElemType(typeName, addOnFamily, whoAmI, factoryFn) {
        RICLog.debug(`registerHWElemType ${whoAmI} ${typeName}`);
        const lookupStr = addOnFamily + "_" + whoAmI;
        this._addOnFactoryMap[lookupStr] = new AddOnFactoryElem(typeName, addOnFamily, whoAmI, factoryFn);
    }
    /**
     * @function setHWElems
     * Set the hardware elements from a list of RICHWElem
     * @param hwElems
     *
     */
    setHWElems(hwElems) {
        this._configuredAddOns = this.configureAddOns(hwElems);
    }
    clear() {
        this._configuredAddOns = {};
    }
    configureAddOns(hwElems) {
        const addOnMap = {};
        // Iterate HWElems to find addons
        for (const hwElem of hwElems) {
            RICLog.debug(`configureAddOns whoAmITypeCode ${hwElem.whoAmI}`);
            // Lookup the add-on
            let lookupStr = hwElem.type + "_" + hwElem.whoAmI;
            if (lookupStr in this._addOnFactoryMap) {
                const addOnFactoryElem = this._addOnFactoryMap[lookupStr];
                const whoAmILen = hwElem.whoAmITypeCode.length;
                hwElem.whoAmITypeCode = hwElem.whoAmITypeCode.slice(whoAmILen - 2, whoAmILen);
                const addOn = addOnFactoryElem.factoryFn(hwElem.name, hwElem.type, hwElem.whoAmI, hwElem.whoAmITypeCode);
                if (addOn !== null) {
                    addOnMap[hwElem.IDNo.toString()] = addOn;
                }
            }
        }
        return addOnMap;
    }
    getHWElemTypeStr(whoAmITypeCode, whoAmI) {
        RICLog.debug(`getting type code for ${whoAmITypeCode}`);
        if (whoAmITypeCode === undefined) {
            return `Undefined whoamiTypeCode`;
        }
        if (whoAmITypeCode in this._addOnFactoryMap) {
            return this._addOnFactoryMap[whoAmITypeCode].typeName;
        }
        return `Unknown (${whoAmI} - ${whoAmITypeCode})`;
    }
    processPublishedData(addOnID, statusByte, rawData) {
        // Lookup in map
        const addOnIdStr = addOnID.toString();
        console.log(this._configuredAddOns, 'RICAddOnManager.ts', 'line: ', '115');
        if (addOnIdStr in this._configuredAddOns) {
            const addOnHandler = this._configuredAddOns[addOnIdStr];
            const data = addOnHandler.processPublishedData(addOnID, statusByte, rawData);
            return data;
        }
        return null;
    }
    getIDNoFromName(name) {
        for (const key in this._configuredAddOns) {
            if (key in this._configuredAddOns) {
                if (this._configuredAddOns[key]._name == name)
                    return key;
            }
        }
        return null;
    }
    getInitCmds() {
        const cmds = [];
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
    processReportMsg(reportMsgs, timeInitStart) {
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
                }
                else if (report.elemName) {
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
