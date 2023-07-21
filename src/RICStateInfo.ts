import RICAddOnManager from "./RICAddOnManager";
import RICCommsStats from "./RICCommsStats";
import { RICSERIAL_PAYLOAD_POS } from "./RICProtocolDefs";
import { RICROSSerial, ROSCameraData, ROSSerialAddOnStatusList, ROSSerialIMU, ROSSerialPowerStatus, ROSSerialRobotStatus, ROSSerialSmartServos } from "./RICROSSerial";

export class RICStateInfo {
    smartServos: ROSSerialSmartServos = new ROSSerialSmartServos();
    smartServosValidMs = 0;
    imuData: ROSSerialIMU = new ROSSerialIMU();
    imuDataValidMs = 0;
    power: ROSSerialPowerStatus = new ROSSerialPowerStatus();
    powerValidMs = 0;
    addOnInfo: ROSSerialAddOnStatusList = new ROSSerialAddOnStatusList();
    addOnInfoValidMs = 0;
    robotStatus: ROSSerialRobotStatus = new ROSSerialRobotStatus();
    robotStatusValidMs = 0;
    cameraData: ROSCameraData = new ROSCameraData();
    cameraDataValidMs = 0;

    updateFromROSSerialMsg(rxMsg: Uint8Array, commsStats: RICCommsStats, 
              addOnManager: RICAddOnManager, frameTimeMs: number): Array<number> {
        return RICROSSerial.decode(
            rxMsg,
            RICSERIAL_PAYLOAD_POS,
            commsStats,
            addOnManager,
            this,
            frameTimeMs
          );    
    }
  }
  