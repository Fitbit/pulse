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

import ReliableInfoPacket from './ReliableInfoPacket';
import { decode, encode } from '../encodingUtil';

it('parse', () => {
  const packet = ReliableInfoPacket.parse(
    encode('\x1e\x3f\xbe\xef\x00\x14Data goes here'),
  );
  expect(packet.ackNumber).toEqual(31);
  expect(packet.sequenceNumber).toEqual(15);
  expect(packet.poll).toEqual(true);
  expect(packet.port).toEqual(0xbeef);
  expect(packet.information).toEqual(encode('Data goes here'));
});

it('build', () => {
  expect(
    decode(
      ReliableInfoPacket.build(15, 31, true, 0xbeef, encode('Data goes here')),
    ),
  ).toEqual('\x1e\x3f\xbe\xef\x00\x14Data goes here');
});

it('build with no info', () => {
  expect(decode(ReliableInfoPacket.build(15, 31, true, 0xbeef))).toEqual(
    '\x1e\x3f\xbe\xef\x00\x06',
  );
});

it('build with poll=false', () => {
  expect(decode(ReliableInfoPacket.build(15, 31, false, 0xbeef))).toEqual(
    '\x1e\x3e\xbe\xef\x00\x06',
  );
});

it('throws when parsing truncated packet (below min size)', () => {
  expect(() => ReliableInfoPacket.parse(Buffer.alloc(1))).toThrowError(
    'Packet truncated or corrupt',
  );
});

it('throws when parsing truncated packet (info extends beyond packet end)', () => {
  expect(() =>
    ReliableInfoPacket.parse(encode('\x1e\x3f\xbe\xef\xff\xff')),
  ).toThrowError('Packet truncated or corrupt');
});

it('throws when parsing supervisory packet', () => {
  expect(() =>
    ReliableInfoPacket.parse(encode('\x01\x18\x00\x00\x00\x06')),
  ).toThrowError(
    'isSupervisory must be false for a ReliableInfoPacket, but was true',
  );
});
