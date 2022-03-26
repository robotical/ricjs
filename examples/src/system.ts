import { RICConnector } from "../../src/RICConnector";
import RICLog from "../../src/RICLog";
import { ROSSerialIMU, ROSSerialRGBT, ROSSerialRobotStatus, ROSSerialSmartServos } from "../../src/RICROSSerial";
import { RICAddOnList, RICCalibInfo, RICHWElem, RICSystemInfo } from "../../src/RICTypes";

declare global {
    var ricConnector: RICConnector;
}

export async function sysInfoGet(params: Array<string>): Promise<void> {
    const sysInfoOk = await globalThis.ricConnector.retrieveMartySystemInfo();
    if (!sysInfoOk) {
      RICLog.warn("Failed to retrieve system info");
    } else {
      RICLog.verbose(`System info retrieved ${globalThis.ricConnector.getRICSystem()}`);
      const wifiIP = document.getElementById("wifi-ip") as HTMLInputElement;
      wifiIP.value = globalThis.ricConnector.getRICSystem().getCachedWifiStatus().ipAddress;
    }
}

export function robotStatusFormat(name:string, robotStatus:ROSSerialRobotStatus): string {

  // robotStatus = JSON.parse('{ "robotStatus": { "flags": 0, "isMoving": false, "isPaused": false, "isFwUpdating": false, "workQCount": 0, "heapFree": 77280, "heapMin": 56540, "pixRGBT": [ { "r": 0, "g": 0, "b": 64, "t": 1 }, { "r": 0, "g": 0, "b": 0, "t": 0 }, { "r": 0, "g": 0, "b": 32, "t": 1 } ], "loopMsAvg": 2, "loopMsMax": 5 } }');
  const innerStatus = robotStatus.robotStatus;
  let statusStr = "";
  let pixIdx = 0;
  for (let pixInfo of innerStatus.pixRGBT) {
    statusStr += pixInfoFormat(pixIdx, pixInfo);
    pixIdx++;
  }
  statusStr += `<div class="flag-info">${innerStatus.isMoving ? "Moving" : "Stopped"}</div>`;
  statusStr += `<div class="flag-info">${innerStatus.isPaused ? "Paused" : "Running"}</div>`;
  statusStr += `<div class="flag-info">${innerStatus.isFwUpdating ? "FW Update" : "No FW Update"}</div>`;
  statusStr += `<div class="flag-line-sep"></div>`;
  statusStr += `<div class="flag-info">HeapFree ${innerStatus.heapFree}</div>`;
  statusStr += `<div class="flag-info">HeapMin ${innerStatus.heapMin}</div>`;
  statusStr += `<div class="flag-info">LoopAvg ${innerStatus.loopMsAvg}ms</div>`;
  statusStr += `<div class="flag-info">LoopMax ${innerStatus.loopMsMax}ms</div>`;

  return statusStr; // + JSON.stringify(robotStatus, null, 2);
}

const tohex = (d:number) => Number(d).toString(16).padStart(2, '0');

function pixInfoFormat(idx: number, pixInfo: ROSSerialRGBT): string {
  const colourStr = tohex(Math.min(pixInfo.r * 4, 0xff)) + tohex(Math.min(pixInfo.g * 4, 0xff)) + tohex(Math.min(pixInfo.b * 4, 0xff));
  return `<div class="pix-info"><div class="pix-info-idx">LED ${idx}</div><div class="pix-info-rgb" style="background-color:#${colourStr}"></div></div>`;
}

export function imuStatusFormat(name:string, imuStatus:ROSSerialIMU): string {

  const innerStatus = imuStatus.accel;
  let statusStr = "";
  statusStr += `<div class="flag-info">X ${innerStatus.x.toFixed(2)}</div>`;
  statusStr += `<div class="flag-info">Y ${innerStatus.y.toFixed(2)}</div>`;
  statusStr += `<div class="flag-info">Z ${innerStatus.z.toFixed(2)}ms</div>`;

  return statusStr;
}

export function servoStatusFormat(name:string, servoStatus:ROSSerialSmartServos): string {
  const servoNames = ["LeftHip","LeftTwist","LeftKnee","RightHip","RightTwist","RightKnee","LeftArm","RightArm","Eyes"];

  // servoStatus = JSON.parse(`{"smartServos":[{"id":0,"pos":0,"current":0,"status":0},{"id":1,"pos":0,"current":0,"status":0},{"id":2,"pos":0,"current":0,"status":0},{"id":3,"pos":0,"current":0,"status":0},{"id":4,"pos":0,"current":0,"status":0},{"id":5,"pos":0,"current":0,"status":0},{"id":6,"pos":54,"current":0,"status":0},{"id":7,"pos":45,"current":0,"status":0},{"id":8,"pos":1,"current":0,"status":0}]}`);

  let statusStr = "";
  for (let i = 0; i < servoStatus.smartServos.length; i++) {
    const servo = servoStatus.smartServos[i];
    statusStr += `<progress class="flag-info" max="180" value="${servo.pos}"></progress>`;
  }

  return statusStr;
}

