import * as stream from 'stream';

import Interface from './Interface';
import { encode as encodeFrame } from './framing/encoder';
import PPPFrame from './ppp/PPPFrame';
import LCPEncapsulation from './ppp/LCPEncapsulation';
import { ControlCode } from './ppp/ControlProtocol';
import { encode } from './encodingUtil';
import { PcapPacketDirection } from './PcapWriter';

jest.mock('./PcapWriter');

let intf: Interface;
let sink: BufferSink;

class BufferSink extends stream.Duplex {
  public data: Buffer[] = [];

  constructor() {
    super({ allowHalfOpen: false });
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  _read(): void {}

  _write(chunk: Buffer, _: string, done: (err?: Error) => void): void {
    this.data.push(chunk);
    done();
  }

  getData(): Promise<Buffer[]> {
    this.push(null);
    return new Promise((resolve) =>
      sink.once('close', () => resolve(this.data)),
    );
  }

  waitForClose(): Promise<void> {
    return new Promise((resolve) => sink.once('close', () => resolve()));
  }
}

function fakeLCPUp(): void {
  // eslint-disable-next-line
  (intf as any).onLinkUp();
  // eslint-disable-next-line
  (intf as any).handlePingSuccess();
}

function fakeLCPDown(): void {
  // eslint-disable-next-line
  (intf as any).onLinkDown();
}

beforeEach(() => {
  jest.useFakeTimers();
  sink = new BufferSink();
  intf = Interface.create(sink);
});

afterEach(() => {
  jest.useRealTimers();
});

it('sends a packet', async () => {
  const packet = Buffer.from('data');
  intf.sendPacket(0x8889, packet);

  return expect(sink.getData()).resolves.toContainEqual(
    encodeFrame(PPPFrame.build(0x8889, packet)),
  );
});

it('sends from a socket', () => {
  const socket = intf.connect(0xf0f1);
  const packet = Buffer.from('data');
  socket.send(packet);
  return expect(sink.getData()).resolves.toContainEqual(
    encodeFrame(PPPFrame.build(0xf0f1, packet)),
  );
});

it('receives a packet', async () => {
  const socket = intf.connect(0xf0f1);
  const packetHandler = jest.fn();
  socket.on('data', packetHandler);
  sink.push(encodeFrame(PPPFrame.build(0xf0f1, Buffer.from('hello world!'))));
  sink.push(null);
  await sink.waitForClose();
  expect(packetHandler).toBeCalledWith(encode('hello world!'));
});

it('closing interface closes sockets and underlying stream', async () => {
  const socketA = intf.connect(0xf0f1);
  const socketB = intf.connect(0xf0f3);

  const closePromise = intf.close();
  jest.runAllTimers();
  await closePromise;

  expect(socketA.closed).toEqual(true);
  expect(socketB.closed).toEqual(true);
  expect(intf.destroyed).toEqual(true);
});

it('ending underlying stream closes sockets and interface', async () => {
  const socket = intf.connect(0xf0f1);

  sink.destroy();
  jest.runAllTimers();
  await sink.waitForClose();

  expect(socket.closed).toEqual(true);
  expect(intf.destroyed).toEqual(true);
});

it('throws if opening two sockets for same protocol', () => {
  intf.connect(0xf0f1);
  expect(() => intf.connect(0xf0f1)).toThrowError(
    'A socket is already bound to protocol 0xf0f1',
  );
});

it('closing one socket allows another to be opened for the same protocol', () => {
  const socketA = intf.connect(0xf0f1);
  socketA.close();
  const socketB = intf.connect(0xf0f1);
  expect(socketA).not.toBe(socketB);
});

it('throws if sending on a closed interface', async () => {
  const closePromise = intf.close();
  jest.runAllTimers();
  await closePromise;

  expect(intf.closed).toEqual(true);
  expect(() => intf.sendPacket(0x8889, Buffer.from('data'))).toThrowError(
    'I/O operation on closed interface',
  );
});

it('ignores corrupted PPP frames', () => {
  expect(() => intf.write(encode('?'))).not.toThrowError();
});

describe('getLink()', () => {
  describe('rejects', () => {
    it('if LCP is down', () => {
      const linkPromise = intf.getLink(0);
      jest.runAllTimers();
      return expect(linkPromise).rejects.toThrowError('Timed out getting link');
    });

    it('if interface is closed', async () => {
      const closePromise = intf.close();
      jest.runAllTimers();
      await closePromise;
      return expect(intf.getLink(0)).rejects.toThrowError(
        'No link available on closed interface',
      );
    });
  });

  it('returns a link when LCP is up', () => {
    const linkPromise = intf.getLink();
    fakeLCPUp();
    return expect(linkPromise).resolves.toBeDefined();
  });

  it('closes link object when LCP goes down', async () => {
    const linkPromise = intf.getLink();
    fakeLCPUp();
    const link = await linkPromise;
    expect(link.closed).toEqual(false);
    fakeLCPDown();
    expect(link.closed).toEqual(true);
  });

  it('doesn\t reopen the previous link object if LCP bounces', async () => {
    fakeLCPUp();
    const linkA = await intf.getLink();
    fakeLCPDown();
    fakeLCPUp();
    const linkB = await intf.getLink();
    expect(linkA.closed).toEqual(true);
    expect(linkB.closed).toEqual(false);
    expect(linkA).not.toBe(linkB);
  });

  it('shuts down LCP when closing gracefully', () => {
    void intf.close();
    return expect(sink.getData()).resolves.toContainEqual(
      encodeFrame(
        PPPFrame.build(
          0xc021,
          LCPEncapsulation.build(ControlCode.TerminateRequest, 42),
        ),
      ),
    );
  });

  // TODO: check ping failure triggers LCP restart
});

describe('pcap writing', () => {
  let packetWriteSpy: jest.SpyInstance;

  beforeEach(() => {
    intf = Interface.create(sink, '/tmp/not/a/real/path');
    // eslint-disable-next-line
    packetWriteSpy = jest.spyOn((intf as any).pcapWriter, 'writePacket');
  });

  it('writes a received packet', () => {
    const packet = PPPFrame.build(0xabcd, encode('hello recv!'));
    intf.write(packet);
    expect(packetWriteSpy).toBeCalledWith(PcapPacketDirection.IN, packet);
  });

  it('writes a sent packet', () => {
    const packet = PPPFrame.build(0xabcd, encode('hello send!'));
    intf.sendPacket(0xabcd, encode('hello send!'));
    expect(packetWriteSpy).toBeCalledWith(PcapPacketDirection.OUT, packet);
  });
});
