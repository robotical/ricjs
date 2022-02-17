/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICLog
// Communications Connector for RIC V2
//
// RIC V2
// Rob Dobson & Chris Greening 2020
// (C) Robotical 2020
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export enum RICLogLevel {
  NONE,
  ERROR,
  WARN,
  INFO,
  DEBUG,
  VERBOSE
}

export type RICLogFn = (logLevel: RICLogLevel, msg: string) => void;

export class RICLog {
  static _logListener: RICLogFn | null = null;
  static _logLevel = RICLogLevel.DEBUG;

  static debug(msg: string) {
    if (!this.doLogging(RICLogLevel.DEBUG, msg))
      console.debug(msg);
  }

  static info(msg: string) {
    if (!this.doLogging(RICLogLevel.INFO, msg))
      console.info(msg);
  }

  static warn(msg: string) {
    if (!this.doLogging(RICLogLevel.WARN, msg))
      console.warn(msg);
  }

  static error(msg: string) {
    if (!this.doLogging(RICLogLevel.ERROR, msg))
      console.error(msg);
  }

  static verbose(msg: string) {
    if (!this.doLogging(RICLogLevel.VERBOSE, msg))
      console.log(msg);
  }

  static setLogListener(listener: RICLogFn | null) {
    this._logListener = listener;
  }

  static setLogLevel(logLevel: RICLogLevel): void {
    this._logLevel = logLevel;
  }

  static doLogging(logLevel: RICLogLevel, msg: string): boolean {
    if (this._logListener) {
      this._logListener(logLevel, msg)
      return true;
    } 
    return this._logLevel < logLevel;
  }  
}
