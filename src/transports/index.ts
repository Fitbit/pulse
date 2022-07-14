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

import BestEffortTransport from './BestEffortTransport';
import ReliableTransport from './ReliableTransport';

export { BestEffortTransport, ReliableTransport };

export const transports = {
  bestEffort: BestEffortTransport,
  reliable: ReliableTransport,
};
export type TransportType = keyof typeof transports;
