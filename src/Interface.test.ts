import * as stream from 'stream';

import Interface from './Interface';
import { encode as encodeFrame } from './framing/encoder';
import PPPFrame from './ppp/PPPFrame';
import { encode } from './encodingUtil';

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

it('closing interface closes sockets and underlying stream', () => {
  const socketA = intf.connect(0xf0f1);
  const socketB = intf.connect(0xf0f3);

  intf.close();

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

it('throws if sending on a closed interface', () => {
  intf.close();

  expect(intf.closed).toEqual(true);
  expect(() => intf.sendPacket(0x8889, Buffer.from('data'))).toThrowError(
    'I/O operation on closed interface',
  );
});

it('ignores corrupted PPP frames', () => {
  expect(() => intf.write(encode('?'))).not.toThrowError();
});