export function addonListFormat(name:string, addons:Array<RICHWElem>): string {
  let statusStr = "";
  // addons = JSON.parse('[{"name":"LeftHip","type":"SmartServo","busName":"I2CA","addr":"0x10","addrValid":1,"IDNo":0,"whoAmI":"","whoAmITypeCode":"ffffffff","SN":"","versionStr":"0.0.0","commsOk":"N"},{"name":"LeftTwist","type":"SmartServo","busName":"I2CA","addr":"0x11","addrValid":1,"IDNo":1,"whoAmI":"","whoAmITypeCode":"ffffffff","SN":"","versionStr":"0.0.0","commsOk":"N"},{"name":"LeftKnee","type":"SmartServo","busName":"I2CA","addr":"0x12","addrValid":1,"IDNo":2,"whoAmI":"","whoAmITypeCode":"ffffffff","SN":"","versionStr":"0.0.0","commsOk":"N"},{"name":"RightHip","type":"SmartServo","busName":"I2CA","addr":"0x13","addrValid":1,"IDNo":3,"whoAmI":"","whoAmITypeCode":"ffffffff","SN":"","versionStr":"0.0.0","commsOk":"N"},{"name":"RightTwist","type":"SmartServo","busName":"I2CA","addr":"0x14","addrValid":1,"IDNo":4,"whoAmI":"","whoAmITypeCode":"ffffffff","SN":"","versionStr":"0.0.0","commsOk":"N"},{"name":"RightKnee","type":"SmartServo","busName":"I2CA","addr":"0x15","addrValid":1,"IDNo":5,"whoAmI":"","whoAmITypeCode":"ffffffff","SN":"","versionStr":"0.0.0","commsOk":"N"},{"name":"LeftArm","type":"SmartServo","busName":"I2CA","addr":"0x16","addrValid":1,"IDNo":6,"whoAmI":"LArmMotor","whoAmITypeCode":"00000081","SN":"9c13e2a90bcb92ec","versionStr":"1.0.0","commsOk":"N"},{"name":"RightArm","type":"SmartServo","busName":"I2CA","addr":"0x17","addrValid":1,"IDNo":7,"whoAmI":"RArmMotor","whoAmITypeCode":"00000081","SN":"9c13e2a90bcb92ec","versionStr":"1.0.0","commsOk":"N"},{"name":"Eyes","type":"SmartServo","busName":"I2CA","addr":"0x18","addrValid":1,"IDNo":8,"whoAmI":"EyeMotor","whoAmITypeCode":"00000082","SN":"9c13e2a90bcb92ec","versionStr":"1.0.0","commsOk":"N"},{"name":"IMU0","type":"IMU","busName":"I2CA","addr":"0x1d","addrValid":1,"IDNo":19,"whoAmI":"MMA8452Q","whoAmITypeCode":"10018452","SN":"","versionStr":"0.0.0","commsOk":"Y"},{"name":"AudioOut","type":"I2SOut","busName":"","addr":"0x00","addrValid":0,"IDNo":40,"whoAmI":"","whoAmITypeCode":"ffffffff","SN":"","versionStr":"0.0.0","commsOk":"Y"},{"name":"BusPixels0","type":"BusPixels","busName":"","addr":"0x00","addrValid":0,"IDNo":39,"whoAmI":"BusPix19","whoAmITypeCode":"10020013","SN":"","versionStr":"0.0.0","commsOk":"Y"},{"name":"RicButton0","type":"GPIO","busName":"","addr":"0x00","addrValid":0,"IDNo":38,"whoAmI":"GPIO5","whoAmITypeCode":"10040005","SN":"","versionStr":"0.0.0","commsOk":"Y"},{"name":"FuelGauge0","type":"FuelGauge","busName":"I2CA","addr":"0x55","addrValid":1,"IDNo":37,"whoAmI":"","whoAmITypeCode":"ffffffff","SN":"","versionStr":"0.0.0","commsOk":"N"},{"name":"PowerCtrl","type":"PowerCtrl","busName":"","addr":"0x00","addrValid":0,"IDNo":36,"whoAmI":"RICPower","whoAmITypeCode":"10030000","SN":"","versionStr":"0.0.0","commsOk":"Y"}]');
  if (addons.length > 0) {
   statusStr += `<div class="table-head">HWElems</div>`;
  }
  statusStr += "<table class='table table-striped table-bordered'>";
  for (let i = 0; i < addons.length; i++) {
    const addon = addons[i];
    if (i === 0) {
      statusStr += "<tr>";
      for (const [key, value] of Object.entries(addon)) {
        statusStr += `<th>${key}</th>`;
      }
      statusStr += "</tr>";
    }
    statusStr += "<tr>";
    for (const [key, value] of Object.entries(addon)) {
      statusStr += `<td>${value}</td>`;
    }
    statusStr += "</tr>";
  }
  statusStr += "</tr></table>";

  return statusStr;
}

export function tableFormat(infoStr:string, infoObj:object): string {
  let statusStr = "";
  statusStr += `<div class="table-head">${infoStr}</div>`;
  statusStr += "<table class='table table-striped table-bordered'>";
  statusStr += "<tr>";
  for (const [key, value] of Object.entries(infoObj)) {
    statusStr += `<th>${key}</th>`;
  }
  statusStr += "</tr>";
  statusStr += "<tr>";
  for (const [key, value] of Object.entries(infoObj)) {
    statusStr += `<td>${value}</td>`;
  }
  statusStr += "</tr>";
  statusStr += "</table>";
  return statusStr;
}
