export class Option {
  constructor(public readonly type: number, public readonly data: Buffer) {}

  static readonly headerSize = 2;

  get wireSize(): number {
    return this.data.byteLength + Option.headerSize;
  }

  static parse(buf: Buffer): Option {
    if (buf.byteLength < Option.headerSize) {
      throw new Error('Option truncated or corrupt');
    }

    let offset = 0;
    const type = buf.readUInt8(offset++);
    const length = buf.readUInt8(offset++);

    if (length < Option.headerSize) {
      throw new Error('Option length less than minimum size');
    }

    if (buf.byteLength < length) {
      throw new Error('Option specified more bytes than available');
    }

    const data = buf.slice(offset, offset + length - Option.headerSize);
    return new this(type, data);
  }

  static build(type: number, data = Buffer.alloc(0)): Buffer {
    const buf = Buffer.alloc(Option.headerSize);
    let offset = 0;
    buf.writeUInt8(type, offset++);
    buf.writeUInt8(data.byteLength + Option.headerSize, offset++);
    return Buffer.concat([buf, data]);
  }
}

export default class OptionList {
  private constructor(public readonly options: Option[]) {}

  static parse(buf: Buffer): OptionList {
    let offset = 0;
    const options: Option[] = [];

    while (offset < buf.byteLength) {
      const option = Option.parse(buf.slice(offset));
      options.push(option);
      offset += option.wireSize;
    }

    return new this(options);
  }

  static build(options: [type: number, data?: Buffer][]): Buffer {
    return Buffer.concat(
      options.map(([type, data]) => Option.build(type, data)),
    );
  }
}
