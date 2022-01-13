export default class PPPFrame {
  private constructor(
    public readonly protocol: number,
    public readonly information: Buffer,
  ) {}

  static headerSize = 2;

  static parse(datagram: Buffer): PPPFrame {
    if (datagram.byteLength < PPPFrame.headerSize) {
      throw new Error('Datagram too short');
    }

    const protocol = datagram.readUInt16BE();

    return new PPPFrame(protocol, datagram.slice(PPPFrame.headerSize));
  }

  static build(protocol: number, information: Buffer): Buffer {
    const protocolBuffer = Buffer.alloc(2);
    protocolBuffer.writeUInt16BE(protocol);
    return Buffer.concat([protocolBuffer, information]);
  }
}
