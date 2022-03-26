import { info, timeLog } from 'console';
import * as _ from 'lodash';
import { RICConnector } from '../../src/RICConnector';
import { connectBLE, disconnectBLE } from './connect';
import { streamSoundFile } from './stream';
import { getSysInfo } from './system';

let startTime = Date.now();
globalThis.ricConnector = new RICConnector();

function updateStatus() {
  const statusContainer = document.getElementById('status-container1');
  statusContainer.innerHTML = "";
  const status = document.createElement('div');
  const timeStr = ((Date.now() - startTime)/1000).toFixed(1);
  const connStr = globalThis.ricConnector.isConnected() ? "Connected" : "Disconnected";
  const ricStatus = JSON.stringify(globalThis.ricConnector._ricStateInfo.robotStatus, null, 2);
  const ricIMU = JSON.stringify(globalThis.ricConnector._ricStateInfo.imuData, null, 2);
  status.innerHTML = `<div>Elapsed time ${timeStr}</div><div>${connStr}</div><pre>${ricStatus}</pre><pre>${ricIMU}</pre>`;
  status.classList.add('status');
  statusContainer.appendChild(status);

  const statusContainer2 = document.getElementById('status-container2');
  statusContainer2.innerHTML = "";
  const status2 = document.createElement('div');
  const addons = JSON.stringify(globalThis.ricConnector._ricStateInfo.addOnInfo, null, 2);
  status2.innerHTML = `<pre>${addons}</pre>`;
  status2.classList.add('status');
  statusContainer2.appendChild(status2);  
}

function component() {
  const element = document.createElement('div');
  element.classList.add('main-container');

  const titleEl = document.createElement('h1');
  titleEl.innerHTML = "RICJS Examples";
  titleEl.classList.add('title');
  element.appendChild(titleEl);

  const infoColumns = document.createElement('div');
  infoColumns.classList.add('info-columns');

  const statusContainer = document.createElement('div');
  statusContainer.classList.add('status-container');
  statusContainer.id = 'status-container1';
  const statusContainer2 = document.createElement('div');
  statusContainer2.classList.add('status-container');
  statusContainer2.id = 'status-container2';

  const exampleContainer = document.createElement('div');
  exampleContainer.classList.add('examples-container');

  // Examples
  const examples = [
    {"name": "Connect BLE", "button": "Connect", "func": connectBLE, "params": []},
    {"name": "Disconnect BLE", "button": "Disconnect", "func": disconnectBLE, "params": []},
    {"name": "Get SysInfo", "button": "Get SysInfo", "func": getSysInfo, "params": []},
    {"name": "Stream MP3 file", "button": "%1", "func": streamSoundFile, "params": ["test440ToneQuietShort.mp3"]},
  ]

  // Add examples
  examples.forEach(example => {
    const exampleDiv = document.createElement('div');
    exampleDiv.classList.add('example-row');
    const buttonText = example.button.replace("%1", example.params[0]);
    exampleDiv.innerHTML = `<div class = "example"><span class="example-name">${example.name}</span><button class="example-button">${buttonText}</button></div>`;
    exampleDiv.addEventListener('click', () => {
      example.func(example.params);
    });
    exampleContainer.appendChild(exampleDiv);
  });
  infoColumns.appendChild(exampleContainer);
  infoColumns.appendChild(statusContainer);
  infoColumns.appendChild(statusContainer2);
  element.appendChild(infoColumns);

  startTime = Date.now();
  setInterval(updateStatus, 100);

  return element;
}

document.body.appendChild(component());
