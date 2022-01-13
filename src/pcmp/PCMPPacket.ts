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
