/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import { RICFileDownloadFn, RICFileSendType, RICFWInfo, RICHWFWUpdRslt, RICOKFail, RICSystemInfo, RICUpdateInfo } from "./RICTypes";
import { RICUpdateEvent, RICUpdateEventFn } from "./RICUpdateEvents";
import RICMsgHandler from "./RICMsgHandler";
import axios from 'axios';
import RICFileHandler from "./RICFileHandler";
import RICLog from "./RICLog";
import RICSystem from "./RICSystem";
import RICUtils from "./RICUtils";

export default class RICUpdateManager {

  // Version info
  private _latestVersionInfo: RICUpdateInfo | null = null;
  private _updateESPRequired = false;
  private _updateElemsRequired = false;

  // FW update
  private readonly FW_UPDATE_CHECKS_BEFORE_ASSUME_FAILED = 10;
  private readonly ELEM_FW_CHECK_LOOPS = 36;

  // Progress levels
  private _progressAfterDownload = 0.1;
  private _progressDuringUpload = 0.8;
  private _progressDuringRestart = 0.015;
  // there may be two restarts during an update
  private _progressAfterUpload = this._progressAfterDownload + this._progressDuringUpload + 2*this._progressDuringRestart;
  

  // TESTS - set to true for testing OTA updates ONLY
  private readonly TEST_TRUNCATE_ESP_FILE = false;
  private readonly TEST_PRETEND_ELEM_UPDATE_REQD = false;
  private readonly TEST_PRETEND_INITIAL_VERSIONS_DIFFER = false;
  private readonly TEST_PRETEND_FINAL_VERSIONS_MATCH = false;
  private readonly TEST_SKIP_FW_UPDATE = false;

  constructor(private _ricMsgHandler: RICMsgHandler,
    private _ricFileHandler: RICFileHandler,
    private _ricSystem: RICSystem,
    private _eventListener: RICUpdateEventFn,
    private _firmwareTypeStrForMainFw: string,
    private _nonFirmwareElemTypes: string[],
    private _currentAppVersion: string,
    private _fileDownloader: RICFileDownloadFn,
    private _firmwareUpdateURL: string) {
  }

  async checkForUpdate(systemInfo: RICSystemInfo | null): Promise<RICUpdateEvent> {

    if (systemInfo === null) {
      return RICUpdateEvent.UPDATE_NOT_AVAILABLE;
    }

    this._latestVersionInfo = null;
    try {
      // handle url modifications
      let updateURL = this._firmwareUpdateURL;
      const ricSystemInfo = this._ricSystem.getCachedSystemInfo();
      if ((ricSystemInfo) && (ricSystemInfo.RicHwRevNo)) {
        updateURL = updateURL.replace("{HWRevNo}", ricSystemInfo.RicHwRevNo.toString());
      }
      // debug
      RICLog.debug(`Update URL: ${updateURL}`);
      const response = await axios.get(updateURL);
      this._latestVersionInfo = response.data;
    } catch (error) {
      RICLog.debug('checkForUpdate failed to get latest from internet');
    }
    if (this._latestVersionInfo === null) {
      return RICUpdateEvent.UPDATE_CANT_REACH_SERVER;
    }

    // Check the version and incomplete previous hw-elem update if needed
    try {
      const updateRequired = await this._isUpdateRequired(
        this._latestVersionInfo,
        systemInfo,
      );
      RICLog.debug(
        `checkForUpdate systemVersion ${systemInfo?.SystemVersion} available online ${this._latestVersionInfo?.firmwareVersion} updateRequired ${updateRequired}`
      );
      if (updateRequired) {
        if (RICUtils.isVersionGreater(
          this._latestVersionInfo.minimumUpdaterVersion.ota,
          this._currentAppVersion,
        )) {
          RICLog.debug(`App version ${this._currentAppVersion} but version ${this._latestVersionInfo.minimumUpdaterVersion.ota} required`);
          return RICUpdateEvent.UPDATE_APP_UPDATE_REQUIRED;
        } else {
          return RICUpdateEvent.UPDATE_IS_AVAILABLE;
        }
      } else {
        return RICUpdateEvent.UPDATE_NOT_AVAILABLE;
      }
    } catch (error) {
      RICLog.debug('Failed to get latest version from internet');
    }
    return RICUpdateEvent.UPDATE_CANT_REACH_SERVER;
  }

