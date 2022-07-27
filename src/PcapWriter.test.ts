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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import PcapWriter, { PcapPacketDirection } from './PcapWriter';
import { encode } from './encodingUtil';

const tmpPath = path.join(os.tmpdir(), 'test.cap');

let writer: PcapWriter;

beforeEach(() => {
  writer = new PcapWriter(tmpPath, 0xcafef00d);
});

afterEach(() => {
  writer.close();
});

it('writes the requested link type in the header', () => {
  const header = fs.readFileSync(tmpPath);
  expect(header).toEqual(
    encode(
      '\xa1\xb2\xc3\xd4\x00\x02\x00\x04\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xff\xca\xfe\xf0\x0d',
    ),
  );
});

it('writes a received packet to the pcap file', () => {
  const data = encode('hello world!');
  const dateNowSpy = jest.spyOn(Date, 'now');
  dateNowSpy.mockReturnValueOnce(1638452221234);
  writer.writePacket(PcapPacketDirection.IN, data);
  const packet = fs.readFileSync(tmpPath).slice(24);
  expect(packet).toEqual(
    encode(
      '\x61\xa8\xcb\xfd\x00\x03\x92\x10\x00\x00\x00\x0c\x00\x00\x00\x0c\x00hello world!',
    ),
  );
});

it('writes a sent packet to the pcap file', () => {
  const data = encode('hello world!');
  const dateNowSpy = jest.spyOn(Date, 'now');
  dateNowSpy.mockReturnValueOnce(1638452221234);
  writer.writePacket(PcapPacketDirection.OUT, data);
  const packet = fs.readFileSync(tmpPath).slice(24);
  expect(packet).toEqual(
    encode(
      '\x61\xa8\xcb\xfd\x00\x03\x92\x10\x00\x00\x00\x0c\x00\x00\x00\x0c\x01hello world!',
    ),
  );
});

it('writing a packet larger than 65k throws', () => {
  expect(() =>
    writer.writePacket(PcapPacketDirection.OUT, Buffer.alloc(0x10000)),
  ).toThrowError('Data too large to write to pcap file');
});
