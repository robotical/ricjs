import { RICFileDownloadResult } from "../../../src/RICTypes";
import { RICUpdateEventNames } from "../../../src/RICUpdateEvents";
export async function otaUpdateCheck(params) {
    const rslt = await ricConnector.otaUpdateCheck();
    const updateRslt = document.getElementById("update-container");
    updateRslt.innerHTML = "Update: " + RICUpdateEventNames[rslt];
}
export async function otaUpdateStart(params) {
    const rslt = await ricConnector.otaUpdateStart();
    const updateRslt = document.getElementById("update-container");
    updateRslt.innerHTML = "Update: " + RICUpdateEventNames[rslt];
}
export async function otaUpdateCancel(params) {
    await ricConnector.otaUpdateCancel();
    const updateRslt = document.getElementById("update-container");
    updateRslt.innerHTML = "Update: Cancelled";
}
// File downloading
export async function fileDownloader(url, progressCB) {
    const rslt = new RICFileDownloadResult();
    try {
        const fileData = await fetch(url);
        rslt.downloadedOk = true;
        rslt.fileData = new Uint8Array(await fileData.arrayBuffer());
        return rslt;
    }
    catch (e) {
        rslt.downloadedOk = false;
        return rslt;
    }
}