  async _isUpdateRequired(
    latestVersion: RICUpdateInfo,
    systemInfo: RICSystemInfo,
  ): Promise<boolean> {
    this._updateESPRequired = false;
    this._updateElemsRequired = false;

    // Perform the version check
    this._updateESPRequired = RICUtils.isVersionGreater(
      latestVersion.firmwareVersion,
      systemInfo.SystemVersion,
    );

    // Test ONLY pretend an update is needed
    if (this.TEST_PRETEND_INITIAL_VERSIONS_DIFFER) {
      this._updateESPRequired = true;
    }

    // Check if a previous hw-elem update didn't complete - but no point if we would update anyway
    if (!this._updateESPRequired) {
      try {
        const elUpdRslt = await this._ricMsgHandler.sendRICRESTURL<RICHWFWUpdRslt>('hwfwupd');

        // Check result
        this._updateElemsRequired =
          elUpdRslt.rslt === 'ok' && elUpdRslt.st.i === 1;

        // Debug
        if (this._updateElemsRequired) {
          RICLog.debug('isUpdateRequired - prev incomplete');
        } else {
          RICLog.debug('isUpdateRequired - prev complete');
        }

        // Test ONLY pretend an element update is needed
        if (this.TEST_PRETEND_ELEM_UPDATE_REQD) {
          this._updateElemsRequired = true;
        }
      } catch (error) {
        RICLog.debug(
          'isUpdateRequired failed to get hw-elem firmware update status',
        );
      }
    } else {
      this._updateElemsRequired = true;
    }
    return this._updateESPRequired || this._updateElemsRequired;
  }

  // Mark: Firmware udpate ------------------------------------------------------------------------------------------------

