/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
import Interface from './Interface';
import Link from './Link';
import Transport, { TransportConstructor } from './transports';
import { SocketLike } from './Socket';

jest.mock('./Interface');
jest.mock('./transports/BestEffortTransport');
jest.mock('./transports/ReliableTransport');

let intf: Interface;
let link: Link;
let transport: FakeTransport;

const mtu = 1500;

class FakeTransport implements Transport {
  openSocket(port: number, timeout: number): Promise<SocketLike> {
    return Promise.resolve({} as SocketLike);
  }

  unregisterSocket(port: number): void {}
  send(port: number, packet: Buffer): void {}
  down(): void {}

  get mtu(): number {
    return mtu;
  }
}

beforeEach(() => {
  intf = new Interface();

  // eslint-disable-next-line
  const transports = (Link as any).availableTransports as {
    [name: string]: TransportConstructor;
  };
  transports.fake = FakeTransport;

  link = new Link(intf, mtu);
  // eslint-disable-next-line
  transport = (link as any).transports.fake;
});

it('opens a socket', () => {
  const sentinel = {};

  const openSocketSpy = jest.spyOn(transport, 'openSocket');
  openSocketSpy.mockResolvedValueOnce(sentinel as SocketLike);

  const socket = link.openSocket('fake', 0xabcd, 1);
  expect(openSocketSpy).toBeCalledWith(0xabcd, 1);
  return expect(socket).resolves.toBe(sentinel);
});

it('down', () => {
  const downSpy = jest.spyOn(transport, 'down');
  link.down();
  expect(link.closed).toEqual(true);
  expect(downSpy).toBeCalledTimes(1);
});

it('emits close event when going down', () => {
  const closeHandler = jest.fn();
  link.once('close', closeHandler);
  link.down();
  expect(closeHandler).toBeCalledTimes(1);
});

it('throws when attempting to open a socket after going down', () => {
  link.down();
  expect(() => link.openSocket('fake', 0xabcd)).toThrowError(
    'Cannot open socket on closed link',
  );
});

it('throws when attempting to open a socket with an unknown transport', () => {
  expect(() => link.openSocket('bad', 0xabcd)).toThrowError(
    'Unknown transport "bad"',
  );
});
