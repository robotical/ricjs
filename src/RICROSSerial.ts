/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import RICUtils from "./RICUtils";
import { RICMessageResult } from "./RICMsgHandler";
import RICCommsStats from "./RICCommsStats";
import RICAddOnManager from "./RICAddOnManager";

export class ROSSerialSmartServos {
  smartServos: {
    id: number;
    pos: number;
    current: number;
    status: number;
  }[] = [];
}

export class ROSSerialIMU {
  accel: {
    x: number;
    y: number;
    z: number;
  } = { x: 0, y: 0, z: 0 };
}

export class ROSSerialMagneto {
  magneto: {
    x: number;
    y: number;
    z: number;
  } = { x: 0, y: 0, z: 0 };
}

export class ROSSerialPowerStatus {
  powerStatus: {
    battRemainCapacityPercent: number;
    battTempDegC: number;
    battRemainCapacityMAH: number;
    battFullCapacityMAH: number;
    battCurrentMA: number;
    power5VOnTimeSecs: number;
    power5VIsOn: boolean;
    powerUSBIsConnected: boolean;
    battInfoValid: boolean;
    powerUSBIsValid: boolean;
    powerFlags: number;
  } = {
      battRemainCapacityPercent: 0,
      battTempDegC: 0,
      battRemainCapacityMAH: 0,
      battFullCapacityMAH: 0,
      battCurrentMA: 0,
      power5VOnTimeSecs: 0,
      power5VIsOn: false,
      powerUSBIsConnected: false,
      battInfoValid: false,
      powerUSBIsValid: false,
      powerFlags: 0,
    };
}

export class ROSSerialAddOnStatus {
  id = 0;
  deviceTypeID = 0;
  whoAmI = "";
  name = "";
  status = 0;
  vals: { [key: string]: number | boolean | string } = {};
}

export class ROSSerialAddOnStatusList {
  addons: Array<ROSSerialAddOnStatus> = new Array<ROSSerialAddOnStatus>();
}

export class ROSSerialRGBT {
  r = 0;
  g = 0;
  b = 0;
  t = 0;
  constructor(r: number, g: number, b: number, t: number) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.t = t;
  }
  toString() {
    return `R:${this.r} G:${this.g} B:${this.b} T:${this.t}`;
  }
}

export class ROSSerialRobotStatus {
  robotStatus: {
    flags: number;
    isMoving: boolean;
    isPaused: boolean;
    isFwUpdating: boolean;
    workQCount: number;
    heapFree: number;
    heapMin: number;
    pixRGBT: ROSSerialRGBT[];
    loopMsAvg: number;
    loopMsMax: number;
    wifiRSSI: number;
    bleRSSI: number;
  } = {
      flags: 0,
      isMoving: false,
      isPaused: false,
      isFwUpdating: false,
      workQCount: 0,
      heapFree: 0,
      heapMin: 0,
      pixRGBT: [],
      loopMsAvg: 0,
      loopMsMax: 0,
      wifiRSSI: 0,
      bleRSSI: 0,
    };
}

export type ROSSerialMsg =
  | ROSSerialSmartServos
  | ROSSerialIMU
  | ROSSerialMagneto
  | ROSSerialPowerStatus
  | ROSSerialAddOnStatusList
  | ROSSerialRobotStatus;

