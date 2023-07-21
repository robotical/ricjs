import { acceptCheckCorrectRIC, connectBLE, connectWiFi, disconnect, rejectCheckCorrectRIC, startCheckCorrectRIC } from './connect';
import { sendREST, streamSoundFile } from './stream';
import { imuStatusFormat, robotStatusFormat, servoStatusFormat, addonListFormat, tableFormat, sysInfoGet, connPerfTest, setReconnect, pixGetColourStr, commsStatusFormat, powerStatusFormat, addonValListFormat } from './system';
import { RICConnEvent } from '../../../src/RICConnEvents';
import { RICUpdateEvent } from '../../../src/RICUpdateEvents';
import RICConnector from '../../../src/RICConnector';
import { fileDownloader, otaUpdateCancel, otaUpdateCheck, otaUpdateStart } from './update';
import RICLog, { RICLogLevel } from '../../../src/RICLog';
import { RICPublishEvent } from '../../../src/RICTypes';
import { ROSCameraData, ROSTOPIC_V2_CAMERA } from '../../../src/RICROSSerial';
import { stat } from 'fs';

let startTime = Date.now();
function eventListener(eventType: string, eventEnum: RICConnEvent | RICUpdateEvent | RICPublishEvent, 
          eventName: string, eventData?: object | string | null) {

  if (eventType !== 'pub') {
    const eventField = document.getElementById("event-field") as HTMLElement;
    if (eventField) {
      if (eventField.innerHTML.length === 0) {
        eventField.innerHTML = "<div>Events</div>";
      }
      const timeStr = ((Date.now() - startTime) / 1000).toFixed(1);
      eventField.innerHTML += `<div><span class="event-time-info">${timeStr}</span><span class="event-info">${eventName}</span><span class="event-info">${eventData?JSON.stringify(eventData):""}</span></div>`;
    }
  }

  // Handle specific events
  const checkField = document.getElementById("check-correct-ric-container") as HTMLElement;
  if (checkField) {
    if (eventType === 'conn') {
      switch (eventEnum) {
        case RICConnEvent.CONN_VERIFYING_CORRECT_RIC:
          {
            checkField.innerHTML = `<div>Check LEDs</div>`;
            const eventLeds = eventData as Array<string>;
            for (let idx = 0; idx < eventLeds.length; idx++) {
              checkField.innerHTML += pixGetColourStr(idx, eventLeds[idx]);
            }
            break;
          }
        case RICConnEvent.CONN_VERIFIED_CORRECT_RIC:
          {
            checkField.innerHTML = `<div>Check LEDs ACCEPTED</div>`;
            break;
          }
        case RICConnEvent.CONN_REJECTED_RIC:
          {
            checkField.innerHTML = `<div>Check LEDs REJECTED</div>`;
            break;
          }
      }
    } else if (eventType === 'pub') {
      switch (eventEnum) {
        case RICPublishEvent.PUBLISH_EVENT_DATA:
          {
            // Debug
            const eventDataObj = eventData as { [key: string]: any };
            RICLog.debug(`PUBLISH_EVENT_DATA ${eventDataObj['topicIDs']}`);

            // Check topic
            if (eventDataObj['topicIDs'].includes(ROSTOPIC_V2_CAMERA)) {

              // Show latest camera image
              const cameraData = ricConnector.getRICStateInfo().cameraData as ROSCameraData;
              const statusContainer = document.getElementById('camera-image-container');
              if (statusContainer !== null) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(
                  new Blob([cameraData.cameraData.imageData], { type: 'image/jpeg' })
                );
                statusContainer.replaceChildren(img);
                // Timestamp, etc
                const imageWidth = cameraData.cameraData.imageWidth;
                const imageHeight = cameraData.cameraData.imageHeight;
                const imageFormat = cameraData.cameraData.imageFormat;
                const imageQuality = cameraData.cameraData.imageQuality;
                const timeStr = new Date(cameraData.cameraData.unixTimeMs).toUTCString() + " " + 
                      (cameraData.cameraData.unixTimeMs % 1000).toString();
                const frameTimeMs = cameraData.cameraData.frameTimeMs == 0 ? 1000 : cameraData.cameraData.frameTimeMs;
                const imageLen = cameraData.cameraData.imageData.length;
                const frameRatePS = (imageLen / (frameTimeMs / 1000)).toFixed(0);
                statusContainer.innerHTML += `<div>UTC ${timeStr} Width ${imageWidth} Height ${imageHeight} Format ${imageFormat} Quality ${imageQuality} Size ${imageLen} Rate ${frameRatePS}Bytes/s</div>`;
              }
            }
            break;
          }
      }
    }
  }
}

