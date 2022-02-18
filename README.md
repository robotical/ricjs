# @robotical/ricjs
Javascript/TS library for Robotical RIC

## Install

```bash
$ npm install @robotical/ricjs
```

## Usage

```js

  // Comms stats
  _commsStats: RICCommsStats = new RICCommsStats();

  // Add-on Manager
  _addOnManager = new RICAddOnManager();

  // Message handler
  _ricMsgHandler: RICMsgHandler = new RICMsgHandler(
    _commsStats,
    _addOnManager,
  );

  // RICSystem
  _ricSystem: RICSystem = new RICSystem(_ricMsgHandler, _addOnManager);

  // In order to send information the RICMsgHandler created above, a
  // communications channel which implements the interface RICMessageSender
  // must be registered with the message handler, e.g.
  _ricBLEChannel = new RICBLEChannel();
  _ricMsgHandler.registerMsgSender(_ricBLEChannel);

  // And to receive data the message handler needs to be registered with 
  // the channel
  _ricBLEChannel.setMsgHandler(_ricMsgHandler);

  // Retrieve information about RIC
  await _ricSystem.retrieveInfo();

  // Access the RIC system information
  const systemInfo: RICSystemInfo = await _ricSystem.getRICSystemInfo();

  // Show the version number of RIC
  console.log(systemInfo.SystemVersion)

```
