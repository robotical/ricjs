/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import { RICFileDownloadIF, RICFileSendType, RICFWInfo, RICHWFWUpdRslt, RICOKFail, RICSystemInfo, RICUpdateInfo } from "./RICTypes";
import { RICUpdateEvent, RICUpdateEventIF } from "./RICUpdateEvents";
import RICMsgHandler from "./RICMsgHandler";
import semverEq from 'semver/functions/eq';
import semverGt from 'semver/functions/gt';
import axios from 'axios';
import RICFileHandler from "./RICFileHandler";
import RICLog from "./RICLog";
import RICSystem from "./RICSystem";

export default class RICUpdateManager {

  // Event callbakcs
  _eventListener: RICUpdateEventIF;

  // Message handler
  _ricMsgHandler: RICMsgHandler;

  // File handler
  _ricFileHandler: RICFileHandler;

  // File downloader
  _fileDownloader: RICFileDownloadIF;

  // Firmware update URL
  _firmwareUpdateURL: string;

  // RIC system
  _ricSystem: RICSystem;

  // Version info
  _latestVersionInfo: RICUpdateInfo | null = null;
  _updateESPRequired = false;
  _updateElemsRequired = false;

  // FW update
  FW_UPDATE_CHECKS_BEFORE_ASSUME_FAILED = 10;
  ELEM_FW_CHECK_LOOPS = 36;
  _firmwareTypeStrForMainFw: string;
  _nonFirmwareElemTypes: string[];

  // Progress levels
  _progressAfterDownload = 0.1;
  _progressAfterUpload = 0.9;
  _progressAfterRestart = 0.93;

  // App version
  _appVersion = '';

  // TESTS - set to true for testing OTA updates ONLY
  TEST_TRUNCATE_ESP_FILE = false;
  TEST_PRETEND_ELEM_UPDATE_REQD = false;
  TEST_PRETEND_INITIAL_VERSIONS_DIFFER = false;
  TEST_PRETEND_FINAL_VERSIONS_MATCH = false;

  constructor(ricMsgHandler: RICMsgHandler,
    ricFileHandler: RICFileHandler,
    ricSystem: RICSystem,
    eventListener: RICUpdateEventIF,
    firmwareTypeStrForMainFw: string,
    nonFirmwareElemTypes: string[],
    currentAppVersion: string,
    fileDownloader: RICFileDownloadIF,
    firmwareUpdateURL: string) {
    this._ricMsgHandler = ricMsgHandler;
    this._ricFileHandler = ricFileHandler;
    this._ricSystem = ricSystem;
    this._eventListener = eventListener;
    this._firmwareTypeStrForMainFw = firmwareTypeStrForMainFw;
    this._nonFirmwareElemTypes = nonFirmwareElemTypes;
    this._appVersion = currentAppVersion;
    this._fileDownloader = fileDownloader;
    this._firmwareUpdateURL = firmwareUpdateURL;
  }