function logMsgFn(logLevel: RICLogLevel, msg: string): void {
  console.log('[' + new Date().toISOString().substring(11,23) + '] -', msg);
}

globalThis.ricConnector = new RICConnector();
if (globalThis.ricConnector) {
  globalThis.ricConnector.setupUpdateManager("2.0.0", 
              `https://updates.robotical.io/live/martyv2/rev{HWRevNo}/current_version.json`, 
              fileDownloader);
  globalThis.ricConnector.setEventListener(eventListener);
}
globalThis.ricPrevData = {};
RICLog.setLogListener(logMsgFn);

function formatStatus(name: string, status: any, validMs:number | undefined | null, formatFn: any, elId: string) {
  if (!globalThis.ricConnector.isConnected() || !status) {
    if (globalThis.ricPrevData[name]) {
      document.getElementById(elId).innerHTML = "";
      delete globalThis.ricPrevData[name];
    }
    return;
  }
  if (validMs === 0) {
    document.getElementById(elId).innerHTML = "";
    return;
  }
  const curStatusJSON = JSON.stringify(status);
  if (!(name in globalThis.ricPrevData) || (globalThis.ricPrevData[name] !== curStatusJSON)) {
    const newStatusHTML = formatFn(name, status);
    if (newStatusHTML !== "") {
      const container = document.getElementById(elId);
      container.innerHTML = newStatusHTML;
      globalThis.ricPrevData[name] = curStatusJSON;
      if ((validMs === null) || (validMs === undefined) || (Date.now() < validMs + 2000)) {
        container.classList.add("status-valid");
      } else {
        container.classList.remove("status-invalid");
      }
    }
  }
}

function updateStatus() {
  const statusContainer = document.getElementById('time-status-container');
  statusContainer.innerHTML = "";
  const status = document.createElement('div');
  const timeStr = ((Date.now() - startTime) / 1000).toFixed(1);
  const connStr = globalThis.ricConnector.isConnected() ? "Connected to " + globalThis.ricConnector.getConnMethod() : "Disconnected";
  const connClass = globalThis.ricConnector.isConnected() ? "status-conn" : "status-disconn";
  status.innerHTML = `<div>Elapsed time ${timeStr}</div><div class="${connClass}">${connStr}</div>`;
  status.classList.add('status');
  statusContainer.appendChild(status);

  const ricState = globalThis.ricConnector.getRICState();
  const ricSystem = globalThis.ricConnector.getRICSystem()
  formatStatus("commsStats", globalThis.ricConnector.getCommsStats(), null, commsStatusFormat, "comms-stats-container");
  formatStatus("robotStatus", ricState.robotStatus, ricState.robotStatusValidMs, robotStatusFormat, "robot-status-container");
  formatStatus("powerStatus", ricState.power, ricState.powerValidMs, powerStatusFormat, "power-status-container");
  formatStatus("imuStatus", ricState.imuData, ricState.imuDataValidMs, imuStatusFormat, "imu-status-container");
  formatStatus("servoStatus", ricState.smartServos, ricState.smartServosValidMs, servoStatusFormat, "servo-status-container");
  formatStatus("sysInfoStatus", ricSystem.getCachedSystemInfo(), ricSystem.getCachedSystemInfo()?.validMs, tableFormat, "sysinfo-list-container");
  formatStatus("addonsStatus", ricSystem.getCachedAddOnList(), null, addonListFormat, "addon-list-container");
  formatStatus("addonsValStatus", ricState.addOnInfo.addons, null, addonValListFormat, "addon-val-list-container");
  formatStatus("calibStatus", ricSystem.getCachedCalibInfo(), ricSystem.getCachedCalibInfo()?.validMs, tableFormat, "calib-list-container");
  formatStatus("nameStatus", ricSystem.getCachedRICName(), ricSystem.getCachedRICName()?.validMs, tableFormat, "friendlyname-list-container");
  formatStatus("wifiStatus", ricSystem.getCachedWifiStatus(), ricSystem.getCachedWifiStatus().validMs, tableFormat, "wifi-status-container");

  setTimeout(updateStatus, 200);
}

