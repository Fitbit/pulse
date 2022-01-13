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
