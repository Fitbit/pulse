import EventEmitter from 'events';

import Interface from './Interface';

/*
  A socket for sending and receiving link-layer packets over a
  PULSE interface.

  Available events:
   - close
   - data
*/
export default class InterfaceSocket extends EventEmitter {
  public closed = false;

  constructor(private intf: Interface, private protocol: number) {
    super();
  }

  public send(packet: Buffer): void {
    if (this.closed) throw new Error('I/O operation on closed socket');
    this.intf.sendPacket(this.protocol, packet);
  }

  public handlePacket(packet: Buffer): void {
    if (!this.closed) this.emit('data', packet);
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
    this.intf.unregisterSocket(this.protocol);
    this.removeAllListeners();
  }
}
