/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export var RICLogLevel;
(function (RICLogLevel) {
    RICLogLevel[RICLogLevel["NONE"] = 0] = "NONE";
    RICLogLevel[RICLogLevel["ERROR"] = 1] = "ERROR";
    RICLogLevel[RICLogLevel["WARN"] = 2] = "WARN";
    RICLogLevel[RICLogLevel["INFO"] = 3] = "INFO";
    RICLogLevel[RICLogLevel["DEBUG"] = 4] = "DEBUG";
    RICLogLevel[RICLogLevel["VERBOSE"] = 5] = "VERBOSE";
})(RICLogLevel || (RICLogLevel = {}));
export default class RICLog {
    static _logListener = null;
    static _logLevel = RICLogLevel.DEBUG;
    static format(msg) {
        return (Date.now() / 1000).toFixed(3).toString() + " " + msg;
    }
    static debug(msg) {
        if (!this.doLogging(RICLogLevel.DEBUG, msg))
            console.debug(RICLog.format(msg));
    }
    static info(msg) {
        if (!this.doLogging(RICLogLevel.INFO, msg))
            console.info(RICLog.format(msg));
    }
    static warn(msg) {
        if (!this.doLogging(RICLogLevel.WARN, msg))
            console.warn(RICLog.format(msg));
    }
    static error(msg) {
        if (!this.doLogging(RICLogLevel.ERROR, msg))
            console.error(RICLog.format(msg));
    }
    static verbose(msg) {
        if (!this.doLogging(RICLogLevel.VERBOSE, msg))
            console.debug(RICLog.format(msg));
    }
    static setLogListener(listener) {
        this._logListener = listener;
    }
    static setLogLevel(logLevel) {
        this._logLevel = logLevel;
    }
    static doLogging(logLevel, msg) {
        if (this._logListener) {
            this._logListener(logLevel, msg);
            return true;
        }
        return this._logLevel < logLevel;
    }
}
