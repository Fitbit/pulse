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

import BestEffortPacket from './BestEffortPacket';
import { decode, encode } from '../encodingUtil';

it('parse', () => {
  const packet = BestEffortPacket.parse(
    encode('\xbe\xef\x00\x12Data goes here'),
  );
  expect(packet.port).toEqual(0xbeef);
  expect(packet.information).toEqual(encode('Data goes here'));
  expect(packet.padding).toEqual(encode(''));
});

it('parse with padding', () => {
  const packet = BestEffortPacket.parse(
    encode('\xbe\xef\x00\x12Data goes herepadding'),
  );
  expect(packet.port).toEqual(0xbeef);
  expect(packet.information).toEqual(encode('Data goes here'));
  expect(packet.padding).toEqual(encode('padding'));
});

it.each([
  ['truncated packet - min size', Buffer.alloc(3)],
  [
    'truncated packet - length extends beyond buffer',
    encode('\xca\xfe\x00\x05'),
  ],
])('throws: %s', (_, input) => {
  expect(() => BestEffortPacket.parse(input)).toThrowError(
    'Packet truncated or corrupt',
  );
});

it('build', () => {
  expect(
    decode(BestEffortPacket.build(0xcafe, encode('Data goes here'))),
  ).toEqual('\xca\xfe\x00\x12Data goes here');
});
