/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
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

export default class RICLog {
  static _logListener: RICLogFn | null = null;
  static _logLevel = RICLogLevel.DEBUG;

  static format(msg: string): string {
    return (Date.now()/1000).toFixed(3).toString() + " " + msg;
  }

  static debug(msg: string) {
    if (!this.doLogging(RICLogLevel.DEBUG, msg))
      console.debug(RICLog.format(msg));
  }

  static info(msg: string) {
    if (!this.doLogging(RICLogLevel.INFO, msg))
      console.info(RICLog.format(msg));
  }

  static warn(msg: string) {
    if (!this.doLogging(RICLogLevel.WARN, msg))
      console.warn(RICLog.format(msg));
  }

  static error(msg: string) {
    if (!this.doLogging(RICLogLevel.ERROR, msg))
      console.error(RICLog.format(msg));
  }

  static verbose(msg: string) {
    if (!this.doLogging(RICLogLevel.VERBOSE, msg))
      console.debug(RICLog.format(msg));
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
