import RICConnector from "../../src/RICConnector";
import { RICFileDownloadResult, RICProgressCBType } from "../../src/RICTypes";
import { RICUpdateEventNames } from "../../src/RICUpdateEvents";

declare global {
    var ricConnector: RICConnector;
}

export async function otaUpdateCheck(params: Array<string>): Promise<void> {
    const rslt = await ricConnector.otaUpdateCheck();
    const updateRslt = document.getElementById("update-container") as HTMLInputElement;
    updateRslt.innerHTML = "Update: " + RICUpdateEventNames[rslt];
}

export async function otaUpdateStart(params: Array<string>): Promise<void> {
    const rslt = await ricConnector.otaUpdateStart();
    const updateRslt = document.getElementById("update-container") as HTMLInputElement;
    updateRslt.innerHTML = "Update: " + RICUpdateEventNames[rslt];
}

export async function otaUpdateCancel(params: Array<string>): Promise<void> {
    await ricConnector.otaUpdateCancel();
    const updateRslt = document.getElementById("update-container") as HTMLInputElement;
    updateRslt.innerHTML = "Update: Cancelled";
}

// File downloading
export async function fileDownloader(url: string, progressCB: RICProgressCBType): Promise<RICFileDownloadResult> {
    const rslt = new RICFileDownloadResult();
    try {
        const fileData = await fetch(url);
        rslt.downloadedOk = true;
        rslt.fileData = new Uint8Array(await fileData.arrayBuffer());
        return rslt;
    } catch (e) {
        rslt.downloadedOk = false;
        return rslt;
    }
}