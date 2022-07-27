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

export enum PcapPacketDirection {
  IN = 0,
  OUT = 1,
}
export default class PcapWriter {
  static linkTypePPPWithDir = 204;

  private fd: number;

  constructor(path: string, linkType: number) {
    this.fd = fs.openSync(path, 'w');
    this.writeHeader(linkType);
  }

  public close(): void {
    fs.closeSync(this.fd);
  }

  private writeHeader(linkType: number): void {
    const buf = Buffer.alloc(24);
    let offset = 0;

    // magic_number
    buf.writeUInt32BE(0xa1b2c3d4, offset);
    offset += 4;

    // version_major
    buf.writeUInt16BE(2, offset);
    offset += 2;

    // version_minor
    buf.writeUInt16BE(4, offset);
    offset += 2;

    // thiszone (GMT to local time correction)
    buf.writeInt32BE(0, offset);
    offset += 4;

    // sigfigs (accuracy of timestamps)
    buf.writeUInt32BE(0, offset);
    offset += 4;

    // snaplen (max length of captured packets, in octets)
    buf.writeUInt32BE(65535, offset);
    offset += 4;

    // network
    buf.writeUInt32BE(linkType, offset);

    fs.writeSync(this.fd, buf);
  }

  writePacket(direction: PcapPacketDirection, data: Buffer): void {
    if (data.byteLength > 0xffff) {
      throw new Error('Data too large to write to pcap file');
    }

    const buf = Buffer.alloc(17);

    const timestamp = Date.now();
    const seconds = Math.floor(timestamp / 1000);
    const microseconds = (timestamp - seconds * 1000) * 1000;

    let offset = buf.writeUInt32BE(seconds);
    offset = buf.writeUInt32BE(microseconds, offset);
    offset = buf.writeUInt32BE(data.byteLength, offset);
    offset = buf.writeUInt32BE(data.byteLength, offset);
    buf.writeUInt8(direction, offset);

    fs.writeSync(this.fd, buf);
    fs.writeSync(this.fd, data);
  }
}