export class RICROSSerial {
  static decode(
    rosSerialMsg: Uint8Array,
    startPos: number,
    RICMessageResult: RICMessageResult | null,
    commsStats: RICCommsStats,
    addOnManager: RICAddOnManager
  ): void {
    // Payload may contain multiple ROSSerial messages
    let msgPos = startPos;
    for (; ;) {
      const remainingMsgLen = rosSerialMsg.length - msgPos;

      // ROSSerial ROSTopics
      const ROSTOPIC_V2_SMART_SERVOS = 120;
      const ROSTOPIC_V2_ACCEL = 121;
      const ROSTOPIC_V2_POWER_STATUS = 122;
      const ROSTOPIC_V2_ADDONS = 123;
      const ROSTOPIC_V2_ROBOT_STATUS = 124;
      const ROSTOPIC_V2_MAGNETOMETER = 125;

      // ROSSerial message format
      const RS_MSG_MIN_LENGTH = 8;
      const RS_MSG_LEN_LOW_POS = 2;
      const RS_MSG_LEN_HIGH_POS = 3;
      const RS_MSG_TOPIC_ID_LOW_POS = 5;
      const RS_MSG_TOPIC_ID_HIGH_POS = 6;
      const RS_MSG_PAYLOAD_POS = 7;

      // Max payload length
      const MAX_VALID_PAYLOAD_LEN = 1000;

      // RICLog.debug('ROSSerial Decode ' + remainingMsgLen);

      if (remainingMsgLen < RS_MSG_MIN_LENGTH) break;

      // Extract header
      const payloadLength =
        rosSerialMsg[msgPos + RS_MSG_LEN_LOW_POS] +
        rosSerialMsg[msgPos + RS_MSG_LEN_HIGH_POS] * 256;
      const topicID =
        rosSerialMsg[msgPos + RS_MSG_TOPIC_ID_LOW_POS] +
        rosSerialMsg[msgPos + RS_MSG_TOPIC_ID_HIGH_POS] * 256;

      // RICLog.debug('ROSSerial ' + payloadLength + ' topic ' + topicID);

      // Check max length
      if (payloadLength < 0 || payloadLength > MAX_VALID_PAYLOAD_LEN) break;

      // Check min length
      if (rosSerialMsg.length < payloadLength + RS_MSG_MIN_LENGTH) break;

      // Extract payload
      const payload = rosSerialMsg.slice(
        msgPos + RS_MSG_PAYLOAD_POS,
        msgPos + RS_MSG_PAYLOAD_POS + payloadLength
      );
      // RICLog.debug('ROSSerial ' + RICUtils.bufferToHex(payload));

      // Handle ROSSerial messages
      if (RICMessageResult !== null) {
        // we need to register the static addons here in case
        // marty only has static addons (and so the rostopic_v2_addons case
        // never runs)
        let allAdons: ROSSerialAddOnStatusList = { addons: [] };
        const staticAddons = addOnManager.getProcessedStaticAddons();
        for (const staticAddon of staticAddons) {
          allAdons.addons.push(staticAddon);
        }
        if (commsStats._msgAddOnPub === 0) {
          // we set the static addons only if we don't have any other addons
          // the _msgAddOnPub is incremented in the rostopic_v2_addons case
          // (when we get addons from marty)
          // otherwise, the static addons will be set along with the regular addons (below)
          RICMessageResult.onRxAddOnPub(allAdons);
        }
        switch (topicID) {
          case ROSTOPIC_V2_SMART_SERVOS:
            // Smart Servos
            RICMessageResult.onRxSmartServo(this.extractSmartServos(payload));
            commsStats.recordSmartServos();
            break;
          case ROSTOPIC_V2_ACCEL:
            // Accelerometer
            RICMessageResult.onRxIMU(this.extractAccel(payload));
            commsStats.recordIMU();
            break;
          case ROSTOPIC_V2_POWER_STATUS:
            // Power Status
            RICMessageResult.onRxPowerStatus(this.extractPowerStatus(payload));
            commsStats.recordPowerStatus();
            break;
          case ROSTOPIC_V2_ADDONS:
            // Addons
            allAdons = this.extractAddOnStatus(payload, addOnManager);
            for (const staticAddon of staticAddons) {
              allAdons.addons.push(staticAddon);
            }
            RICMessageResult.onRxAddOnPub(allAdons);
            commsStats.recordAddOnPub();
            break;
          case ROSTOPIC_V2_ROBOT_STATUS:
            // Robot Status
            RICMessageResult.onRobotStatus(this.extractRobotStatus(payload));
            commsStats.recordRobotStatus();
            break;
          case ROSTOPIC_V2_MAGNETOMETER:
            // Magnetometer
            RICMessageResult.onRxMagneto(this.extractMagneto(payload));
            commsStats.recordMagneto();
            break;
          default:
            // Unknown topic
            RICMessageResult.onRxOtherROSSerialMsg(topicID, payload);
            commsStats.recordOtherTopic();
            break;
        }
      }

      // Move msgPos on
      msgPos += RS_MSG_PAYLOAD_POS + payloadLength + 1;

      // RICLog.debug('MsgPos ' + msgPos);
    }
  }

