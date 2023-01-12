/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// RICJS
// Communications Library
//
// Rob Dobson & Chris Greening 2020-2022
// (C) 2020-2022
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export var RICWifiConnState;
(function (RICWifiConnState) {
    RICWifiConnState[RICWifiConnState["WIFI_CONN_NONE"] = 0] = "WIFI_CONN_NONE";
    RICWifiConnState[RICWifiConnState["WIFI_CONN_CONNECTED"] = 1] = "WIFI_CONN_CONNECTED";
})(RICWifiConnState || (RICWifiConnState = {}));
export class RICWifiConnStatus {
    connState = RICWifiConnState.WIFI_CONN_NONE;
    isPaused = false;
    ipAddress = '';
    hostname = '';
    ssid = '';
    bssid = '';
    validMs = 0;
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
