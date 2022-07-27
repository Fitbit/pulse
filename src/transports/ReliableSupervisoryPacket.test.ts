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

import ReliableSupervisoryPacket, {
  SupervisoryPacketKind,
} from './ReliableSupervisoryPacket';
import { decode, encode } from '../encodingUtil';

const cases: [string, string, [SupervisoryPacketKind, number, boolean]][] = [
  ['recieve ready', '\x01\x18', [SupervisoryPacketKind.RR, 12, false]],
  [
    'receive ready poll/final',
    '\x01\x19',
    [SupervisoryPacketKind.RR, 12, true],
  ],
  ['receive not ready', '\x05\x18', [SupervisoryPacketKind.RNR, 12, false]],
  ['reject', '\x09\x18', [SupervisoryPacketKind.REJ, 12, false]],
];

describe('parse', () => {
  it.each(cases)('%s', (_, input, [kind, ackNumber, poll]) => {
    const packet = ReliableSupervisoryPacket.parse(encode(input));
    expect(packet.ackNumber).toEqual(ackNumber);
    expect(packet.kind).toEqual(kind);
    expect(packet.poll).toEqual(poll);
  });
});

describe('build', () => {
  it.each(cases)('%s', (_, output, [kind, ackNumber, poll]) => {
    expect(
      decode(ReliableSupervisoryPacket.build(kind, ackNumber, poll)),
    ).toEqual(output);
  });
});

it('throws when parsing truncated packet (below min size)', () => {
  expect(() => ReliableSupervisoryPacket.parse(Buffer.alloc(1))).toThrowError(
    'Packet truncated or corrupt',
  );
});

it('throws when parsing truncated packet (above max size)', () => {
  expect(() => ReliableSupervisoryPacket.parse(Buffer.alloc(3))).toThrowError(
    'Packet truncated or corrupt',
  );
});

it('throws when parsing non-supervisory packet', () => {
  expect(() =>
    ReliableSupervisoryPacket.parse(encode('\x00\x18')),
  ).toThrowError(
    'isSupervisory must be true for a ReliableSupervisoryPacket, but was false',
  );
});

it('throws when parsing packet with non-zero reserved bits', () => {
  expect(() =>
    ReliableSupervisoryPacket.parse(encode('\x81\x00')),
  ).toThrowError('Reserved bits must be zero, but were: 1000');
});
