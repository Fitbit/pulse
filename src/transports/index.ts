/**
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
