import { RICConnector } from "../../src/RICConnector";

declare global {
    var ricConnector: RICConnector;
}

export async function getSysInfo(): Promise<void> {
    const sysInfoOk = await globalThis.ricConnector.retrieveMartySystemInfo();
    if (!sysInfoOk) {
      console.log("Failed to retrieve system info");
    } else {
      console.log(`System Info retrieved {globalThis.ricConnector.getRICSystemInfo()}`);
    }
}
