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

export enum SupervisoryPacketKind {
  RR = 0,
  RNR = 1,
  REJ = 2,
}

export default class ReliableSupervisoryPacket {
  private constructor(
    public kind: SupervisoryPacketKind,
    public ackNumber: number,
    public poll: boolean,
  ) {}

  static headerSize = 2;

  static parse(packet: Buffer): ReliableSupervisoryPacket {
    if (packet.byteLength !== ReliableSupervisoryPacket.headerSize) {
      throw new Error('Packet truncated or corrupt');
    }

    let offset = 0;

    let tmp = packet.readUInt8(offset++);
    const reserved = (tmp & 0b11110000) >> 4;
    const kind = (tmp & 0b00001100) >> 2;
    const isSupervisory = tmp & 0b00000011;

    tmp = packet.readUInt8(offset++);
    const ackNumber = tmp >> 1;
    const poll = (tmp & 0b00000001) === 1;

    if (reserved !== 0) {
      throw new Error(
        `Reserved bits must be zero, but were: ${reserved.toString(2)}`,
      );
    }

    if (!isSupervisory) {
      throw new Error(
        'isSupervisory must be true for a ReliableSupervisoryPacket, but was false',
      );
    }

    return new ReliableSupervisoryPacket(kind, ackNumber, poll);
  }

  static build(
    kind: SupervisoryPacketKind,
    ackNumber: number,
    poll: boolean,
  ): Buffer {
    const buf = Buffer.alloc(ReliableSupervisoryPacket.headerSize);
    let offset = 0;

    buf.writeUInt8((kind << 2) | 0b01, offset++);
    buf.writeUInt8((ackNumber << 1) | (poll ? 1 : 0), offset++);

    return buf;
  }
}
