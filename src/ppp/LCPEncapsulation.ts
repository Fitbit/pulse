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

export default class LCPEncapsulation {
  private constructor(
    public code: number,
    public identifier: number,
    public data: Buffer,
    public padding: Buffer,
  ) {}

  static headerSize = 4;

  static parse(packet: Buffer): LCPEncapsulation {
    if (packet.byteLength < LCPEncapsulation.headerSize) {
      throw new Error('Packet truncated or corrupt');
    }

    let offset = 0;
    const code = packet.readUInt8(offset++);
    const identifier = packet.readUInt8(offset++);
    const length = packet.readUInt16BE(offset);
    offset += 2;
    const data = packet.slice(
      offset,
      (offset += length - LCPEncapsulation.headerSize),
    );
    const padding = packet.slice(offset);

    if (data.byteLength + LCPEncapsulation.headerSize != length) {
      throw new Error('Packet truncated or corrupt');
    }

    return new LCPEncapsulation(code, identifier, data, padding);
  }

  static build(
    code: number,
    identifier: number,
    data = Buffer.alloc(0),
  ): Buffer {
    const buf = Buffer.alloc(data.byteLength + LCPEncapsulation.headerSize);
    let offset = 0;

    buf.writeUInt8(code, offset++);
    buf.writeUInt8(identifier, offset++);
    buf.writeUInt16BE(data.byteLength + LCPEncapsulation.headerSize, offset);
    data.copy(buf, (offset += 2));

    return buf;
  }
}
