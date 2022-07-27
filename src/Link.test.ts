/**
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
import Interface from './Interface';
import Link from './Link';
import Transport, { TransportConstructor, transports } from './transports';
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
  (transports as any).fake = FakeTransport;

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