function addButtons(defs: Array<{ name: string, button: string, func: any, params: Array<string | number | boolean> }>, container: Element) {
  defs.forEach(def => {
    const buttonDiv = document.createElement('div');
    buttonDiv.classList.add('button-row');
    let buttonText = def.button;
    if (buttonText.includes("|")) {
      const buttonParts = buttonText.split("|");
      const buttonTags = (def.params[1] as string).split("|");
      buttonDiv.innerHTML = `<div class = "button-container"><span class="example-name">${def.name}</span>
          <select class="list-select" id="${def.params[0]}">
            <option value="${buttonParts[0]}" data-tag="${buttonTags[0]}">${buttonParts[0]}</option>
            <option value="${buttonParts[1]}" data-tag="${buttonTags[1]}">${buttonParts[1]}</option>
          </select></div>`;
    } else {
      if (buttonText === "%1") {
        buttonText = def.params[0] as string;
      }
      buttonDiv.innerHTML = `<div class = "button-container"><span class="example-name">${def.name}</span><button class="list-button">${buttonText}</button></div>`;
      buttonDiv.addEventListener('click', () => {
        def.func(def.params);
      });
    }
    container.appendChild(buttonDiv);
  });
}

function addFields(defs: Array<{ name: string, elId: string }>, container: Element): void {
  defs.forEach(def => {
    const fieldDiv = document.createElement('div');
    fieldDiv.classList.add('field-row');
    fieldDiv.innerHTML = `<div class = "field-container"><span class="example-name">${def.name}</span><input id="${def.elId}" class="list-field" type="text"></div>`;
    container.appendChild(fieldDiv);
  });
}

function genStatusBlock(id: string, elclass: string | Array<string>, parent: Element): Element {
  const statusBlock = document.createElement('div');
  if (typeof elclass === 'string') {
    statusBlock.classList.add(elclass);
  } else {
    elclass.forEach(cls => {
      statusBlock.classList.add(cls);
    });
  }
  statusBlock.id = id;
  parent.appendChild(statusBlock);
  return statusBlock;
}

function setFileRxStatusMsg(msg: string): void {
  const statusContainer = document.getElementById('file-status-container');
  if (statusContainer !== null) {
    statusContainer.innerHTML = "";
    const status = document.createElement('div');
    status.innerHTML = `<div>${msg}</div>`;
    status.classList.add('status');
    statusContainer.appendChild(status);
  }
}

function fileRxProgressCB(progress: number, total: number): void {
  setFileRxStatusMsg(`File transfer progress ${progress} / ${total}`);
}

function i2hex(i: number): string {
  const hex = i.toString(16);
  return (hex.length === 1 ? "0" + hex : hex) + " ";
}

export async function fileRxGetContent(params: string[]): Promise<boolean> {
  const startTime = Date.now();
  let result = null;
  let source = params[1];
  if (source.includes("#")) {
    const selectElem = document.getElementById(params[1].substring(1)) as HTMLSelectElement;
    if (selectElem)
      source = selectElem.options[selectElem.selectedIndex].getAttribute("data-tag");
  }
  try {
    result = await globalThis.ricConnector.fsGetContents(params[0], source, fileRxProgressCB);
  } catch (err) {
    setFileRxStatusMsg(`fileRxGetContent error ${err}`);
    return false;
  }
  console.log(`fileRxGetContent resultOk ${result.downloadedOk} length ${result.fileData ? result.fileData.length : 0}`);
  setFileRxStatusMsg(`Received ${result.downloadedOk ? "OK" : "Failed"} ${result.fileData ? result.fileData.length : 0} bytes in ${((Date.now() - startTime) / 1000).toFixed(1)} seconds is ${result.fileData ? (result.fileData.length / ((Date.now() - startTime) / 1000)).toFixed(0) : 0} bytes/sec`);

  // // Display the contents as hex string
  // const hexContainer = document.getElementById('file-status-container');
  // if (hexContainer !== null && result.fileData !== null) {
  //   const hex = document.createElement('div');
  //   const hexStr = Array.from(result.fileData).map(i2hex).join('');
  //   hex.innerHTML = `<div>${hexStr}</div>`;
  //   hex.classList.add('hex');
  //   hexContainer.appendChild(hex);
  // }

  // Append an image with the contents
  const statusContainer = document.getElementById('camera-image-container');
  if (statusContainer !== null && result.fileData !== null) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(
      new Blob([result.fileData], { type: 'image/jpeg' })
    );
    statusContainer.appendChild(img);
  }
  return true;
}

