/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import RICChannel from "./RICChannel";
import { RICConnEvent, RICConnEventFn } from "./RICConnEvents";
import RICLog from "./RICLog";
import RICMsgHandler from "./RICMsgHandler";
import { PhoneBLEDiscoveredRIC } from "./RICTypes";
import RICUtils from "./RICUtils";

export default class RICChannelPhoneBLE implements RICChannel {
  // BLE UUIDS
  public static RICServiceUUID = "aa76677e-9cfd-4626-a510-0d305be57c8d";
  public static RICCmdUUID = "aa76677e-9cfd-4626-a510-0d305be57c8e";
  public static RICRespUUID = "aa76677e-9cfd-4626-a510-0d305be57c8f";

  // Device and characteristics
  public bleDevice: any | null = null;
  private _bleSubscrOnRx: any | null = null;
  private _bleSubscrOnDisconnect: any | null = null;
//   private _bleSubscrOnStateChange: Subscription | null = null;

  // BLE Manager
  public bleManager: any | null = null;

  // Discovered RIC
  public ricToConnectToBLE: PhoneBLEDiscoveredRIC | null = null;

  // MTU (Maximum Transmission Unit) size to request
  private _MTU_SIZE_TO_REQUEST = 251;

  // Default comms channel

  // Message handler
  private _ricMsgHandler: RICMsgHandler | null = null;

  // Conn event fn
  private _onConnEvent: RICConnEventFn | null = null;

  // Connected flag and retries
  private _isConnected = false;

  // Event listener fn
//   private _eventListenerFn: ((event: Event) => void) | null = null;

  // Set message handler
  setMsgHandler(ricMsgHandler: RICMsgHandler): void {
    this._ricMsgHandler = ricMsgHandler;
  }

  // BLE interfaces are automatically subscribed to publish messages
  requiresSubscription(): boolean {
    return false;
  }

  // isConnected
  isConnected(): boolean {
    return this.bleDevice !== null && this._isConnected;
  }

  // Set onConnEvent handler
  setOnConnEvent(connEventFn: RICConnEventFn): void {
    this._onConnEvent = connEventFn;
  }

  // Disconnection event
  onDisconnected(callback?: () => void): void {
    if (this.bleDevice) {
      // removing old on disconnect subscription if there is one
      if (this._bleSubscrOnDisconnect) {
        this._bleSubscrOnDisconnect.remove();
        this._bleSubscrOnDisconnect = null;
      }
      // Attach a disconnected listener
      this._bleSubscrOnDisconnect = this.bleManager!.onDeviceDisconnected(
        this.bleDevice.id,
        async () => {
          this.disconnect();
          //   this._storeConnectionInfo();
          //   this._invalidateConnectionInfo();
          try {
            if (this._bleSubscrOnRx) {
              this._bleSubscrOnRx.remove();
              this._bleSubscrOnRx = null;
            }

            if (this._bleSubscrOnDisconnect) {
              this._bleSubscrOnDisconnect.remove();
              this._bleSubscrOnDisconnect = null;
            }

            // Debug
            RICLog.warn(`connection subscriptions removed`);

            // Device now null
            RICLog.warn("onDisconnect clearing connected device");
            // this._ghostBleDevice = this.bleDevice; // if we lost the devices, temporality we storing it so we can get back to it if we find it again
            this.bleDevice = null;
            this._isConnected = false;
            if (this._onConnEvent) {
              this._onConnEvent(RICConnEvent.CONN_DISCONNECTED_RIC);
            }
            callback && callback();
          } catch (error) {
            RICLog.debug("Error in onDisconnected" + error);
          }
        }
      );
    }
  }

