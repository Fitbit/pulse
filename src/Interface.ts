import * as stream from 'stream';

import InterfaceSocket from './InterfaceSocket';
import PPPFrame from './ppp/PPPFrame';

import { FrameDecoder } from './framing/decoder';
import { FrameEncoder } from './framing/encoder';
import { FrameSplitter } from './framing/splitter';

export default class Interface extends stream.Duplex {
  static create(phy: stream.Duplex): Interface {
    const intf = new Interface();
    const splitter = new FrameSplitter();
    const decoder = new FrameDecoder();
    const encoder = new FrameEncoder();

    stream.pipeline([phy, splitter, decoder, intf, encoder, phy], () => {
      intf.down();
    });

    return intf;
  }

  constructor() {
    super({ objectMode: true, allowHalfOpen: false });
  }

  public closed = false;
  private sockets: Record<number, InterfaceSocket> = {};

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  _read(): void {}

  _write(chunk: Buffer, _: string, callback: (err?: Error) => void): void {
    let frame: PPPFrame;
    try {
      frame = PPPFrame.parse(chunk);
    } catch {
      console.warn(`Received malformed PPP frame: ${chunk.toString('hex')}`);
      callback();
      return;
    }

    console.log(
      `[PHY recv] [protocol:0x${frame.protocol.toString(
        16,
      )}] ${frame.information.toString('hex')}`,
    );

    const socket: InterfaceSocket | undefined = this.sockets[frame.protocol];
    if (socket !== undefined) {
      socket.handlePacket(frame.information);
    } else {
      // Protocol-reject
    }

    callback();
  }

  /*
    Open a link-layer socket for sending and receiving packets
    of a specific protocol number.
  */
  connect(protocol: number): InterfaceSocket {
    if (this.sockets[protocol] !== undefined) {
      throw new Error(
        `A socket is already bound to protocol 0x${protocol.toString(16)}`,
      );
    }

    return (this.sockets[protocol] = new InterfaceSocket(this, protocol));
  }

  /*
    Used by InterfaceSocket objets to unregister themselves when closing.
  */
  unregisterSocket(protocol: number): void {
    delete this.sockets[protocol];
  }

  sendPacket(protocol: number, packet: Buffer): void {
    if (this.closed) throw new Error('I/O operation on closed interface');
    console.log(
      `[PHY send] [protocol:0x${protocol.toString(16)}] ${packet.toString(
        'hex',
      )}`,
    );
    const datagram = PPPFrame.build(protocol, packet);
    this.push(datagram);
  }

  closeAllSockets(): void {
    for (const socket of Object.values(this.sockets)) {
      socket.close();
    }
  }

  public close(): void {
    if (this.closed) return;
    this.closeAllSockets();
    this.down();
  }

  /*
    The lower layer (iostream) is down. Bring down the interface.
  */
  private down(): void {
    this.closed = true;
    this.closeAllSockets();
    this.destroy();
  }
}