function selectButton(params: string[]): void {
}

function sendRESTMaybeBridged(params: Array<string>): void {

  // TODO - establish bridge and send via bridge if selected
  
  // let source = params[1];
  // if (source.includes("#")) {
  //   const selectElem = document.getElementById(params[1].substring(1)) as HTMLSelectElement;
  //   if (selectElem)
  //     source = selectElem.options[selectElem.selectedIndex].getAttribute("data-tag");
  // }


  sendREST(params)
}

function component() {
  const element = document.createElement('div');
  element.classList.add('main-container');

  const titleEl = document.createElement('h1');
  titleEl.innerHTML = "RICJS Example";
  titleEl.classList.add('title');
  element.appendChild(titleEl);

  const infoColumns = document.createElement('div');
  infoColumns.classList.add('info-columns');

  const statusContainer = document.createElement('div');
  statusContainer.classList.add('status-container');
  statusContainer.id = 'status-container';

  genStatusBlock('event-field', ['info-status-container', 'info-status-scroll'], statusContainer);
  genStatusBlock('time-status-container', 'info-status-container', statusContainer);
  genStatusBlock('check-correct-ric-container', ['info-status-container', 'info-status-scroll'], statusContainer);
  genStatusBlock('update-container', ['info-status-container', 'info-status-scroll'], statusContainer);
  genStatusBlock('conn-perf-status-container', 'info-status-container', statusContainer);
  genStatusBlock('robot-status-container', 'info-status-container', statusContainer);
  genStatusBlock('power-status-container', 'info-status-container', statusContainer);
  genStatusBlock('imu-status-container', 'info-status-container', statusContainer);
  genStatusBlock('servo-status-container', 'info-status-container', statusContainer);
  genStatusBlock('sysinfo-list-container', 'info-status-container', statusContainer);
  genStatusBlock('addon-list-container', 'info-status-container', statusContainer);
  genStatusBlock('addon-val-list-container', 'info-status-container', statusContainer);
  genStatusBlock('calib-list-container', 'info-status-container', statusContainer);
  genStatusBlock('friendlyname-list-container', 'info-status-container', statusContainer);
  genStatusBlock('wifi-status-container', 'info-status-container', statusContainer);
  genStatusBlock('comms-stats-container', 'info-status-container', statusContainer);
  genStatusBlock('response-field', ['info-status-container', 'info-status-scroll'], statusContainer);

  const fileStatusContainer = document.createElement('div');
  fileStatusContainer.classList.add('file-status-container');
  fileStatusContainer.id = 'file-status-container';
  statusContainer.appendChild(fileStatusContainer);

  const cameraImageContainer = document.createElement('div');
  fileStatusContainer.classList.add('camera-image-container');
  fileStatusContainer.id = 'camera-image-container';
  statusContainer.appendChild(cameraImageContainer);

  const buttonsContainer = document.createElement('div');
  buttonsContainer.classList.add('buttons-container');

  // Buttons
  const bleConnDefs = [
    { name: "Disconnect", button: "Disconnect", func: disconnect, params: [] as Array<string> },
    { name: "Connect BLE", button: "Connect", func: connectBLE, params: [] as Array<string> },
  ]

  const wifiIPDefs = [
    { name: "Wifi IP", elId: "wifi-ip" },
  ]

  const wifiPWDefs = [
    { name: "Wifi PW", elId: "wifi-pw" },
  ]

  const wifiConnDefs = [
    { name: "Connect WiFi", button: "Connect", func: connectWiFi, params: [] as Array<string> },
  ]

  const buttonDefs = [
    { name: "BLE Perf", button: "Perf Test BLE", func: connPerfTest, params: [] },
    { name: "Enable reconnect", button: "Reconnect 10s", func: setReconnect, params: [true, 10] },
    { name: "Disable reconnect", button: "No Reconnect", func: setReconnect, params: [false, 0] },
    { name: "Correct RIC?", button: "Check LEDs", func: startCheckCorrectRIC, params: [false, 0] },
    { name: "Correct RIC?", button: "Accept RIC", func: acceptCheckCorrectRIC, params: [false, 0] },
    { name: "Correct RIC?", button: "Reject RIC", func: rejectCheckCorrectRIC, params: [false, 0] },
    { name: "Get SysInfo", button: "Get SysInfo", func: sysInfoGet, params: [] },
    { name: "Update", button: "Check", func: otaUpdateCheck, params: [] },
    { name: "Update", button: "Perform", func: otaUpdateStart, params: [] },
    { name: "Update", button: "Cancel", func: otaUpdateCancel, params: [] },
    { name: "Stream MP3", button: "%1", func: streamSoundFile, params: ["test440ToneQuietShort.mp3"] },
    { name: "Stream MP3", button: "%1", func: streamSoundFile, params: ["completed_tone_low_br.mp3"] },
    { name: "Stream MP3", button: "%1", func: streamSoundFile, params: ["unplgivy.mp3"] },
    { name: "Circle", button: "%1", func: sendREST, params: ["traj/circle"] },
    { name: "Kick", button: "%1", func: sendREST, params: ["traj/kick"] },
    { name: "Walk", button: "%1", func: sendREST, params: ["traj/dance"] },
    { name: "Wiggle", button: "%1", func: sendREST, params: ["traj/wiggle"] },
    { name: "Eyes Wide", button: "%1", func: sendREST, params: ["traj/eyesWide"] },
    { name: "Eyes Normal", button: "%1", func: sendREST, params: ["traj/eyesNormal"] },
    { name: "5V On", button: "%1", func: sendREST, params: ["pwrctrl/5von"] },
    { name: "5V Off", button: "%1", func: sendREST, params: ["pwrctrl/5voff"] },
    { name: "WiFi Scan", button: "Start", func: sendREST, params: ["wifiscan/start"] },
    { name: "WiFi Scan", button: "Results", func: sendREST, params: ["wifiscan/results"] },
    { name: "File", button: "Get index.html", func: fileRxGetContent, params: ["index.html", "fs"] },
    { name: "Camera", button: "Bridged|Direct", func: selectButton, params: ["select-camera", "bridgeserial1|fs"] },
    { name: "Camera", button: "Set res 160x120", func: sendRESTMaybeBridged, params: ["camera/0/set?size=160x120&quality=10", "#select-camera"] },
    { name: "Camera", button: "Set res 320x240", func: sendRESTMaybeBridged, params: ["camera/0/set?size=320x240&quality=10", "#select-camera"] },
    { name: "Camera", button: "Set res 640x480", func: sendRESTMaybeBridged, params: ["camera/0/set?size=640x480&quality=10", "#select-camera"] },
    { name: "Camera", button: "Set res 1280x720", func: sendRESTMaybeBridged, params: ["camera/0/set?size=1280x720&quality=10", "#select-camera"] },
    { name: "Camera", button: "Get image", func: fileRxGetContent, params: ["/cam/img.jpeg", "#select-camera"] },
    { name: "Camera", button: "Subscribe 1fps", func: sendRESTMaybeBridged, params: ["subscription?action=update&name=Camera&rateHz=1.0", "#select-camera"] },
  ]

  // Add buttonDefs
  addButtons(bleConnDefs, buttonsContainer);
  addFields(wifiIPDefs, buttonsContainer);
  addButtons(wifiConnDefs, buttonsContainer);
  addFields(wifiPWDefs, buttonsContainer);
  addButtons(buttonDefs, buttonsContainer);

  infoColumns.appendChild(buttonsContainer);
  infoColumns.appendChild(statusContainer);

  element.appendChild(infoColumns);

  startTime = Date.now();
  setTimeout(updateStatus, 0);

  return element;
}

document.body.appendChild(component());
