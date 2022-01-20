import ReliableTransport from './ReliableTransport';
import Interface from '../Interface';
import { encode } from '../encodingUtil';
import Socket from '../Socket';
import PPPFrame from '../ppp/PPPFrame';
import LCPEncapsulation from '../ppp/LCPEncapsulation';
import { ControlCode } from '../ppp/ControlProtocol';
import InterfaceSocket from '../InterfaceSocket';
import ReliableInfoPacket from './ReliableInfoPacket';
import ReliableSupervisoryPacket, {
  SupervisoryPacketKind,
} from './ReliableSupervisoryPacket';

let intf: Interface;
let transport: ReliableTransport;
let commandSocket: InterfaceSocket;
let responseSocket: InterfaceSocket;

let commandSocketSendSpy: jest.SpyInstance;
let responseSocketSendSpy: jest.SpyInstance;
let restartSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  intf = new Interface();
  transport = new ReliableTransport(intf, 1500);

  // eslint-disable-next-line
  restartSpy = jest.spyOn((transport as any).ncp, 'restart');

  // eslint-disable-next-line
  commandSocket = (transport as any).commandSocket;
  // eslint-disable-next-line
  responseSocket = (transport as any).responseSocket;

  commandSocketSendSpy = jest.spyOn(commandSocket, 'send');
  responseSocketSendSpy = jest.spyOn(responseSocket, 'send');
});

afterEach(() => {
  jest.useRealTimers();
});

function openTransport(): void {
  intf.write(
    PPPFrame.build(0xba33, LCPEncapsulation.build(ControlCode.ConfigureAck, 0)),
  );

  intf.write(
    PPPFrame.build(
      0xba33,
      LCPEncapsulation.build(ControlCode.ConfigureRequest, 0),
    ),
  );
}

function sendRR(): void {
  intf.write(
    PPPFrame.build(
      0x3a35,
      ReliableSupervisoryPacket.build(SupervisoryPacketKind.RR, 0, true),
    ),
  );
}

describe('when closed', () => {
  it('throws when sending a packet', () => {
    expect(() => transport.send(0xdead, encode('not gonna work'))).toThrowError(
      'I/O operation before transport is opened',
    );
  });

  it('throws if opening socket on not-yet-open transport times out', () => {
    const socketPromise = transport.openSocket(0xf00d, 0);
    jest.runAllTimers();
    return expect(socketPromise).rejects.toThrowError(
      'Timed out waiting for transport to open socket',
    );
  });

  it('throws if opening socket on closed transport', async () => {
    transport.down();
    const socketPromise = transport.openSocket(0xf00d, 0);
    jest.runAllTimers();
    return expect(socketPromise).rejects.toThrowError(
      'Cannot open socket on closed transport',
    );
  });

  it('throws if sending on closed transport', () => {
    transport.down();
    expect(() => transport.send(0xf00d, Buffer.alloc(1))).toThrowError(
      'I/O operation on closed transport',
    );
  });

  it('throws if sending on not-yet-open transport', () => {
    expect(() => transport.send(0xf00d, Buffer.alloc(1))).toThrowError(
      'I/O operation before transport is opened',
    );
  });

  it('waits for NCP to open when opening a socket', async () => {
    let opened = false;
    const socketPromise = transport.openSocket(0xf00d, 1000);
    void socketPromise.then(() => {
      opened = true;
    });
    expect(opened).toEqual(false);

    // eslint-disable-next-line
    (transport as any).opened.set();

    await expect(socketPromise).resolves.toBeInstanceOf(Socket);
    expect(opened).toEqual(true);
  });

  it('ignores a packet received before transport is open', () => {
    expect(() =>
      intf.write(PPPFrame.build(0x3a29, Buffer.alloc(1))),
    ).not.toThrowError();
  });
});

