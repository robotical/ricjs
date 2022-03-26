import { RICConnector } from "../../src/RICConnector";

const RICServiceUUID = 'aa76677e-9cfd-4626-a510-0d305be57c8d';

declare global {
    var ricConnector: RICConnector;
}

async function getBleDevice(): Promise<BluetoothDevice | null> {
    try {
      const dev = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [RICServiceUUID] }
        ],
        optionalServices: []
      });
      return dev;
    } catch (e) {
      console.log(e);
      return null;
    }
  }

export async function connectBLE(params: Array<string>): Promise<void> {
    const dev = await getBleDevice();
    if (await globalThis.ricConnector.connect("WebBLE", dev)) {
        console.log("Connected to device " + dev.name);
    } else {
        console.log("User cancelled");
        return;
    }
}

export async function disconnectBLE(params: Array<string>): Promise<void> {
    globalThis.ricConnector.disconnect();
}
