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
