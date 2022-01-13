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
