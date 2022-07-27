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
