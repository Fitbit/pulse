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
import InterfaceSocket from '../InterfaceSocket';
import ReliableSupervisoryPacket, {
  SupervisoryPacketKind,
} from './ReliableSupervisoryPacket';
import BaseTransport from './BaseTransport';
import ReliableInfoPacket from './ReliableInfoPacket';

type Packet = [port: number, information: Buffer];

// % is not the same in C/JS as it is in Python
// -1 % 128 = 127 in Python, but -1 in C/JS
function modulus(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export default class ReliableTransport extends BaseTransport {
  static readonly displayName = 'TRAIN';
  static readonly ncpProtocolNumber = 0xba33;
  static readonly commandProtocolNumber = 0x3a33;
  static readonly responseProtocolNumber = 0x3a35;

  static readonly modulus = 128;

  static readonly maxRetransmits = 10; // N2 system parameter in LAPB
  static readonly retransmitTimeout = 2000; // T1 system parameter

  private retransmitCount = 0;
  private waitingForAck = false;
  private retransmitTimer?: NodeJS.Timer;
  private sendQueue: Packet[] = [];
  private lastSentPacket?: Packet;

  private commandSocket: InterfaceSocket;
  private responseSocket: InterfaceSocket;

  // The sequence number of the next in-sequence I-packet to be TX'ed
  private sendVariable = 0;

  // The expected sequence number of the next received I-packet
  private receiveVariable = 0; // V(R) in LAPB

  constructor(intf: Interface, linkMtu: number) {
    super(intf);
    this._mtu = linkMtu - 6;

    this.commandSocket = intf.connect(ReliableTransport.commandProtocolNumber);
    this.commandSocket.on('data', this.commandPacketReceived.bind(this));

    this.responseSocket = intf.connect(
      ReliableTransport.responseProtocolNumber,
    );
    this.responseSocket.on('data', this.responsePacketReceived.bind(this));
  }

  thisLayerUp(): void {
    super.thisLayerUp();

    this.sendVariable = 0;
    this.receiveVariable = 0;
    this.retransmitCount = 0;
    this.waitingForAck = false;

    // Send an RR command packet to elicit an RR response from the
    // remote peer. Receiving a response from the peer confirms that
    // the transport is ready to carry traffic, at which point we
    // will allow applications to start opening sockets.
    this.sendSupervisoryCommand(SupervisoryPacketKind.RR, true);
    this.startRetransmitTimer();
  }

  thisLayerDown(): void {
    this.opened.clear();

    if (this.retransmitTimer) {
      clearInterval(this.retransmitTimer);
      this.retransmitTimer = undefined;
    }

    this.closeAllSockets();
  }

  public down(): void {
    super.down();
    this.commandSocket.close();
    this.responseSocket.close();
  }

  private sendInfoPacket(port: number, information: Buffer): void {
    const packet = ReliableInfoPacket.build(
      this.sendVariable,
      this.receiveVariable,
      true,
      port,
      information,
    );
    this.commandSocket.send(packet);
  }

  public send(port: number, information: Buffer): void {
    super.send(port, information);
    this.sendQueue.push([port, information]);
    this.pumpSendQueue();
  }

  private processAck(ackNumber: number): void {
    if (!this.waitingForAck) {
      // Could be in the timer recovery condition (waiting for
      // a response to an RR Poll command). This is a bit
      // hacky and should probably be changed to use an
      // explicit state machine when this transport is
      // extended to support Go-Back-N ARQ.
      if (this.retransmitTimer !== undefined) {
        clearTimeout(this.retransmitTimer);
        this.retransmitTimer = undefined;
        this.retransmitCount = 0;
      }
    }

    if (
      modulus(ackNumber - 1, ReliableTransport.modulus) === this.sendVariable
    ) {
      if (this.retransmitTimer) {
        clearTimeout(this.retransmitTimer);
        this.retransmitTimer = undefined;
      }
      this.retransmitCount = 0;
      this.waitingForAck = false;
      this.sendVariable = (this.sendVariable + 1) % ReliableTransport.modulus;
    }
  }

  private pumpSendQueue(): void {
    if (this.waitingForAck) return;
    if (this.sendQueue.length === 0) return;

    const packet = this.sendQueue.splice(0, 1)[0];
    this.lastSentPacket = packet;
    this.waitingForAck = true;
    this.sendInfoPacket(...packet);
    this.startRetransmitTimer();
  }

  private startRetransmitTimer(): void {
    if (this.retransmitTimer) {
      clearTimeout(this.retransmitTimer);
    }

    this.retransmitTimer = setTimeout(
      this.retransmitTimeoutExpired.bind(this),
      ReliableTransport.retransmitTimeout,
    );
  }

  private retransmitTimeoutExpired(): void {
    this.retransmitCount += 1;
    if (this.retransmitCount >= ReliableTransport.maxRetransmits) {
      console.warn('Reached maximum number of retransmit attempts');
      this.ncp?.restart();
      return;
    }

    if (this.lastSentPacket) {
      this.sendInfoPacket(...this.lastSentPacket);
    } else {
      // No info packet to retransmit; must be an RR command
      // that needs to be retransmitted.
      this.sendSupervisoryCommand(SupervisoryPacketKind.RR, true);
    }

    this.startRetransmitTimer();
  }

  private sendSupervisoryCommand(
    kind: SupervisoryPacketKind,
    poll = false,
  ): void {
    const command = ReliableSupervisoryPacket.build(
      kind,
      this.receiveVariable,
      poll,
    );
    this.commandSocket.send(command);
  }

  private sendSupervisoryResponse(
    kind: SupervisoryPacketKind,
    final = false,
  ): void {
    const command = ReliableSupervisoryPacket.build(
      kind,
      this.receiveVariable,
      final,
    );
    this.responseSocket.send(command);
  }

  private commandPacketReceived(packet: Buffer): void {
    if (!this.ncp?.isOpened()) {
      console.warn(
        'Received command packet before transport is open. Discarding.',
      );
      return;
    }

    // Information packets have the LSBit of the first byte cleared.
    const isInfo = (packet[0] & 0b1) === 0;

    let fields: ReliableInfoPacket | ReliableSupervisoryPacket;

    try {
      if (isInfo) fields = ReliableInfoPacket.parse(packet);
      else fields = ReliableSupervisoryPacket.parse(packet);
    } catch {
      console.error('Received malformed command packet');
      this.ncp.restart();
      return;
    }

    this.opened.set();

    if (fields instanceof ReliableInfoPacket) {
      if (fields.sequenceNumber === this.receiveVariable) {
        this.receiveVariable =
          (this.receiveVariable + 1) % ReliableTransport.modulus;

        const socket = this.sockets[fields.port];
        if (socket === undefined) {
          console.warn(
            `Received packet on closed port 0x${fields.port.toString(16)}`,
          );
        } else {
          socket.onReceive(fields.information);
        }
      }
      this.sendSupervisoryResponse(SupervisoryPacketKind.RR, fields.poll);
    } else {
      if (
        ![SupervisoryPacketKind.RR, SupervisoryPacketKind.REJ].includes(
          fields.kind,
        )
      ) {
        console.error(
          `Received a command packet which is not yet supported by this implementation: ${fields.kind}`,
        );
        // Pretend it's an RR packet, fallthrough
      }

      this.processAck(fields.ackNumber);

      if (fields.poll) {
        this.sendSupervisoryResponse(SupervisoryPacketKind.RR, true);
      }

      this.pumpSendQueue();
    }
  }

  private responsePacketReceived(packet: Buffer): void {
    if (!this.ncp?.isOpened()) {
      console.error(
        'Received response packet before transport is open. Discarding.',
      );
      return;
    }

    // Information packets cannot be responses; we only need to
    // handle receiving Supervisory packets.
    let fields: ReliableSupervisoryPacket;

    try {
      fields = ReliableSupervisoryPacket.parse(packet);
    } catch {
      console.error('Received malformed response packet');
      this.ncp.restart();
      return;
    }

    this.opened.set();
    this.processAck(fields.ackNumber);
    this.pumpSendQueue();
    if (
      ![SupervisoryPacketKind.RR, SupervisoryPacketKind.REJ].includes(
        fields.kind,
      )
    ) {
      console.error(
        `Received a response packet which is not yet supported by this implementation: ${fields.kind}`,
      );
    }
  }
}
