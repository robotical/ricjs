/**
 * The RICServoFaultDetection class is responsible for detecting faults in the RIC servos.
 * These are the faults that can currently be detected:
    1) Wiring fault - Intermittent connection to servo potentiometer
    2) Wiring fault - no connection to servo potentiometer
    3) Wiring fault - faulty connection to servo drive
    4) Servo horn has shifted out of position

 * To detect these faults:
    1) get the list of all servos
    2) sending an atomic read command to the servos
        2.1) the servos will respond with a report msg
        2.2) the fault flags are on the 11th byte of the report msg
        2.3) The 'fault' byte has 8 bits, each of which corresponds to a specific type of fault (there are only 4 types of faults so far, so the remaining 4 bits are unused.)
            Bit 0: Intermittent connection to potentiometer
            Bit 1: No connection to potentiometer
            Bit 2: Faulty connection to motor drive
            Bit 3: Servo horn position error
    3) in a second phase, we receive the report msg from the app, and check the fault flags
 */

import RICLog from "./RICLog";
import RICMsgHandler from "./RICMsgHandler";
import { RICHWElemList_Name, RICReportMsg, RICServoFaultFlags } from "./RICTypes";

export default class RICServoFaultDetector {
    private _ricMsgHandler: RICMsgHandler;
    private static expirationDate: Date = new Date();
    private static _servoList: string[] = [];

    constructor(ricMsgHandler: RICMsgHandler) {
        this._ricMsgHandler = ricMsgHandler;
    }

    private async getAllServos(): Promise<void> {
        RICServoFaultDetector._servoList = [];
        const response = await this._ricMsgHandler.sendRICRESTURL<RICHWElemList_Name>("hwstatus/name?filterByType=SmartServo");
        try {
            RICServoFaultDetector._servoList = response.hw;
        } catch (e) {
            console.log("Error getting servo list");
        }
    }

    async atomicReadOperation(expirationTime = 5000): Promise<void> {
        await this.getAllServos();
        // setting an expiration date within which the interpreter should receive the report msg
        RICServoFaultDetector.expirationDate = new Date(Date.now() + expirationTime);
        for (let i = 0; i < RICServoFaultDetector._servoList.length; i++) {
            const servoName = RICServoFaultDetector._servoList[i];
            try {
                await this._ricMsgHandler.sendRICRESTURL<void>(`elem/${servoName}/json?cmd=raw&numToRd=11&msgKey=100${i}`);
            } catch (e) {
                RICLog.warn(`RICServoFaultDetector: Error sending atomic read command to servo ${servoName}`);
            }
        }
    }

    static interpretReportMsg(reportMsg: RICReportMsg): RICServoFaultFlags | undefined {
        // make sure the report msg is not expired
        if (new Date() > RICServoFaultDetector.expirationDate) {
            RICLog.warn(`RICServoFaultDetector: Received report msg after expiration date: ${reportMsg}`);
            return;
        }
        // make sure this is a raw report msg
        if (reportMsg.msgType !== "raw") {
            RICLog.warn(`RICServoFaultDetector: Received non-raw report msg: ${reportMsg}`);
            return;
        }
        // making sure the report msg is from a servo
        if (reportMsg.elemName && !RICServoFaultDetector._servoList.includes(reportMsg.elemName)) {
            RICLog.warn(`RICServoFaultDetector: Received report msg from non-servo: ${reportMsg}`);
            return;
        }
        const hexRd = reportMsg.hexRd;
        if (!hexRd) {
            RICLog.warn(`RICServoFaultDetector: Received report msg with no hexRd: ${reportMsg}`);
            return;
        }
        const faultByteHex = hexRd.slice(20, 22); // the fault byte is the 11th byte of the report msg
        if (!faultByteHex || hexRd.length !== 22) { // since we are reading 11 bytes, the hexRd should be 22 characters long
            RICLog.warn(`RICServoFaultDetector: Received report msg with invalid hexRd: ${reportMsg}`);
            return;
        }
        try {
            return RICServoFaultDetector.decodeFault(faultByteHex);
        } catch (e) {
            RICLog.warn(`RICServoFaultDetector: Received report msg with invalid fault byte: ${reportMsg}`);
            return;
        }
    }

    private static decodeFault(faultByteHex: string): RICServoFaultFlags {
        const byte = parseInt(faultByteHex, 16);
        return {
          intermittentConnection: !!(byte & 0b0001),
          noConnection: !!(byte & 0b0010),
          faultyConnection: !!(byte & 0b0100),
          servoHornPositionError: !!(byte & 0b1000)
        };
    }
}