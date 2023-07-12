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
import RICUtils from "./RICUtils";

export default class RICChannelWebBLE implements RICChannel {

  // BLE UUIDS
  public static RICServiceUUID = 'aa76677e-9cfd-4626-a510-0d305be57c8d';
  public static RICCmdUUID = 'aa76677e-9cfd-4626-a510-0d305be57c8e';
  public static RICRespUUID = 'aa76677e-9cfd-4626-a510-0d305be57c8f';

  // Device and characteristics
  private _bleDevice: BluetoothDevice | null = null;
  private _characteristicTx: BluetoothRemoteGATTCharacteristic | null = null;
  private _characteristicRx: BluetoothRemoteGATTCharacteristic | null = null;

  // Message handler
  private _ricMsgHandler: RICMsgHandler | null = null;

  // Conn event fn
  private _onConnEvent: RICConnEventFn | null = null;

  // Last message tx time
  private _msgTxTimeLast = Date.now();
  private _msgTxMinTimeBetweenMs = 50;
  private readonly maxRetries = 5;

  // Connected flag and retries
  private _isConnected = false;
  private readonly _maxConnRetries = 3;

  // Event listener fn
  private _eventListenerFn: ((event: Event) => void) | null = null;

  // File Handler parameters
  private _requestedBatchAckSize = 10;
  private _requestedFileBlockSize = 500;

  fhBatchAckSize(): number { return this._requestedBatchAckSize; }
  fhFileBlockSize(): number { return this._requestedFileBlockSize; }


  // Set message handler
  setMsgHandler(ricMsgHandler: RICMsgHandler): void {
    this._ricMsgHandler = ricMsgHandler;
  }

  // BLE interfaces are automatically subscribed to publish messages
  requiresSubscription(): boolean {
    return false;
  }

  // isEnabled
  isEnabled() {
    if (navigator.bluetooth) {
      RICLog.error("Web Bluetooth is supported in your browser.");
      return true;
    } else {
      window.alert('Web Bluetooth API is not available.\n' +
        'Please make sure the "Experimental Web Platform features" flag is enabled.');
      return false;
    }
  }

  // isConnected
  isConnected(): boolean {
    return (this._bleDevice !== null) && this._isConnected;
  }

  // Set onConnEvent handler
  setOnConnEvent(connEventFn: RICConnEventFn): void {
    this._onConnEvent = connEventFn;
  }

  // Disconnection event
  onDisconnected(event: Event): void {
    const device = event.target as BluetoothDevice;
    RICLog.debug(`RICChannelWebBLE.onDisconnected ${device.name}`);
    if (this._bleDevice) {
      this._bleDevice.removeEventListener('gattserverdisconnected', this._eventListenerFn);
    }
    this._isConnected = false;
    if (this._onConnEvent) {
      this._onConnEvent(RICConnEvent.CONN_DISCONNECTED_RIC);
    }
  }

  // Get connected locator
  getConnectedLocator(): string | object {
    return this._bleDevice || "";
  }

  // Connect to a device
  async connect(locator: string | object): Promise<boolean> {

    // RICLog.debug(`Selected device: ${deviceID}`);
    this._bleDevice = locator as BluetoothDevice;
    if (this._bleDevice && this._bleDevice.gatt) {
      try {

        // Connect
        for (let connRetry = 0; connRetry < this._maxConnRetries; connRetry++) {

          // Connect
          await RICUtils.withTimeout(2000, this._bleDevice.gatt.connect());
          RICLog.debug(`RICChannelWebBLE.connect - ${this._bleDevice.gatt.connected ? "OK" : "FAILED"} connection to device ${this._bleDevice.name}`);

          // Get service
          try {

            const service = await this._bleDevice.gatt.getPrimaryService(RICChannelWebBLE.RICServiceUUID);
            RICLog.debug(`RICChannelWebBLE.connect - found service: ${service.uuid}`);

            try {
              // Get Tx and Rx characteristics
              this._characteristicTx = await service.getCharacteristic(RICChannelWebBLE.RICCmdUUID);
              RICLog.debug(`RICChannelWebBLE.connect - found char ${this._characteristicTx.uuid}`);
              this._characteristicRx = await service.getCharacteristic(RICChannelWebBLE.RICRespUUID);
              RICLog.debug(`RICChannelWebBLE.connect - found char ${this._characteristicRx.uuid}`);

              // Notifications of received messages
              try {
                await this._characteristicRx.startNotifications();
                RICLog.debug('RICChannelWebBLE.connect - notifications started');
                this._characteristicRx.addEventListener('characteristicvaluechanged', this._onMsgRx.bind(this));
              } catch (error) {
                RICLog.debug('RICChannelWebBLE.connnect - addEventListener failed ' + error);
              }

              // Connected ok
              RICLog.debug(`RICChannelWebBLE.connect ${this._bleDevice.name}`);

              // Add disconnect listener
              this._eventListenerFn = this.onDisconnected.bind(this);
              this._bleDevice.addEventListener('gattserverdisconnected', this._eventListenerFn);

              // Connected
              this._isConnected = true;
              return true;

            } catch (error) {
              RICLog.error(`RICChannelWebBLE.connect - cannot find characteristic: ${error}`);
            }
          } catch (error) {
            if (connRetry === this._maxConnRetries - 1) {
              RICLog.error(`RICChannelWebBLE.connect - cannot get service ${error}`);
            } else {
              RICLog.debug(`RICChannelWebBLE.connect - cannot get service - retryIdx ${connRetry} ${error}`);
            }
          }
        }
      } catch (error: unknown) {
        RICLog.warn(`RICChannelWebBLE.connect - cannot connect ${error}`);
      }

      // Disconnect
      if (this._bleDevice && this._bleDevice.gatt && this._bleDevice.gatt.connected) {
        try {
          await this._bleDevice.gatt.disconnect();
        } catch (error) {
          RICLog.warn(`RICChannelWebBLE.connect - cannot disconnect ${error}`);
        }
      }
    }

    return false;
  }