  async checkForUpdate(systemInfo: RICSystemInfo | null): Promise<RICUpdateEvent> {

    if (systemInfo === null) {
      return RICUpdateEvent.UPDATE_NOT_AVAILABLE;
    }

    this._latestVersionInfo = null;
    try {
      // live version
      const updateURL = this._firmwareUpdateURL;
      // internal testing
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
        if (semverGt(
          this._latestVersionInfo.minimumUpdaterVersion.ota,
          this._appVersion,
        )) {
          RICLog.debug(`App version ${this._appVersion} but version ${this._latestVersionInfo.minimumUpdaterVersion.ota} required`);
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
    this._updateESPRequired = semverGt(
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

  async firmwareUpdate() {
    // Check valid
    if (this._latestVersionInfo === null) return;

    // Update started
    this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_STARTED);
    this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_PROGRESS, { stage: 'Downloading firmware', progress: 0 });

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
      firmwareList.push(mainFwInfo);
    }

    // Binary data downloaded from the internet
    const firmwareData = new Array<Uint8Array>();

    // Iterate through the firmware entities
    const numFw = firmwareList.length;
    try {
      for (let fwIdx = 0; fwIdx < firmwareList.length; fwIdx++) {
        // Download the firmware
        RICLog.debug(`fwUpdate downloading file URI ${firmwareList[fwIdx].downloadUrl}`);
        const downloadResult = await this._fileDownloader.downloadFile(firmwareList[fwIdx].downloadUrl,
            (received: number, total: number) => {
                const currentProgress = ((fwIdx + received / total) / numFw) * this._progressAfterDownload;
                this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_PROGRESS, 
                        { stage: 'Downloading firmware', progress: currentProgress });
            });
        if (downloadResult.downloadedOk && downloadResult.fileData != null) {
          firmwareData.push(downloadResult.fileData);
        } else {
          this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_FAILED);
          throw Error('file download res null');
        }
      }
    } catch (error: unknown) {
      RICLog.debug(`fwUpdate error ${error}`);
      this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_FAILED);
      return;
    }

    // Test ONLY truncate the main firmware
    if (this._updateESPRequired && this.TEST_TRUNCATE_ESP_FILE) {
      firmwareData[firmwareData.length - 1] = new Uint8Array(500);
    }

    // Calculate total length of data
    let totalBytes = 0;
    for (const fileData of firmwareData) {
      totalBytes += fileData.length;
    }

    // Debug
    RICLog.debug(`fwUpdate got ok ${firmwareData.length} files total ${totalBytes} bytes`);

    // Start uploading
    this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_PROGRESS, { stage: 'Starting firmware upload', progress: this._progressAfterDownload });

    // Upload each file
    try {
      let sentBytes = 0;
      for (let fwIdx = 0; fwIdx < firmwareData.length; fwIdx++) {
        RICLog.debug(`fwUpdate uploading file name ${firmwareList[fwIdx].destname} len ${firmwareData[fwIdx].length}`);
        const elemType = firmwareList[fwIdx].elemType === this._firmwareTypeStrForMainFw
          ? RICFileSendType.RIC_FIRMWARE_UPDATE
          : RICFileSendType.RIC_NORMAL_FILE;
        await this.fileSend(
          firmwareList[fwIdx].destname,
          elemType,
          firmwareData[fwIdx],
          (_, __, progress) => {
            let percComplete =
              ((sentBytes + progress * firmwareData[fwIdx].length) /
                totalBytes) *
              (this._progressAfterUpload - this._progressAfterDownload) +
              this._progressAfterDownload;
            if (percComplete > 1.0) percComplete = 1.0;
            RICLog.debug(
              `fwUpdate progress ${progress.toFixed(2)} sent ${sentBytes} len ${firmwareData[fwIdx].length} total ${totalBytes} propComplete ${percComplete.toFixed(2)}`,
            );
            this._eventListener.onUpdateManagerEvent(
              RICUpdateEvent.UPDATE_PROGRESS,
              {
                stage: 'Uploading new firmware\nThis may take a while, please be patient',
                progress: percComplete,
              }
            );
          },
        );
        sentBytes += firmwareData[fwIdx].length;
      }
    } catch (error) {
      RICLog.debug(`fwUpdate error ${error}`);
      this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_FAILED);
      return;
    }

    // If we did an ESP32 update
    if (this._updateESPRequired) {
      // Wait for firmware update to complete, restart to occur
      // and BLE reconnection to happen
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const percComplete =
          this._progressAfterUpload +
          ((this._progressAfterRestart - this._progressAfterUpload) * i) / 3;
        this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_PROGRESS,
          {
            stage: 'Restarting Marty',
            progress: percComplete,
          }
        );
        RICLog.debug('fwUpdate waiting for reset');
      }

      // Attempt to get status from main ESP32 update
      // The ESP32 will power cycle at this point so we need to wait a while
      let firmwareUpdateConfirmed = false;
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

          // Check version
          firmwareUpdateConfirmed = semverEq(
            this._latestVersionInfo?.firmwareVersion,
            systemInfo.SystemVersion,
          );
          RICLog.debug(`fwUpdate got version rslt ${firmwareUpdateConfirmed}`);

          // Test fiddle to say it worked!
          if (this.TEST_PRETEND_FINAL_VERSIONS_MATCH) {
            firmwareUpdateConfirmed = true;
          }
          break;
        } catch (error) {
          RICLog.debug(`fwUpdate failed to get version attempt', ${fwUpdateCheckCount} error ${error}`);
        }
      }

      // Check if we're confirmed successful
      if (!firmwareUpdateConfirmed) {
        this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_FAILED);
        return;
      }
    }

    // Issue requests for hw-elem firmware updates
    let elemFwIdx = 0;
    let allElemsUpdatedOk = true;
    for (const elemFw of firmwareList) {
      // Update progress
      const percComplete =
        this._progressAfterRestart +
        ((1 - this._progressAfterRestart) * elemFwIdx) / firmwareList.length;
      this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_PROGRESS, { stage: 'Updating elements', progress: percComplete });
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
    this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_PROGRESS, { stage: 'Finished', progress: 1 });
    if (allElemsUpdatedOk) {
      this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_SUCCESS_ALL, this._ricSystem.getCachedSystemInfo());
    } else {
      this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_SUCCESS_MAIN_ONLY, this._ricSystem.getCachedSystemInfo());
    }
  }

  async firmwareUpdateCancel() {
    this._eventListener.onUpdateManagerEvent(RICUpdateEvent.UPDATE_CANCELLING);

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
