@fitbit/pulse
===============

PULSE is a layered protocol stack. The link layer provides integrity-assured delivery of packet data. On top of the link layer is a suite of transport protocols which provide multiprotocol delivery of application datagrams with or without guaranteed reliable in-order delivery. Application protocols use one or more of the available transports to exchange datagrams between the firmware running on a board and a host workstation.

This repo provides a TypeScript implementation of the protocol stack with minimal dependencies.

Example usage:
--------------

```
import SerialPort from 'serialport';

const port = new SerialPort('/dev/cu.usbmodem01013');
const intf = Interface.create(port); // Port can be any duplex stream

intf.getLink(async link => {
  const transportType = 'reliable'; // reliable or bestEffort
  const port = 0x3e20; // Port number specific to your usage, must be <= 65535

  const socket = await link.openSocket(transportType, port);

  socket.on('data', msg => console.log(`RX data: ${msg}`));
  socket.send(Buffer.from('Hello world!'));
});
```
