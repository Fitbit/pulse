import BestEffortTransport from './BestEffortTransport';
import Interface from '../Interface';
import { encode } from '../encodingUtil';
import Socket from '../Socket';
import PPPFrame from '../ppp/PPPFrame';
import LCPEncapsulation from '../ppp/LCPEncapsulation';
import { ControlCode } from '../ppp/ControlProtocol';
import BestEffortPacket from './BestEffortPacket';
import InterfaceSocket from '../InterfaceSocket';

let intf: Interface;
let transport: BestEffortTransport;
let linkSocket: InterfaceSocket;
let ncpRestartSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  intf = new Interface();
  transport = new BestEffortTransport(intf, 1500);

  // eslint-disable-next-line
  ncpRestartSpy = jest.spyOn((transport as any).ncp, 'restart');

  // eslint-disable-next-line
  linkSocket = (transport as any).linkSocket;
});

afterEach(() => {
  jest.useRealTimers();
});

function openTransport(): void {
  intf.write(
    PPPFrame.build(0xba29, LCPEncapsulation.build(ControlCode.ConfigureAck, 0)),
  );

  intf.write(
    PPPFrame.build(
      0xba29,
      LCPEncapsulation.build(ControlCode.ConfigureRequest, 0),
    ),
  );
}

function sendEchoReply(): void {
  intf.write(
    PPPFrame.build(0x3a29, BestEffortPacket.build(1, Buffer.from('\x02'))),
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

it('restarts transport if ping fails', async () => {
  openTransport();

  expect(ncpRestartSpy).not.toBeCalled();
  jest.runAllTimers();
  const waitForEventLoopTick = new Promise(resolve => setImmediate(resolve));
  jest.runAllTimers();
  await waitForEventLoopTick;
  expect(ncpRestartSpy).toBeCalled();
});

describe('when open', () => {
  beforeEach(() => {
    openTransport();
    sendEchoReply();

    // Check the transport is open
    // eslint-disable-next-line
    return expect((transport as any).opened.wait()).resolves.toEqual(true);
  });

  it('sends a packet', () => {
    const linkSocketSpy = jest.spyOn(linkSocket, 'send');
    const data = Buffer.from('information');
    transport.send(0xabcd, data);
    expect(linkSocketSpy).toBeCalledWith(BestEffortPacket.build(0xabcd, data));
  });

  it('sends a packet through a socket', async () => {
    const socket = await transport.openSocket(0xabcd, 0);
    const linkSocketSpy = jest.spyOn(linkSocket, 'send');
    const data = Buffer.from('information');
    socket.send(data);
    expect(linkSocketSpy).toBeCalledWith(BestEffortPacket.build(0xabcd, data));
  });

  it('receives through a socket', async () => {
    const data = Buffer.from('information');
    const dataHandler = jest.fn();
    const socket = await transport.openSocket(0xabcd, 0);
    socket.on('data', dataHandler);
    intf.write(PPPFrame.build(0x3a29, BestEffortPacket.build(0xabcd, data)));
    expect(dataHandler).toBeCalledWith(data);
  });

  it('discards data received for an unopened port', async () => {
    const dataHandler = jest.fn();
    const socket = await transport.openSocket(0xabcd, 0);
    socket.on('data', dataHandler);
    intf.write(
      PPPFrame.build(
        0x3a29,
        BestEffortPacket.build(0xdcba, Buffer.from('information')),
      ),
    );
    expect(dataHandler).not.toBeCalled();
  });

  it('discards malformed data', () => {
    intf.write(PPPFrame.build(0x3a29, Buffer.alloc(8).fill(0xff)));
  });

  it('throws if data size to be sent exceeds MTU', () => {
    expect(() => transport.send(0xabcd, Buffer.alloc(1497))).toThrowError(
      'Packet length (1497) exceeds transport MTU (1496)',
    );
  });

  it('transport going down closes link socket and NCP', () => {
    const linkSocketCloseSpy = jest.spyOn(linkSocket, 'close');
    const intfCloseSpy = jest.spyOn(intf, 'unregisterSocket');
    transport.down();
    expect(linkSocketCloseSpy).toBeCalled();
    expect(intfCloseSpy).toBeCalledWith(0xba29);
    expect(intfCloseSpy).toBeCalledWith(0x3a29);
  });

  it('throws when opening a second socket for the same port', async () => {
    await transport.openSocket(0xaaaa, 0);
    return expect(transport.openSocket(0xaaaa, 0)).rejects.toThrowError(
      'Another socket is already opened on port 0xaaaa',
    );
  });

  it('closes a socket when a PCMP port closed message is received', async () => {
    const closeHander = jest.fn();
    const socket = await transport.openSocket(0xabcd, 0);
    socket.on('close', closeHander);

    expect(socket.closed).toEqual(false);
    expect(closeHander).not.toBeCalled();

    intf.write(
      PPPFrame.build(0x3a29, BestEffortPacket.build(1, encode('\x81\xab\xcd'))),
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
      PPPFrame.build(0x3a29, BestEffortPacket.build(1, encode('\x81\xab\xcd'))),
    );

    expect(socket.closed).toEqual(false);
    expect(closeHander).not.toBeCalled();
  });

  it('closes a socket when the transport goes down', async () => {
    const closeHander = jest.fn();
    const socket = await transport.openSocket(0xaaaa, 0);
    socket.on('close', closeHander);

    expect(socket.closed).toEqual(false);
    expect(closeHander).not.toBeCalled();

    transport.down();

    expect(socket.closed).toEqual(true);
    expect(closeHander).toBeCalled();
  });

  it('throws when opening a second socket for the same port', () => {
    void transport.openSocket(0xaaaa, 1);
    return expect(transport.openSocket(0xaaaa, 1)).rejects.toThrowError(
      'Another socket is already opened on port 0xaaaa',
    );
  });

  it('allows a socket on the same port to be re-opened if the first is closed', async () => {
    const socketA = await transport.openSocket(0xaaaa, 1);
    socketA.close();
    return expect(transport.openSocket(0xaaaa, 1)).resolves.toBeInstanceOf(
      Socket,
    );
  });

  it('throws when opening a socket whilst transport is down', () => {
    transport.thisLayerDown();
    const socketPromise = transport.openSocket(0xf00d, 0);
    jest.runAllTimers();
    return expect(socketPromise).rejects.toThrowError(
      'Timed out waiting for transport to open socket',
    );
  });

  it('opens socket sucessfully after transport bounces', () => {
    transport.thisLayerDown();
    transport.thisLayerUp();
    intf.write(
      PPPFrame.build(0x3a29, BestEffortPacket.build(1, Buffer.from('\x02'))),
    );
    return expect(transport.openSocket(0xaaaa, 1)).resolves.toBeInstanceOf(
      Socket,
    );
  });
});
