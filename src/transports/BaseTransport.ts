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

import Transport from '.';
import Socket, { SocketLike } from '../Socket';
import PulseControlMessageProtocol from '../pcmp/PulseControlMessageProtocol';
import TransportControlProtocol from './TransportControlProtocol';
import Event from '../util/event';
import Interface from '../Interface';

export default abstract class BaseTransport implements Transport {
  static readonly displayName: string = 'BaseTransport';
  static readonly ncpProtocolNumber?: number;
  static readonly protocolNumber: number = 0x0;

  public closed = false;
  public _mtu = 0;

  protected opened = new Event();
  protected sockets: Record<number, SocketLike> = {};
  protected ncp?: TransportControlProtocol;
  protected pcmp?: PulseControlMessageProtocol;

  constructor(intf: Interface) {
    const ctor = this.constructor as typeof BaseTransport;
    if (ctor.ncpProtocolNumber !== undefined) {
      this.ncp = new TransportControlProtocol(
        intf,
        this,
        ctor.ncpProtocolNumber,
        ctor.displayName,
      );
      this.ncp.up();
      this.ncp.open();
    }
  }

  get mtu(): number {
    return this._mtu;
  }

  public thisLayerUp(): void {
    // We can't let PCMP bind itself using the public openSocket
    // method as the method will block until this.opened is set, but
    // it won't be set until we use PCMP Echo to test that the
    // transport is ready to carry traffic. So we must manually bind
    // the port without waiting.
    this.pcmp = new PulseControlMessageProtocol(this);
    this.sockets[this.pcmp.port] = this.pcmp;
    this.pcmp.on('portClosed', this.onPortClosed.bind(this));
  }

  public thisLayerDown(): void {
    this.opened.clear();
    this.closeAllSockets();
  }

  public async openSocket(port: number, timeout: number): Promise<SocketLike> {
    if (this.closed) throw new Error('Cannot open socket on closed transport');

    if (!(await this.opened.wait(timeout))) {
      throw new Error('Timed out waiting for transport to open socket');
    }

    if (this.sockets[port] !== undefined) {
      throw new Error(
        `Another socket is already opened on port 0x${port.toString(16)}`,
      );
    }

    const socket = new Socket(this, port);
    this.sockets[port] = socket;
    return socket;
  }

  public unregisterSocket(port: number): void {
    delete this.sockets[port];
  }

  public send(port: number, information: Buffer): void {
    // Implements only checks shared across transports, data will go nowhere
    // unless child class actually puts it somewhere

    if (this.closed) throw new Error('I/O operation on closed transport');

    if (!this.ncp?.isOpened()) {
      throw new Error('I/O operation before transport is opened');
    }

    if (information.byteLength > this.mtu) {
      throw new Error(
        `Packet length (${information.byteLength}) exceeds transport MTU (${this.mtu})`,
      );
    }
  }

  /*
    Called by the Link when the link layer goes down.

    This closes the Transport object. Once closed, the Transport
    cannot be reopened.
  */
  public down(): void {
    this.ncp?.down();
    this.closed = true;
    this.closeAllSockets();
  }

  protected closeAllSockets(): void {
    for (const socket of Object.values(this.sockets)) socket.close();
    this.sockets = {};
  }

  protected onPortClosed(port: number): void {
    try {
      this.sockets[port].close();
    } catch {
      console.error(`No socket is open on port 0x${port.toString(16)}!`);
    }
  }
}
