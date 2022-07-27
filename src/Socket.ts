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

import EventEmitter from 'events';
import Transport from './transports';

export interface SocketLike extends EventEmitter {
  closed: boolean;
  readonly mtu: number;

  onReceive(packet: Buffer): void;
  send(packet: Buffer): void;
  close(): void;
}

/*
  A socket for sending and receiving packets over a single port
  of a PULSE transport.
*/
export default class Socket extends EventEmitter implements SocketLike {
  public closed = false;

  constructor(private transport: Transport, private port: number) {
    super();
  }

  onReceive(packet: Buffer): void {
    this.emit('data', packet);
  }

  send(packet: Buffer): void {
    if (this.closed) throw new Error('I/O operation on closed socket');
    this.transport.send(this.port, packet);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
    this.transport.unregisterSocket(this.port);
  }

  get mtu(): number {
    return this.transport.mtu;
  }
}
