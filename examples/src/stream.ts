import { RICConnector } from "../../src/RICConnector";
import { RICStreamType } from "../../src/RICTypes";

declare global {
    var ricConnector: RICConnector;
}

export async function streamSoundFile(params: Array<string>): Promise<void> {
    const fileName = params[0];
    const filePath = "./assets/sounds/" + fileName;
    const fileData = await fetch(filePath);
    const audioBuffer = await fileData.arrayBuffer();
    const audioData = new Uint8Array(audioBuffer);
    globalThis.ricConnector.streamAudio(audioData, true);
  }