  static extractSmartServos(buf: Uint8Array): ROSSerialSmartServos {
    // Each group of attributes for a servo is a fixed size
    const ROS_SMART_SERVOS_ATTR_GROUP_BYTES = 6;
    const numGroups = Math.floor(
      buf.length / ROS_SMART_SERVOS_ATTR_GROUP_BYTES
    );
    const msg: ROSSerialSmartServos = { smartServos: [] };
    let bufPos = 0;
    for (let i = 0; i < numGroups; i++) {
      const servoId = buf[bufPos];
      const servoPos = RICUtils.getBEInt16FromBuf(buf, bufPos + 1);
      const servoCurrent = RICUtils.getBEUint16FromBuf(buf, bufPos + 3);
      const servoStatus = buf[bufPos + 5];
      bufPos += ROS_SMART_SERVOS_ATTR_GROUP_BYTES;
      msg.smartServos.push({
        id: servoId,
        pos: servoPos,
        current: servoCurrent,
        status: servoStatus,
      });
    }
    return msg;
  }

  static extractAccel(buf: Uint8Array): ROSSerialIMU {
    // Three accelerometer floats
    const x = RICUtils.getBEFloatFromBuf(buf);
    const y = RICUtils.getBEFloatFromBuf(buf.slice(4));
    const z = RICUtils.getBEFloatFromBuf(buf.slice(8));
    return { accel: { x: x / 1024, y: y / 1024, z: z / 1024 } };
  }

  static extractMagneto(buf: Uint8Array): ROSSerialMagneto {
    // V2 ROSTOPIC MAGNETOMETER message layout
    // const ROS_MAGNETOMETER_BYTES = 13
    // const ROS_MAGNETOMETER_POS_X = 0
    // const ROS_MAGNETOMETER_POS_Y = 4
    // const ROS_MAGNETOMETER_POS_Z = 8
    // const ROS_MAGNETOMETER_POS_IDNO = 12
    // Three magnetometer floats
    const x = RICUtils.getBEFloatFromBuf(buf);
    const y = RICUtils.getBEFloatFromBuf(buf.slice(4));
    const z = RICUtils.getBEFloatFromBuf(buf.slice(8));
    return { magneto: { x: x, y: y, z: z } };
  }

  static extractPowerStatus(buf: Uint8Array): ROSSerialPowerStatus {
    // Power indicator values
    // RICLog.debug(`PowerStatus ${RICUtils.bufferToHex(buf)}`);
    const remCapPC = RICUtils.getBEUint8FromBuf(buf, 0);
    const tempDegC = RICUtils.getBEUint8FromBuf(buf, 1);
    const remCapMAH = RICUtils.getBEUint16FromBuf(buf, 2);
    const fullCapMAH = RICUtils.getBEUint16FromBuf(buf, 4);
    const currentMA = RICUtils.getBEInt16FromBuf(buf, 6);
    const power5VOnTimeSecs = RICUtils.getBEUint16FromBuf(buf, 8);
    const powerFlags = RICUtils.getBEUint16FromBuf(buf, 10);
    const isOnUSBPower = (powerFlags & 0x0001) != 0;
    const is5VOn = (powerFlags & 0x0002) != 0;
    const isBattInfoValid = (powerFlags & 0x0004) == 0;
    const isUSBPowerInfoValid = (powerFlags & 0x0008) == 0;
    return {
      powerStatus: {
        battRemainCapacityPercent: remCapPC,
        battTempDegC: tempDegC,
        battRemainCapacityMAH: remCapMAH,
        battFullCapacityMAH: fullCapMAH,
        battCurrentMA: currentMA,
        power5VOnTimeSecs: power5VOnTimeSecs,
        power5VIsOn: is5VOn,
        powerUSBIsConnected: isOnUSBPower && isUSBPowerInfoValid,
        battInfoValid: isBattInfoValid,
        powerUSBIsValid: isUSBPowerInfoValid,
        powerFlags: powerFlags,
      },
    };
  }

