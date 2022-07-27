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

export default class PCMPPacket {
  private constructor(public code: number, public information: Buffer) {}

  static headerSize = 1;

  static parse(packet: Buffer): PCMPPacket {
    if (packet.byteLength < this.headerSize) {
      throw new Error('Packet truncated or corrupt');
    }

    let offset = 0;
    const code = packet.readUInt8(offset++);
    const information = packet.slice(offset);

    return new PCMPPacket(code, information);
  }

  static build(code: number, information = Buffer.alloc(0)): Buffer {
    const buf = Buffer.alloc(information.byteLength + PCMPPacket.headerSize);
    let offset = 0;

    buf.writeUInt8(code, offset++);
    information.copy(buf, offset);

    return buf;
  }
}