  // Disconnect
  async disconnect(): Promise<void> {
    if (this._bleDevice && this._bleDevice.gatt) {
      try {
        RICLog.debug(`RICChannelWebBLE.disconnect GATT`);
        await this._bleDevice.gatt.disconnect();
      } catch (error) {
        RICLog.debug(`RICChannelWebBLE.disconnect ${error}`);
      }
    }
  }

  pauseConnection(pause: boolean): void { RICLog.verbose(`pauseConnection ${pause} - no effect for this channel type`); return; }

  // Handle notifications
  _onMsgRx(event: Event): void {
    // Get characteristic
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;

    // Get value
    const value = characteristic.value;
    if (value !== undefined) {
      const msg = new Uint8Array(value.buffer);

      // Handle message
      if (this._ricMsgHandler) {
        try {
          this._ricMsgHandler.handleNewRxMsg(msg);
        } catch (error) {
          RICLog.debug(`RICChannelWebBLE.onMsgRx ${error}`);
        }
      }
    }
  }

  // Send a message
  async sendTxMsg(
    msg: Uint8Array,
//    _sendWithResponse: boolean
  ): Promise<boolean> {
    // Check valid
    if (this._bleDevice === null) {
      return false;
    }

    // Retry upto maxRetries
    for (let retryIdx = 0; retryIdx < this.maxRetries; retryIdx++) {

      // Check for min time between messages
      while (Date.now() - this._msgTxTimeLast < this._msgTxMinTimeBetweenMs) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      this._msgTxTimeLast = Date.now();

      // Write to the characteristic
      try {
        if (this._characteristicTx) {
          if (this._characteristicTx.writeValueWithoutResponse) {
            await this._characteristicTx.writeValueWithoutResponse(msg);
          } else if (this._characteristicTx.writeValue) {
            await this._characteristicTx.writeValue(msg);
          } else if (this._characteristicTx.writeValueWithResponse) {
            await this._characteristicTx.writeValueWithResponse(msg);
          }
        }
        break;
      } catch (error) {
        if (retryIdx === this.maxRetries - 1) {
          RICLog.debug(`RICChannelWebBLE.sendTxMsg ${error} retried ${retryIdx} times`);
        }
      }
    }
    return true;
  }

  // Send message without awaiting response
  async sendTxMsgNoAwait(
    msg: Uint8Array,
//    _sendWithResponse: boolean
  ): Promise<boolean> {

    // Check valid
    if (this._bleDevice === null) {
      return false;
    }

    // Check for min time between messages
    while (Date.now() - this._msgTxTimeLast < this._msgTxMinTimeBetweenMs) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    this._msgTxTimeLast = Date.now();

    // Write to the characteristic
    if (this._characteristicTx) {
      if (this._characteristicTx.writeValue) {
        this._characteristicTx.writeValue(msg);
      } else if (this._characteristicTx.writeValueWithResponse) {
        this._characteristicTx.writeValueWithResponse(msg);
      }
      return true;
    }
    return false;
  }
}