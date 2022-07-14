import * as stream from 'stream';

import InterfaceSocket from './InterfaceSocket';
import Link from './Link';
import LinkControlProtocol from './ppp/LinkControlProtocol';
import PPPFrame from './ppp/PPPFrame';
import { TransportType } from './transports';
import Event from './util/event';

import { FrameDecoder } from './framing/decoder';
import { FrameEncoder } from './framing/encoder';
import { FrameSplitter } from './framing/splitter';
import PcapWriter, { PcapPacketDirection } from './PcapWriter';

export interface InterfaceOptions {
  // A path to write a pcap file with all data across the underlying stream
  pcapPath?: string;

  // Array of transport names to be configured
  requestedTransports?: TransportType[];
}

export default class Interface extends stream.Duplex {
  private requestedTransports?: TransportType[];

  static create(phy: stream.Duplex, options?: InterfaceOptions): Interface {
    const intf = new Interface(options);
    const splitter = new FrameSplitter();
    const decoder = new FrameDecoder();
    const encoder = new FrameEncoder();

    stream.pipeline([phy, splitter, decoder, intf, encoder, phy], () => {
      intf.down();
    });

    return intf;
  }

  constructor(options?: InterfaceOptions) {
    super({ objectMode: true, allowHalfOpen: false });

    this.requestedTransports = options?.requestedTransports;

    if (options?.pcapPath) {
      this.pcapWriter = new PcapWriter(
        options.pcapPath,
        PcapWriter.linkTypePPPWithDir,
      );
    }

    this.lcp.addListener('linkUp', this.onLinkUp.bind(this));
    this.lcp.addListener('linkDown', this.onLinkDown.bind(this));

    this.once('pipe', () => {
      this.lcp.up();
      this.lcp.open();
    });
  }

  public closed = false;
  private sockets: Record<number, InterfaceSocket> = {};
  private lcp = new LinkControlProtocol(this);
  private link?: Link;
  private linkAvailable = new Event();
  private pcapWriter?: PcapWriter;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  _read(): void {}

  _write(chunk: Buffer, _: string, callback: (err?: Error) => void): void {
    if (this.pcapWriter) {
      this.pcapWriter.writePacket(PcapPacketDirection.IN, chunk);
    }

    let frame: PPPFrame;
    try {
      frame = PPPFrame.parse(chunk);
    } catch {
      console.warn(`Received malformed PPP frame: ${chunk.toString('hex')}`);
      callback();
      return;
    }

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

    const datagram = PPPFrame.build(protocol, packet);
    if (this.pcapWriter) {
      this.pcapWriter.writePacket(PcapPacketDirection.OUT, datagram);
    }
    this.push(datagram);
  }

  closeAllSockets(): void {
    for (const socket of Object.values(this.sockets)) {
      socket.close();
    }
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    await this.lcp.shutdown();
    this.closeAllSockets();
    this.down();
  }

  /*
    The lower layer (iostream) is down. Bring down the interface.
  */
  private down(): void {
    this.closed = true;
    this.closeAllSockets();
    this.lcp.down();
    this.destroy();
  }

  private handlePingSuccess(): void {
    const mtu = 500;
    this.link = new Link(this, mtu, this.requestedTransports);
    this.linkAvailable.set();
  }

  private handlePingFailure(): void {
    // This will trigger a new ping via onLinkUp
    this.lcp.restart();
  }

  private onLinkUp(): void {
    void this.lcp
      .ping()
      .then(
        this.handlePingSuccess.bind(this),
        this.handlePingFailure.bind(this),
      );
  }

  private onLinkDown(): void {
    if (this.link) {
      this.link.down();
      this.link = undefined;
    }
  }

  public async getLink(timeout = 60000): Promise<Link> {
    if (this.closed) {
      return Promise.reject(new Error('No link available on closed interface'));
    }

    const isLinkAvailable = await this.linkAvailable.wait(timeout);
    if (isLinkAvailable) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.link!;
    } else {
      throw new Error('Timed out getting link');
    }
  }
}
