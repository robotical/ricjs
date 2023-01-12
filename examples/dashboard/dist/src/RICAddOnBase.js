/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export default class RICAddOnBase {
    _name = '';
    _typeName = '';
    _whoAmI = "";
    _whoAmITypeCode = "";
    _initCmd = null;
    constructor(name, typeName, whoAmI, whoAmITypeCode) {
        this._name = name;
        this._typeName = typeName;
        this._whoAmI = whoAmI;
        this._whoAmITypeCode = whoAmITypeCode;
    }
}
