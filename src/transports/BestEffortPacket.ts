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

export default class BestEffortPacket {
  private constructor(
    public port: number,
    public information: Buffer,
    public padding: Buffer,
  ) {}

  static headerSize = 4;

  static parse(packet: Buffer): BestEffortPacket {
    if (packet.byteLength < BestEffortPacket.headerSize) {
      throw new Error('Packet truncated or corrupt');
    }

    let offset = 0;
    const port = packet.readUInt16BE(offset);
    offset += 2;
    const length = packet.readUInt16BE(offset);
    offset += 2;
    const data = packet.slice(
      offset,
      (offset += length - BestEffortPacket.headerSize),
    );
    const padding = packet.slice(offset);

    if (data.byteLength + BestEffortPacket.headerSize != length) {
      throw new Error('Packet truncated or corrupt');
    }

    return new BestEffortPacket(port, data, padding);
  }

  static build(port: number, information: Buffer): Buffer {
    const buf = Buffer.alloc(
      information.byteLength + BestEffortPacket.headerSize,
    );
    let offset = 0;

    buf.writeUInt16BE(port, offset);
    offset += 2;
    buf.writeUInt16BE(
      information.byteLength + BestEffortPacket.headerSize,
      offset,
    );
    information.copy(buf, (offset += 2));

    return buf;
  }
}
