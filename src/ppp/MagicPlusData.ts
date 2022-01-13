export default class MagicPlusData {
  private constructor(public magicNumber: number, public data: Buffer) {}

  static headerSize = 4;

  static parse(buf: Buffer): MagicPlusData {
    if (buf.byteLength < MagicPlusData.headerSize) {
      throw new Error('Magic number less than minimum possible byte length');
    }

    let offset = 0;
    const magicNumber = buf.readUInt32BE(offset);
    offset += MagicPlusData.headerSize;

    const data = buf.slice(offset);

    return new MagicPlusData(magicNumber, data);
  }

  static build(magicNumber: number, data = Buffer.alloc(0)): Buffer {
    const buf = Buffer.alloc(data.byteLength + MagicPlusData.headerSize);
    let offset = 0;

    buf.writeUInt32BE(magicNumber, offset);
    offset += MagicPlusData.headerSize;

    data.copy(buf, offset);

    return buf;
  }
}
