import RICConnector from "../../../src/RICConnector";
import { Dictionary } from "../../../src/RICTypes";

declare global {
  var ricConnector: RICConnector;
  var ricPrevData: Dictionary<string>;
}

export async function streamSoundFile(params: Array<string>): Promise<void> {
  const fileName = params[0];
  const filePath = "./assets/sounds/" + fileName;
  let audioDuration;
  if (fileName === "completed_tone_low_br.mp3") {
    audioDuration = 3000
  } else if (fileName === "test440ToneQuietShort.mp3") {
    audioDuration = 15000
  } else {
    audioDuration = 1000
  }
  const fileData = await fetch(filePath);
  console.log(fileData);
  const audioBuffer = await fileData.arrayBuffer();
  const audioData = new Uint8Array(audioBuffer);
  globalThis.ricConnector.streamAudio(audioData, true, audioDuration);
}

export async function sendREST(params: Array<string>): Promise<void> {
  const resp = await globalThis.ricConnector.sendRICRESTMsg(params[0], {});
  const respField = document.getElementById("response-field") as HTMLElement;
  if (respField) {
    respField.innerHTML = `<div>Response</div><div><span class="event-info">${
      resp ? JSON.stringify(resp) : ""
    }</span></div>`;
  }
}
