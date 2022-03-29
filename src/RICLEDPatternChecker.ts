/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import RICLog from './RICLog'
import RICMsgHandler from './RICMsgHandler';
import { RICOKFail } from './RICTypes';

export type RICLEDPatternCheckerColour = {
  led: string;
  lcd: string;
}

export default class RICLEDPatternChecker {

  // Verification of correct device
  _ledColours: Array<string> = new Array<string>();
  _lcdColours: Array<string> = new Array<string>();
  _bleVerifActive = false;

  isActive(): boolean {
    return this._bleVerifActive;
  }

  clear(): void {
    this._bleVerifActive = false;
  }

  setup(availableColors: RICLEDPatternCheckerColour[]): string[] {

    // Check length of available colours
    if (availableColors.length == 0) {
      RICLog.warn('start no available colours');
    }

    // Random colour selection
    const LED_1 =
      availableColors[Math.floor(Math.random() * availableColors.length)];
    const LED_2 =
      availableColors[Math.floor(Math.random() * availableColors.length)];
    const LED_3 =
      availableColors[Math.floor(Math.random() * availableColors.length)];

    // LED and LCD colours are different to attempt to be visually similar
    this._ledColours = [LED_1.led, LED_2.led, LED_3.led];
    this._lcdColours = [LED_1.lcd, LED_2.lcd, LED_3.lcd];

    // Set the colours to display on LEDs
    this._bleVerifActive = true;

    // Return LCD colours to display
    return this._lcdColours;
  }

  async setRICColors(msgHandler: RICMsgHandler, timeoutMs: number): Promise<boolean> {
    // Set bonding colours
    let colourSetStr = '';
    for (let i = 0; i < this._ledColours.length; i++) {
      if (i != 0) {
        colourSetStr += '&';
      }
      let colr = this._ledColours[i];
      if (colr.startsWith('#')) colr = colr.slice(1);
      colourSetStr += `c${i}=${colr}`;
    }
    try {
      RICLog.debug('setRICColors setting colours');
      if (msgHandler) {
        await msgHandler.sendRICRESTURL<RICOKFail>(`indicator/set?${colourSetStr}&ms=${timeoutMs}`);
      }
    } catch (error) {
      RICLog.debug(`setRICColors failed to send ${error}`);
      return false;
    }
    return true;
  }

  async clearRICColors(msgHandler: RICMsgHandler): Promise<void> {
    // Clear the LED colours
    RICLog.debug('clearRICColors');
    try {
      if (msgHandler) {
        await msgHandler.sendRICRESTURL<RICOKFail>(`indicator/resume`);
      }
    } catch (error) {
      RICLog.debug(`clearRICColors failed to send ${error}`);
    }
  }
}
