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

export default class ReliableInfoPacket {
  private constructor(
    public sequenceNumber: number,
    public ackNumber: number,
    public poll: boolean,
    public port: number,
    public information: Buffer,
  ) {}

  static headerSize = 6;

  static parse(packet: Buffer): ReliableInfoPacket {
    if (packet.byteLength < ReliableInfoPacket.headerSize) {
      throw new Error('Packet truncated or corrupt');
    }

    let offset = 0;

    let tmp = packet.readUInt8(offset++);
    const sequenceNumber = tmp >> 1;
    const isSupervisory = (tmp & 0b00000001) === 1;

    tmp = packet.readUInt8(offset++);
    const ackNumber = tmp >> 1;
    const poll = (tmp & 0b00000001) === 1;

    const port = packet.readUInt16BE(offset);
    offset += 2;

    const length = packet.readUInt16BE(offset);
    offset += 2;

    const information = packet.slice(
      offset,
      (offset += length - ReliableInfoPacket.headerSize),
    );

    if (information.byteLength + ReliableInfoPacket.headerSize != length) {
      throw new Error('Packet truncated or corrupt');
    }

    if (isSupervisory) {
      throw new Error(
        'isSupervisory must be false for a ReliableInfoPacket, but was true',
      );
    }

    return new ReliableInfoPacket(
      sequenceNumber,
      ackNumber,
      poll,
      port,
      information,
    );
  }

  static build(
    sequenceNumber: number,
    ackNumber: number,
    poll: boolean,
    port: number,
    information = Buffer.alloc(0),
  ): Buffer {
    const buf = Buffer.alloc(
      information.byteLength + ReliableInfoPacket.headerSize,
    );
    let offset = 0;

    buf.writeUInt8(sequenceNumber << 1, offset++);
    buf.writeUInt8((ackNumber << 1) | (poll ? 1 : 0), offset++);

    buf.writeUInt16BE(port, offset);
    offset += 2;

    buf.writeUInt16BE(
      information.byteLength + ReliableInfoPacket.headerSize,
      offset,
    );
    information.copy(buf, (offset += 2));

    return buf;
  }
}
