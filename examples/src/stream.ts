import RICConnector from "../../src/RICConnector";
import { Dictionary, RICStreamType } from "../../src/RICTypes";

declare global {
    var ricConnector: RICConnector;
    var ricPrevData: Dictionary<string>;
}

export async function streamSoundFile(params: Array<string>): Promise<void> {
    const fileName = params[0];
    const filePath = "./assets/sounds/" + fileName;
    const fileData = await fetch(filePath);
    const audioBuffer = await fileData.arrayBuffer();
    const audioData = new Uint8Array(audioBuffer);
    globalThis.ricConnector.streamAudio(audioData, true);
}

export async function sendREST(params: Array<string>): Promise<void> {
    globalThis.ricConnector.sendRICRESTMsg(params[0], {});
}