  static extractAddOnStatus(
    buf: Uint8Array,
    addOnManager: RICAddOnManager
  ): ROSSerialAddOnStatusList {
    // RICLog.debug(`AddOnRawData ${RICUtils.bufferToHex(buf)}`);
    // Each group of attributes for a add-on is a fixed size
    const ROS_ADDON_ATTR_GROUP_BYTES = 12;
    const numGroups = Math.floor(buf.length / ROS_ADDON_ATTR_GROUP_BYTES);
    const msg: ROSSerialAddOnStatusList = { addons: [] };
    let bufPos = 0;
    for (let i = 0; i < numGroups; i++) {
      const addOnId = buf[bufPos];
      const status = buf[bufPos + 1];
      const addOnData = buf.slice(bufPos + 2, bufPos + 12);
      bufPos += ROS_ADDON_ATTR_GROUP_BYTES;
      const addOnRec = addOnManager.processPublishedData(
        addOnId,
        status,
        addOnData
      );
      if (addOnRec !== null) {
        msg.addons.push(addOnRec);
      }
    }
    return msg;
  }

  static extractRGBT(buf: Uint8Array, offset: number): ROSSerialRGBT {
    return new ROSSerialRGBT(
      buf[offset],
      buf[offset + 1],
      buf[offset + 2],
      buf[offset + 3]
    );
  }

  static extractRobotStatus(buf: Uint8Array): ROSSerialRobotStatus {
    const flags = RICUtils.getBEUint8FromBuf(buf, 0);
    const workQCount = RICUtils.getBEUint8FromBuf(buf, 1);
    let heapFree = 0;
    let heapMin = 0;
    let pixRGBT1 = new ROSSerialRGBT(0, 0, 0, 0);
    let pixRGBT2 = new ROSSerialRGBT(0, 0, 0, 0);
    let pixRGBT3 = new ROSSerialRGBT(0, 0, 0, 0);
    let loopMsAvg = 0;
    let loopMsMax = 0;
    // RICLog.debug(`RobotStatus ${buf.length} ${RICUtils.bufferToHex(buf)} ${flags} ${workQCount} ${heapFree} ${heapMin} ${pixRGBT1.toString()} ${pixRGBT2.toString()} ${pixRGBT3.toString()} ${loopMsAvg} ${loopMsMax}`);
    let wifiRSSI = 0;
    let bleRSSI = 0;

    if (buf.length >= 24) {
      heapFree = RICUtils.getBEUint32FromBuf(buf, 2);
      heapMin = RICUtils.getBEUint32FromBuf(buf, 6);
      pixRGBT1 = RICROSSerial.extractRGBT(buf, 10);
      pixRGBT2 = RICROSSerial.extractRGBT(buf, 14);
      pixRGBT3 = RICROSSerial.extractRGBT(buf, 18);
      loopMsAvg = RICUtils.getBEUint8FromBuf(buf, 22);
      loopMsMax = RICUtils.getBEUint8FromBuf(buf, 23);
      // RICLog.debug(`RobotStatus ${buf.length} ${RICUtils.bufferToHex(buf)} ${flags} ${workQCount} ${heapFree} ${heapMin} ${pixRGBT1.toString()} ${pixRGBT2.toString()} ${pixRGBT3.toString()} ${loopMsAvg} ${loopMsMax}`);
      if (buf.length >= 26) {
        wifiRSSI = RICUtils.getBEInt8FromBuf(buf, 24);
        bleRSSI = RICUtils.getBEInt8FromBuf(buf, 25);
      }
    }
    return {
      robotStatus: {
        flags: flags,
        isMoving: (flags & 0x01) != 0,
        isPaused: (flags & 0x02) != 0,
        isFwUpdating: (flags & 0x04) != 0,
        workQCount: workQCount,
        heapFree: heapFree,
        heapMin: heapMin,
        pixRGBT: [pixRGBT1, pixRGBT2, pixRGBT3],
        loopMsAvg: loopMsAvg,
        loopMsMax: loopMsMax,
        wifiRSSI: wifiRSSI,
        bleRSSI: bleRSSI,
      },
    };
  }
}