describe('connection establishment', () => {
  beforeEach(() => {
    openTransport();
  });

  it('sends an RR packet after transport layer goes up', () => {
    expect(commandSocketSendSpy).toBeCalledWith(
      ReliableSupervisoryPacket.build(SupervisoryPacketKind.RR, 0, true),
    );
  });

  it('retransmits RR command until response received', () => {
    // Make the first three RR commands ignored
    jest.runOnlyPendingTimers();
    jest.runOnlyPendingTimers();
    jest.runOnlyPendingTimers();

    expect(jest.getTimerCount()).toEqual(1);
    sendRR();

    // Fourth time's the charm!
    expect(commandSocketSendSpy).toBeCalledTimes(4);

    // eslint-disable-next-line
    return expect((transport as any).opened.wait()).resolves.toEqual(true);
  });

  it('transport negotiation restarts if no RR received', () => {
    jest.runAllTimers();
    expect(jest.getTimerCount()).toEqual(0);
    expect(restartSpy).toBeCalledTimes(1);
  });
});

describe('when open', () => {
  beforeEach(() => {
    openTransport();
    sendRR();

    // Check the transport is open
    // eslint-disable-next-line
    return expect((transport as any).opened.wait()).resolves.toEqual(true);
  });

  it('sends an RR packet after transport layer goes up', () => {
    expect(commandSocketSendSpy).toBeCalledWith(
      ReliableSupervisoryPacket.build(SupervisoryPacketKind.RR, 0, true),
    );
  });

  it('send with immediate ack', () => {
    const data = Buffer.from('moar data!');
    transport.send(0xbeef, data);

    expect(commandSocketSendSpy).toBeCalledWith(
      ReliableInfoPacket.build(0, 0, true, 0xbeef, data),
    );

    expect(jest.getTimerCount()).toEqual(1);

    intf.write(
      PPPFrame.build(
        0x3a35,
        ReliableSupervisoryPacket.build(SupervisoryPacketKind.RR, 1, true),
      ),
    );

    expect(jest.getTimerCount()).toEqual(0);
  });

  it('send with one timeout before ack', () => {
    commandSocketSendSpy.mockClear();

    const data = Buffer.from(`if at first you don't succeed`);
    transport.send(0xbeef, data);

    expect(commandSocketSendSpy).toBeCalledWith(
      ReliableInfoPacket.build(0, 0, true, 0xbeef, data),
    );
    expect(commandSocketSendSpy).toBeCalledTimes(1);
    commandSocketSendSpy.mockClear();
    expect(commandSocketSendSpy).toBeCalledTimes(0);

    expect(jest.getTimerCount()).toEqual(1);

    jest.runOnlyPendingTimers();

    expect(jest.getTimerCount()).toEqual(1);
    expect(commandSocketSendSpy).toBeCalledWith(
      ReliableInfoPacket.build(0, 0, true, 0xbeef, data),
    );
    expect(commandSocketSendSpy).toBeCalledTimes(1);

    intf.write(
      PPPFrame.build(
        0x3a35,
        ReliableSupervisoryPacket.build(SupervisoryPacketKind.RR, 1, true),
      ),
    );

    expect(jest.getTimerCount()).toEqual(0);
  });

  it('send with no response restarts transport', () => {
    const data = Buffer.from('this will fail');
    transport.send(0xfa11, data);
    expect(restartSpy).toBeCalledTimes(0);
    jest.runAllTimers();
    expect(restartSpy).toBeCalledTimes(1);
  });

  it('drops a received duplicate packet', async () => {
    const dataHandler = jest.fn();
    const socket = await transport.openSocket(0xf00d, 0);
    socket.on('data', dataHandler);
    const data = Buffer.from('duplicate');
    const packet = PPPFrame.build(
      0x3a33,
      ReliableInfoPacket.build(0, 0, true, 0xf00d, data),
    );
    responseSocketSendSpy.mockClear();
    intf.write(packet);
    expect(dataHandler).toBeCalledWith(data);
    expect(dataHandler).toBeCalledTimes(1);
    intf.write(packet);
    expect(dataHandler).toBeCalledTimes(1);
  });

  it('can queue multiple packets', () => {
    const packets: [number, string][] = [
      [0xfeed, 'Some data'],
      [0x6789, 'More data'],
      [0xfeed, 'Even more data'],
    ];

    for (const [port, data] of packets) {
      transport.send(port, Buffer.from(data));
    }

    for (let i = 0; i < packets.length; i++) {
      const [port, data] = packets[i];

      expect(commandSocketSendSpy).toBeCalledWith(
        ReliableInfoPacket.build(i, 0, true, port, Buffer.from(data)),
      );
      commandSocketSendSpy.mockClear();

      intf.write(
        PPPFrame.build(
          0x3a35,
          ReliableSupervisoryPacket.build(
            SupervisoryPacketKind.RR,
            i + 1,
            true,
          ),
        ),
      );
    }
  });

  it('sending packet of exactly MTU does not throw', () => {
    expect(() => transport.send(0xcafe, Buffer.alloc(1494))).not.toThrowError();
  });

  it('sending packet larger than MTU throws', () => {
    expect(() => transport.send(0xcafe, Buffer.alloc(1495))).toThrowError(
      'Packet length (1495) exceeds transport MTU (1494)',
    );
  });

  it('sends a packet from a socket', async () => {
    const socket = await transport.openSocket(0xabcd, 0);
    const data = Buffer.from('info');
    socket.send(data);
    expect(commandSocketSendSpy).toBeCalledWith(
      ReliableInfoPacket.build(0, 0, true, 0xabcd, Buffer.from(data)),
    );
  });

  it('receives a packet from a socket', async () => {
    const socket = await transport.openSocket(0xabcd, 0);
    const data = Buffer.from('info');
    const dataHandler = jest.fn();
    socket.on('data', dataHandler);
    intf.write(
      PPPFrame.build(
        0x3a33,
        ReliableInfoPacket.build(0, 0, true, 0xabcd, data),
      ),
    );
  });

  it("receive on a port not opened doesn't reach socket", async () => {
    const socket = await transport.openSocket(0xabcd, 0);
    const dataHandler = jest.fn();
    socket.on('data', dataHandler);
    intf.write(
      PPPFrame.build(
        0x3a33,
        ReliableInfoPacket.build(0, 0, true, 0x3333, Buffer.alloc(1)),
      ),
    );
    expect(dataHandler).not.toBeCalled();
  });

  it('restarts transport on malformed command packet', () => {
    expect(restartSpy).toBeCalledTimes(0);
    intf.write(PPPFrame.build(0x3a33, Buffer.from('garbage')));
    expect(restartSpy).toBeCalledTimes(1);
  });

  it('restarts transport on malformed response packet', () => {
    expect(restartSpy).toBeCalledTimes(0);
    intf.write(PPPFrame.build(0x3a35, Buffer.from('garbage')));
    expect(restartSpy).toBeCalledTimes(1);
  });

  it('closes link sockets and NCP when transport is shutdown', () => {
    // eslint-disable-next-line
    const ncpDownSpy = jest.spyOn((transport as any).ncp, 'down');
    const commandSocketCloseSpy = jest.spyOn(commandSocket, 'close');
    const responseSocketCloseSpy = jest.spyOn(responseSocket, 'close');
    const intfCloseSpy = jest.spyOn(intf, 'unregisterSocket');

    transport.down();

    expect(ncpDownSpy).toBeCalled();
    expect(commandSocketCloseSpy).toBeCalled();
    expect(responseSocketCloseSpy).toBeCalled();
    expect(intfCloseSpy).toBeCalledWith(0xba33);
    expect(intfCloseSpy).toBeCalledWith(0x3a33);
    expect(intfCloseSpy).toBeCalledWith(0x3a35);
  });

  it('closes a socket when a PCMP port closed message is received', async () => {
    const closeHander = jest.fn();
    const socket = await transport.openSocket(0xabcd, 0);
    socket.on('close', closeHander);

    expect(socket.closed).toEqual(false);
    expect(closeHander).not.toBeCalled();

    intf.write(
      PPPFrame.build(
        0x3a33,
        ReliableInfoPacket.build(0, 0, true, 1, encode('\x81\xab\xcd')),
      ),
    );

    expect(socket.closed).toEqual(true);
    expect(closeHander).toBeCalled();
  });

  it('ignores a port closed message if no relevant socket is open', async () => {
    const closeHander = jest.fn();
    const socket = await transport.openSocket(0xaaaa, 0);
    socket.on('close', closeHander);

    expect(socket.closed).toEqual(false);
    expect(closeHander).not.toBeCalled();

    intf.write(
      PPPFrame.build(
        0x3a33,
        ReliableInfoPacket.build(0, 0, true, 1, encode('\x81\xab\xcd')),
      ),
    );

    expect(socket.closed).toEqual(false);
    expect(closeHander).not.toBeCalled();
  });
});
