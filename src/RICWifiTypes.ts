/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export enum RICWifiConnState {
  WIFI_CONN_NONE,
  WIFI_CONN_CONNECTED,
}

export class RICWifiConnStatus {
  connState = RICWifiConnState.WIFI_CONN_NONE;
  isPaused = false;
  ipAddress = '';
  hostname = '';
  ssid = '';
  bssid = '';
}

export class RICSysModInfoWiFi {
  rslt = 'ok';
  isConn = 0;
  isPaused = 0;
  connState = 'None';
  SSID = '';
  IP = '';
  Hostname = '';
  WiFiMAC = '';
}

