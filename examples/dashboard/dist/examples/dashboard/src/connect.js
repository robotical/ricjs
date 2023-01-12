import RICChannelWebBLE from "../../../src/RICChannelWebBLE";
import RICLog from "../../../src/RICLog";
async function getBleDevice() {
    try {
        const dev = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [RICChannelWebBLE.RICServiceUUID] }
            ],
            optionalServices: []
        });
        return dev;
    }
    catch (e) {
        RICLog.error(`getBleDevice - failed to get device ${e}`);
        return null;
    }
}
export async function connectBLE(params) {
    const dev = await getBleDevice();
    if (await globalThis.ricConnector.connect("WebBLE", dev)) {
        RICLog.info("connectBLE - connected to device " + dev.name);
    }
    else {
        RICLog.info("connectBLE - failed to connect");
        return;
    }
}
export async function disconnect(params) {
    globalThis.ricConnector.disconnect();
}
export async function connectWiFi(params) {
    const wifiIP = document.getElementById("wifi-ip");
    const wifiPw = document.getElementById("wifi-pw");
    const wifiIPAddr = wifiIP.value;
    const wifiPwStr = wifiPw.value;
    globalThis.ricConnector.connect("wifi", wifiIPAddr);
}
export async function startCheckCorrectRIC(params) {
    const availableColours = [
        { led: "#202000", lcd: "#FFFF00" },
        { led: "#880000", lcd: "#FF0000" },
        { led: "#000040", lcd: "#0080FF" },
    ];
    // Set the colours to display on LEDs
    globalThis.ricConnector.checkCorrectRICStart(availableColours);
}
export async function acceptCheckCorrectRIC(params) {
    globalThis.ricConnector.checkCorrectRICStop(true);
}
export async function rejectCheckCorrectRIC(params) {
    globalThis.ricConnector.checkCorrectRICStop(false);
}
