import Interface from '../Interface';
import { SocketLike } from '../Socket';

export default interface Transport {
  openSocket(port: number, timeout: number): Promise<SocketLike>;
  unregisterSocket(port: number): void;
  send(port: number, packet: Buffer): void;
  down(): void;
  readonly mtu: number;
}

export interface TransportConstructor {
  new (intf: Interface, mtu: number): Transport;
}

export { default as BestEffortTransport } from './BestEffortTransport';
export { default as ReliableTransport } from './ReliableTransport';
