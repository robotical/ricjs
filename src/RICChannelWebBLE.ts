import RICChannel from "./RICChannel";
import RICLog from "./RICLog";
import RICMsgHandler from "./RICMsgHandler";

export default class RICChannelWebBLE implements RICChannel {

  // BLE UUIDS
  static RICServiceUUID = 'aa76677e-9cfd-4626-a510-0d305be57c8d';
  static RICCmdUUID = 'aa76677e-9cfd-4626-a510-0d305be57c8e';
  static RICRespUUID = 'aa76677e-9cfd-4626-a510-0d305be57c8f';

  // Device and characteristics
  private _bleDevice: BluetoothDevice | null = null;
  private _characteristicTx: BluetoothRemoteGATTCharacteristic | null = null;
  private _characteristicRx: BluetoothRemoteGATTCharacteristic | null = null;

  // Message handler
  private _ricMsgHandler: RICMsgHandler | null = null;

  // Last message tx time
  private _msgTxTimeLast = Date.now();
  private _msgTxMinTimeBetweenMs = 15;

  // Connected flag
  private _isConnected = false;

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
      console.log("Web Bluetooth is supported in your browser.");
      return true;
    } else {
      window.alert('Web Bluetooth API is not available.\n' +
        'Please make sure the "Experimental Web Platform features" flag is enabled.');
      return false;
    }
  }

  // isConnected
  isConnected(_forceCheck: boolean): boolean {
    return (this._bleDevice !== null) && this._isConnected;
  }

  // Set retry channel mode
  setRetryConnectionIfLost(_retry: boolean): void {
    // TODO 2022 - Not implemented yet
  }

  // Disconnection event
  onDisconnected(event: Event) {
    const device = event.target;
    console.log(`RICChannelWebBLE.onDisconnected ${device}`);
    this._isConnected = false;
  }

  // Connect to a device
  async connect(locator: string | object): Promise<boolean> {
    // console.log(`Selected device: ${deviceID}`);
    this._bleDevice = locator as BluetoothDevice;
    if (this._bleDevice && this._bleDevice.gatt) {
      try {
        await this._bleDevice.gatt.connect();
        console.log(`RICChannelWebBLE.connect - starting connection to device ${this._bleDevice.name}`);

        // Add disconnect listener
        this._bleDevice.addEventListener('gattserverdisconnected', this.onDisconnected.bind(this));

        // Get service
        try {
          const service = await this._bleDevice.gatt.getPrimaryService(RICChannelWebBLE.RICServiceUUID);
          console.log(`RICChannelWebBLE.connect - found service: ${service.uuid}`);

          try {
            // Get Tx and Rx characteristics
            this._characteristicTx = await service.getCharacteristic(RICChannelWebBLE.RICCmdUUID);
            console.log(`RICChannelWebBLE.connect - found char ${this._characteristicTx.uuid}`);
            this._characteristicRx = await service.getCharacteristic(RICChannelWebBLE.RICRespUUID);
            console.log(`RICChannelWebBLE.connect - found char ${this._characteristicRx.uuid}`);

            // Notifications of received messages
            try {
              await this._characteristicRx.startNotifications();
              console.log('RICChannelWebBLE.connect - notifications started');
              this._characteristicRx.addEventListener('characteristicvaluechanged', this._onMsgRx.bind(this));
            } catch (error) {
              console.log('RICChannelWebBLE.connnect - addEventListener failed ' + error);
            }

            // Connected ok
            console.log(`RICChannelWebBLE.connect ${this._bleDevice.name}`);

            // Connected
            this._isConnected = true;

            return true;

          } catch (error) {
            console.log(`Cannot find characteristic: ${error}`);
          }
        } catch (error) {
          console.log(`Cannot get service ${error}`);
        }
      } catch (error) {
        console.log(error);
      }
    }
    return false;
  }

  async disconnect(): Promise<void> {
    if (this._bleDevice && this._bleDevice.gatt) {
      try {
        await this._bleDevice.gatt.disconnect();
      } catch (error) {
        console.log(`RICChannelWebBLE.disconnect ${error}`);
      }
    }
  }

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
    _sendWithResponse: boolean
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
    try {
      if (this._characteristicTx) {
        if (this._characteristicTx.writeValue) {
          await this._characteristicTx.writeValue(msg);
        } else if (this._characteristicTx.writeValueWithResponse) {
          await this._characteristicTx.writeValueWithResponse(msg);
        }
      }
    } catch (error) {
      RICLog.debug(`RICChannelWebBLE.sendTxMsg ${error}`);
      return false;
    }
    return true;
  }

  async sendTxMsgNoAwait(
    msg: Uint8Array,
    _sendWithResponse: boolean
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