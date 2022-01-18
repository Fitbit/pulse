import Interface from '../Interface';
import InterfaceSocket from '../InterfaceSocket';
import BestEffortPacket from './BestEffortPacket';
import BaseTransport from './BaseTransport';

export default class BestEffortTransport extends BaseTransport {
  static readonly displayName: string = 'BEAT';
  static readonly ncpProtocolNumber?: number = 0xba29;
  static readonly protocolNumber: number = 0x3a29;

  private linkSocket: InterfaceSocket;

  constructor(intf: Interface, linkMtu: number) {
    super(intf);
    this._mtu = linkMtu - 4;

    const ctor = this.constructor as typeof BaseTransport;
    this.linkSocket = intf.connect(ctor.protocolNumber);
    this.linkSocket.on('data', this.packetReceived.bind(this));
  }

  public thisLayerUp(): void {
    super.thisLayerUp();

    // Don't need to do anything in the success case as receiving
    // any packet is enough to set the transport as Opened.
    this.pcmp?.ping().catch(() => {
      console.warn('Ping check failed, restarting transport.');
      this.ncp?.restart();
    });
  }

  public send(port: number, information: Buffer): void {
    super.send(port, information);
    const packet = BestEffortPacket.build(port, information);
    this.linkSocket.send(packet);
  }

  private packetReceived(packet: Buffer): void {
    if (this.closed) {
      // This shouldn't be possible because the link socket is closed
      // by the transport going down
      /* istanbul ignore next */
      return console.warn('Received packet on closed transport');
    }

    if (!this.ncp?.isOpened()) {
      console.warn('Received packet before the transport is open. Discarding.');
      return;
    }

    this.opened.set();

    let fields: BestEffortPacket;

    try {
      fields = BestEffortPacket.parse(packet);
    } catch {
      console.error(
        `Received malformed ${
          (this.constructor as typeof BaseTransport).displayName
        } packet`,
      );
      return;
    }

    const socket = this.sockets[fields.port];
    if (socket !== undefined) {
      socket.onReceive(fields.information);
    } else {
      console.warn(
        `Received packet for unopened port 0x${fields.port.toString(16)}`,
      );
    }
  }

  down(): void {
    super.down();
    this.linkSocket.close();
  }
}