  async firmwareUpdate(): Promise<RICUpdateEvent> {
    // Check valid
    if (this._latestVersionInfo === null) return RICUpdateEvent.UPDATE_NOT_CONFIGURED;

    // Update started
    this._eventListener(RICUpdateEvent.UPDATE_STARTED);
    this._eventListener(RICUpdateEvent.UPDATE_PROGRESS, { stage: 'Downloading firmware', progress: 0 });

    // parse version file to extract only "ota" files
    const firmwareList: Array<RICFWInfo> = [];
    let mainFwInfo: RICFWInfo | null = null;
    this._latestVersionInfo.files.forEach((fileInfo) => {
      if (fileInfo.updaters.includes("ota")) {
        fileInfo.downloadUrl = fileInfo.firmware || fileInfo.downloadUrl;
        if (fileInfo.elemType === this._firmwareTypeStrForMainFw) {
          mainFwInfo = fileInfo;
        } else {
          firmwareList.push(fileInfo);
        }
        RICLog.debug(`fwUpdate selected file ${fileInfo.destname} for download`);
      }
    })

    // Add the main firware if it is required
    if (this._updateESPRequired && mainFwInfo != null) {
      firmwareList.unshift(mainFwInfo);   // add to front of array so it's downloaded first
    }

    // Binary data downloaded from the internet
    const firmwareData = new Array<Uint8Array>();

    // Iterate through the firmware entities
    const numFw = firmwareList.length;
    try {
      for (let fwIdx = 0; fwIdx < firmwareList.length; fwIdx++) {
        // Download the firmware
        RICLog.debug(`fwUpdate downloading file URI ${firmwareList[fwIdx].downloadUrl}`);
        const downloadResult = await this._fileDownloader(firmwareList[fwIdx].downloadUrl,
            (received: number, total: number) => {
                const currentProgress = ((fwIdx + received / total) / numFw) * this._progressAfterDownload;
                this._eventListener(RICUpdateEvent.UPDATE_PROGRESS, 
                        { stage: 'Downloading firmware', progress: currentProgress });
            });
        if (downloadResult.downloadedOk && downloadResult.fileData != null) {
          firmwareData.push(downloadResult.fileData);
        } else {
          this._eventListener(RICUpdateEvent.UPDATE_FAILED);
          throw Error('file download res null');
        }
      }
    } catch (error: unknown) {
      RICLog.debug(`fwUpdate error ${error}`);
      this._eventListener(RICUpdateEvent.UPDATE_FAILED);
      return RICUpdateEvent.UPDATE_FAILED;
    }

    // Test ONLY truncate the main firmware
    if (this._updateESPRequired && mainFwInfo != null && this.TEST_TRUNCATE_ESP_FILE) {
      firmwareData[0] = new Uint8Array(500);
    }

    // Calculate total length of data
    let totalBytes = 0;
    for (const fileData of firmwareData) {
      totalBytes += fileData.length;
    }

    // Debug
    RICLog.debug(`fwUpdate got ok ${firmwareData.length} files total ${totalBytes} bytes`);

    // Start uploading
    this._eventListener(RICUpdateEvent.UPDATE_PROGRESS, { stage: 'Starting firmware upload', progress: this._progressAfterDownload });

    // Upload each file
    let updateEvent : RICUpdateEvent = RICUpdateEvent.UPDATE_PROGRESS;
    let updateStage = "Uploading new firmware\nThis may take a while, please be patient";
    try {
      let sentBytes = 0;
      for (let fwIdx = 0; fwIdx < firmwareData.length; fwIdx++) {
        RICLog.debug(`fwUpdate uploading file name ${firmwareList[fwIdx].destname} len ${firmwareData[fwIdx].length}`);
        const elemType = firmwareList[fwIdx].elemType === this._firmwareTypeStrForMainFw
          ? RICFileSendType.RIC_FIRMWARE_UPDATE
          : RICFileSendType.RIC_NORMAL_FILE;
        let percComplete = ((sentBytes /totalBytes) * this._progressDuringUpload + this._progressAfterDownload);

        if (updateEvent == RICUpdateEvent.UPDATE_PROGRESS && elemType == RICFileSendType.RIC_NORMAL_FILE){
          // start of filesystem updates
          updateEvent = RICUpdateEvent.UPDATE_PROGRESS_FILESYSTEM;
          updateStage = 'Updating system files\nThis may take a while, please be patient\nUpdate cannot be cancelled during this stage\n';
          // emit event so app can deactivate cancel button
          this._eventListener(updateEvent,
            {
              stage: updateStage,
              progress: percComplete,
            }
          );
          // Reformat filesystem. This will take a few seconds so set a long timeout for the response
          RICLog.debug(`Beginning file system update. Reformatting FS.`);
          await this._ricMsgHandler.sendRICRESTURL<RICOKFail>("reformatfs", 15000);
          // trigger and wait for reboot
          RICLog.debug(`Restarting RIC`);
          await this._ricSystem.runCommand("reset", {});
          if (!(await this.waitForRestart(percComplete, updateEvent))){
            this._eventListener(RICUpdateEvent.UPDATE_FAILED);
            return RICUpdateEvent.UPDATE_FAILED;
          }
        }

        if (elemType == RICFileSendType.RIC_FIRMWARE_UPDATE && this.TEST_SKIP_FW_UPDATE ){
          RICLog.debug("fwUpdate: Skipping FW update");
        } else {
          await this.fileSend(
            firmwareList[fwIdx].destname,
            elemType,
            firmwareData[fwIdx],
            (_, __, progress) => {
              let percComplete =
                ((sentBytes + progress * firmwareData[fwIdx].length) /
                  totalBytes) * this._progressDuringUpload +
                this._progressAfterDownload;
              if (elemType == RICFileSendType.RIC_NORMAL_FILE) percComplete += (this._progressDuringRestart*2);
              if (percComplete > 1.0) percComplete = 1.0;
              RICLog.debug(
                `fwUpdate progress ${progress.toFixed(2)} sent ${sentBytes} len ${firmwareData[fwIdx].length} total ${totalBytes} propComplete ${percComplete.toFixed(2)}`,
              );
              this._eventListener(
                updateEvent,
                {
                  stage: updateStage,
                  progress: percComplete,
                }
              );
            },
          );
        }
        sentBytes += firmwareData[fwIdx].length;
        if (elemType == RICFileSendType.RIC_FIRMWARE_UPDATE){
          percComplete = (sentBytes /totalBytes) * this._progressDuringUpload + this._progressAfterDownload;
          // if the element was firmware, RIC will now restart automatically
          if (!(await this.waitForRestart(percComplete, updateEvent, this._latestVersionInfo?.firmwareVersion))){
            this._eventListener(RICUpdateEvent.UPDATE_FAILED);
            return RICUpdateEvent.UPDATE_FAILED;
          }
          
        }
      }
    } catch (error) {
      RICLog.debug(`fwUpdate error ${error}`);
      this._eventListener(RICUpdateEvent.UPDATE_FAILED);
      return RICUpdateEvent.UPDATE_FAILED;
    }

    // Issue requests for hw-elem firmware updates
    let elemFwIdx = 0;
    let allElemsUpdatedOk = true;
    for (const elemFw of firmwareList) {
      // Update progress
      const percComplete =
        this._progressAfterUpload +
        ((1 - this._progressAfterUpload) * elemFwIdx) / firmwareList.length;
      this._eventListener(RICUpdateEvent.UPDATE_PROGRESS, { stage: 'Updating elements', progress: percComplete });
      elemFwIdx++;

      // Check element is not main
      if (elemFw.elemType === this._firmwareTypeStrForMainFw) continue;

      // Non-firmware elemTypes
      if (this._nonFirmwareElemTypes.includes(elemFw.elemType)) continue;

      // Start hw-elem update
      const updateCmd = `hwfwupd/${elemFw.elemType}/${elemFw.destname}/all`;
      try {
        await this._ricMsgHandler.sendRICRESTURL<RICOKFail>(updateCmd);
      } catch (error) {
        RICLog.debug(`fwUpdate failed to start hw-elem firmware update cmd ${updateCmd}`);

        // Continue with other firmwares
        continue;
      }

      // Check the status
      for (
        let updateCheckLoop = 0;
        updateCheckLoop < this.ELEM_FW_CHECK_LOOPS;
        updateCheckLoop++
      ) {
        try {
          // Wait for process to start on ESP32
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Get result (or status)
          const elUpdRslt = await this._ricMsgHandler.sendRICRESTURL<RICHWFWUpdRslt>('hwfwupd');

          // Check result
          if (
            elUpdRslt.rslt === 'ok' &&
            (elUpdRslt.st.s === 'idle' || elUpdRslt.st.s === 'done')
          ) {
            RICLog.debug(`fwUpdate hw-elem firmware updated ok - status ${elUpdRslt.st.s} rsltmsg ${elUpdRslt.st.m}`);

            // Check if any update outstanding (incomplete === 0)
            allElemsUpdatedOk = elUpdRslt.st.i === 0;
            break;
          }
        } catch (error) {
          RICLog.debug(`failed to get hw-elem firmware update status`);
        }
      }
    }

    // Done update
    this._eventListener(RICUpdateEvent.UPDATE_PROGRESS, { stage: 'Finished', progress: 1 });
    let updateResult = RICUpdateEvent.UPDATE_SUCCESS_ALL;
    if (allElemsUpdatedOk) {
      this._eventListener(updateResult, this._ricSystem.getCachedSystemInfo());
    } else {
      updateResult = RICUpdateEvent.UPDATE_SUCCESS_MAIN_ONLY;
      this._eventListener(updateResult, this._ricSystem.getCachedSystemInfo());
    }
    return updateResult;
  }

