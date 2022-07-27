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