  // Connect to a device
  async connect(locator: string | object): Promise<boolean> {
    const params = locator as {
      bleManager: any;
      ricToConnectToBLE: PhoneBLEDiscoveredRIC;
    };
    this.bleManager = params.bleManager;
    this.ricToConnectToBLE = params.ricToConnectToBLE;
    let connectedDevice: any | null;
    try {
      connectedDevice = await this.bleManager.connectToDevice(
        this.ricToConnectToBLE.id,
        { timeout: 3000 }
      );
      const isConnected = await connectedDevice.isConnected();
      RICLog.debug(
        `RICChannelPhoneBLE.connect - ${
          isConnected ? "OK" : "FAILED"
        } connection to device ${connectedDevice.name}`
      );

      // Request high-priority connection
      try {
        await this.bleManager.requestConnectionPriorityForDevice(
          this.ricToConnectToBLE.id,
          1 // high priority
        );
      } catch (error) {
        RICLog.debug("requestConnectionPriorityForDevice failed" + error);
        return false;
      }

      // Increase MTU size
      try {
        if (connectedDevice) {
          await connectedDevice.requestMTU(this._MTU_SIZE_TO_REQUEST);
        }
      } catch (error) {
        RICLog.debug("requestMTU failed" + error);
        return false;
      }

      // Discover services and characteristics
      try {
        if (connectedDevice) {
          this.bleDevice = await connectedDevice.discoverAllServicesAndCharacteristics();
        }
      } catch (error) {
        RICLog.debug("discoverAllServicesAndCharacteristics failed" + error);
        return false;
      }

      // Monitor the inbound characteristic
      try {
        if (this.bleDevice) {
          this._bleSubscrOnRx = this.bleDevice.monitorCharacteristicForService(
            RICChannelPhoneBLE.RICServiceUUID,
            RICChannelPhoneBLE.RICRespUUID,
            (error: any | null, characteristic: any | null) => {
              this._onMsgRx(error, characteristic);
            }
          );
        }
      } catch (error) {
        RICLog.debug("monitorCharacteristicForService failed" + error);
        return false;
      }
    } catch (error) {
      RICLog.warn(`RICChannelPhoneBLE.connect - cannot connect ${error}`);
      return false;
    }
    this.onDisconnected();
    return true;
  }

  // Disconnect
  async disconnect(): Promise<void> {
    this.ricToConnectToBLE = null;
    // Remove disconnect subscription so it doesn't try to reconnect
    if (this._bleSubscrOnDisconnect) {
      this._bleSubscrOnDisconnect.remove();
      this._bleSubscrOnDisconnect = null;
    }
    // Disconnect anything we might be connected to
    if (this.bleManager) {
      const connMarties = await this.bleManager.connectedDevices([
        RICChannelPhoneBLE.RICServiceUUID,
      ]);
      if (connMarties.length == 0) {
        console.log("disconnect - no devices connected");
      } else {
        for (const connRIC of connMarties) {
          console.log("Disconnecting " + connRIC.id);
          await this.bleManager.cancelDeviceConnection(connRIC.id);
        }
      }
    }
  }

  // Handle notifications
  _onMsgRx(error: any | null, characteristic: any | null) {
    if (error) {
      // this.emit(maybe dont want to emit here - just add to comms stats?);
      // this.reportError(error.message);
      return;
    }

    // Extract message
    const msgFrameBase64 = characteristic!.value;
    const rxFrame = RICUtils.atob(msgFrameBase64 || "");

    // Send
    if (rxFrame !== null) {
      this._ricMsgHandler!.handleNewRxMsg(rxFrame);
    }
  }

  // Send a message
  async sendTxMsg(
    msg: Uint8Array,
    sendWithResponse: boolean
  ): Promise<boolean> {
    // Check valid
    if (this.bleDevice === null) {
      return false;
    }

    // Convert to Base64
    const msgFrameBase64 = RICUtils.btoa(msg);

    // Write to the characteristic
    if (sendWithResponse) {
      await this.bleDevice.writeCharacteristicWithResponseForService(
        RICChannelPhoneBLE.RICServiceUUID,
        RICChannelPhoneBLE.RICCmdUUID,
        msgFrameBase64
      );
    } else {
      await this.bleDevice.writeCharacteristicWithoutResponseForService(
        RICChannelPhoneBLE.RICServiceUUID,
        RICChannelPhoneBLE.RICCmdUUID,
        msgFrameBase64
      );
    }
    return true;
  }

  // Send message without awaiting response
  async sendTxMsgNoAwait(
    msg: Uint8Array,
    sendWithResponse: boolean
  ): Promise<boolean> {
    // Convert to Base64
    const msgFrameBase64 = RICUtils.btoa(msg);

    // Write to the characteristic
    if (sendWithResponse) {
      this.bleDevice!.writeCharacteristicWithResponseForService(
        RICChannelPhoneBLE.RICServiceUUID,
        RICChannelPhoneBLE.RICCmdUUID,
        msgFrameBase64
      );
    } else {
      this.bleDevice!.writeCharacteristicWithoutResponseForService(
        RICChannelPhoneBLE.RICServiceUUID,
        RICChannelPhoneBLE.RICCmdUUID,
        msgFrameBase64
      );
    }
    return true;
  }
}