  async waitForRestart(percComplete : number, updateEvent : RICUpdateEvent,  checkFwVersion : string | null = null){
    RICLog.debug(`fwUpdate: Waiting for restart. percComplete ${percComplete}, updateEvent ${updateEvent}, checkFwVersion: ${checkFwVersion}`);
    // Wait for firmware update to complete, restart to occur
    // and BLE reconnection to happen
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      this._eventListener(updateEvent,
        {
          stage: 'Restarting Marty',
          progress: percComplete + (this._progressDuringRestart*i)/3,
        }
      );
      RICLog.debug('fwUpdate waiting for reset');
    }

    // Attempt to get status from main ESP32 update
    // The ESP32 will power cycle at this point so we need to wait a while
    let versionConfirmed = false;
    for (
      let fwUpdateCheckCount = 0;
      fwUpdateCheckCount < this.FW_UPDATE_CHECKS_BEFORE_ASSUME_FAILED;
      fwUpdateCheckCount++
    ) {
      try {
        // Get version
        RICLog.debug(`fwUpdate attempting to get RIC version attempt ${fwUpdateCheckCount}`);
        const systemInfo = await this._ricSystem.getRICSystemInfo(true);
        RICLog.debug(
          `fwUpdate version rslt "${systemInfo.rslt}" RIC Version ${systemInfo.SystemVersion}`,
        );
        if (systemInfo.rslt !== 'ok') {
          continue;
        }

        if (checkFwVersion != null){
          // Check version
          versionConfirmed = RICUtils.isVersionEqual(
            checkFwVersion,
            systemInfo.SystemVersion,
          );
          RICLog.debug(`fwUpdate got version rslt ${versionConfirmed}`);
        } else {
          versionConfirmed = true;
        }

        // Test fiddle to say it worked!
        if (this.TEST_PRETEND_FINAL_VERSIONS_MATCH) {
          versionConfirmed = true;
        }
        break;
      } catch (error) {
        RICLog.debug(`fwUpdate failed to get version attempt', ${fwUpdateCheckCount} error ${error}`);
      }
    }
  
    return versionConfirmed;
  }

  async firmwareUpdateCancel() {
    this._eventListener(RICUpdateEvent.UPDATE_CANCELLING);

    await this.fileSendCancel();
  }

  // Mark: File Transfer ------------------------------------------------------------------------------------

  /**
   *
   * fileSend - start file transfer
   * @param fileName name of file to send
   * @param fileType normal file or firmware
   * @param fileContents contenst of the file (binary object)
   * @returns Promise<boolean>
   *
   */
  async fileSend(
    fileName: string,
    fileType: RICFileSendType,
    fileContents: Uint8Array,
    progressCallback: (sent: number, total: number, progress: number) => void,
  ): Promise<boolean> {
    return await this._ricFileHandler.fileSend(
      fileName,
      fileType,
      fileContents,
      progressCallback,
    );
  }

  fileSendCancel() {
    return this._ricFileHandler.fileSendCancel();
  }
}
