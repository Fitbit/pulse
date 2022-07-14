import EventEmitter from 'events';
import Interface from './Interface';
import Transport, { transports, TransportType } from './transports';
import { SocketLike } from './Socket';

export default class Link extends EventEmitter {
  public closed = false;
  private transports: { [name: string]: Transport } = {};

  constructor(
    intf: Interface,
    mtu: number,
    requestedTransports?: TransportType[],
  ) {
    super();
    for (const [name, transportCtor] of Object.entries(transports)) {
      if (
        requestedTransports &&
        !requestedTransports.includes(name as TransportType)
      ) {
        continue;
      }

      this.transports[name] = new transportCtor(intf, mtu);
    }
  }

  openSocket(
    transportName: string,
    port: number,
    timeout = 30000,
  ): Promise<SocketLike> {
    if (this.closed) throw new Error('Cannot open socket on closed link');

    const transport = this.transports[transportName];
    if (transport === undefined) {
      throw new Error(`Unknown transport "${transportName}"`);
    }

    return transport.openSocket(port, timeout);
  }

  down(): void {
    this.closed = true;
    this.emit('close');
    for (const transport of Object.values(this.transports)) transport.down();
  }
}
