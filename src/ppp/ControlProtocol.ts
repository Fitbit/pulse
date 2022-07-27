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

/* eslint-disable @typescript-eslint/no-empty-function */

import EventEmitter from 'events';
import InterfaceSocket from '../InterfaceSocket';
import LCPEncapsulation from './LCPEncapsulation';
import OptionList from './OptionList';
import Event from '../util/event';

// Code values shared by all Control Protocols
export enum ControlCode {
  ConfigureRequest = 1,
  ConfigureAck = 2,
  ConfigureNak = 3,
  ConfigureReject = 4,
  TerminateRequest = 5,
  TerminateAck = 6,
  CodeReject = 7,
}

export enum ControlProtocolState {
  Initial = 'initial',
  Starting = 'starting',
  Closed = 'closed',
  Stopped = 'stopped',
  Closing = 'closing',
  Stopping = 'stopping',
  ReqSent = 'req-sent',
  AckRcvd = 'ack-rcvd',
  AckSent = 'ack-sent',
  Opened = 'opened',
}

type ControlProtocolTransition<T = ControlProtocolState> =
  | {
      source: T | T[];
      dest: T;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      before?: string[];
      after?: string[];
    }
  | [T | T[], T];

function ensureArray<T>(items: T | T[]) {
  return Array.isArray(items) ? items : [items];
}

export default class ControlProtocol extends EventEmitter {
  /* The number of Terminate-Request packets sent without receiving a
  Terminate-Ack before assuming that the peer is unable to respond. */
  private static readonly maxTerminate = 2;

  /* Number of Configure-Request packets sent without receiving a
  valid Configure-Ack, Configure-Nak or Configure-Reject before
  assuming that the peer is unable to respond. */
  private static readonly maxConfigure = 10;

  /* Number of Configure-Nak packets sent without sending a
  Configure-Ack before assuming that configuration is not
  converging. */
  private static readonly maxFailure = 5;

  /* Restart timer expiry duration, in milliseconds. */
  private static readonly restartTimeout = 4000;

  /* TODO: proper MTU/MRU support */
  private static readonly mtu = 1500;

  protected state: ControlProtocolState = ControlProtocolState.Initial;
  private socket?: InterfaceSocket;
  private restartTimer?: NodeJS.Timeout;
  private restartCount = 0;

  private configureRequestIdentifier = 255;
  private codeRejectIdentifier = 0;

  private lastSentConfigureOptions = Buffer.alloc(0);
  private lastSentConfigureRequest = Buffer.alloc(0);
  private configureFailCount = ControlProtocol.maxFailure;
  private isFinished = new Event();

  constructor(protected displayName: string) {
    super();
  }

  private maybeStopRestartTimer(): void {
    if (
      [
        ControlProtocolState.Initial,
        ControlProtocolState.Starting,
        ControlProtocolState.Closed,
        ControlProtocolState.Stopped,
        ControlProtocolState.Opened,
      ].includes(this.state)
    ) {
      this.stopRestartTimer();
    }
  }

  private handleEventCallback(cb: unknown, args: unknown[]) {
    // Sorry typings... :(
    const func: (...args: unknown[]) => void = this[
      cb as keyof this
    ] as unknown as (...args: unknown[]) => void;
    func.call(this, ...args);
  }

  private addStateTrigger(
    transitions: ControlProtocolTransition<ControlProtocolState>[],
  ): (...args: unknown[]) => void {
    return (...args: unknown[]) => {
      for (const transition of transitions) {
        if (Array.isArray(transition)) {
          const [sources, dest] = transition;
          if (ensureArray(sources).includes(this.state)) {
            this.state = dest;
            this.maybeStopRestartTimer();
            break;
          }
        } else {
          const { source, dest, before, after } = transition;
          if (ensureArray(source).includes(this.state)) {
            if (before)
              before.forEach((cb) => this.handleEventCallback(cb, args));
            this.state = dest;
            if (after)
              after.forEach((cb) => this.handleEventCallback(cb, args));
            this.maybeStopRestartTimer();
            break;
          }
        }
      }
    };
  }

  // The lower layer is ready to carry packets.
  private _up = this.addStateTrigger([
    [ControlProtocolState.Initial, ControlProtocolState.Closed],
    {
      source: ControlProtocolState.Starting,
      dest: ControlProtocolState.ReqSent,
      before: ['initConfigureRestartCount', 'sendConfigureRequest'],
    },
  ]);

  // The lower layer is no longer available to carry packets.
  private _down = this.addStateTrigger([
    [ControlProtocolState.Closed, ControlProtocolState.Initial],
    {
      source: ControlProtocolState.Stopped,
      dest: ControlProtocolState.Starting,
      before: ['thisLayerStarted'],
    },
    [ControlProtocolState.Closing, ControlProtocolState.Initial],
    [
      [
        ControlProtocolState.Stopping,
        ControlProtocolState.ReqSent,
        ControlProtocolState.AckRcvd,
        ControlProtocolState.AckSent,
      ],
      ControlProtocolState.Starting,
    ],
    {
      source: ControlProtocolState.Opened,
      dest: ControlProtocolState.Starting,
      before: ['thisLayerDown'],
    },
  ]);

  // The link is administratively allowed to be opened.
  public open = this.addStateTrigger([
    {
      source: ControlProtocolState.Initial,
      dest: ControlProtocolState.Starting,
      before: ['thisLayerStarted'],
    },
    [ControlProtocolState.Starting, ControlProtocolState.Starting],
    {
      source: ControlProtocolState.Closed,
      dest: ControlProtocolState.ReqSent,
      before: ['initConfigureRestartCount', 'sendConfigureRequest'],
    },
    [ControlProtocolState.Stopped, ControlProtocolState.Stopped],
    [ControlProtocolState.Closing, ControlProtocolState.Stopping],
    [ControlProtocolState.Stopping, ControlProtocolState.Stopping],
    [ControlProtocolState.ReqSent, ControlProtocolState.ReqSent],
    [ControlProtocolState.AckRcvd, ControlProtocolState.AckRcvd],
    [ControlProtocolState.AckSent, ControlProtocolState.AckSent],
    [ControlProtocolState.Opened, ControlProtocolState.Opened],
  ]);

  // The link is not allowed to be opened.
  public close = this.addStateTrigger([
    [ControlProtocolState.Initial, ControlProtocolState.Initial],
    {
      source: ControlProtocolState.Starting,
      dest: ControlProtocolState.Initial,
      before: ['_thisLayerFinished'],
    },
    [ControlProtocolState.Closed, ControlProtocolState.Closed],
    [ControlProtocolState.Stopped, ControlProtocolState.Closed],
    [ControlProtocolState.Closing, ControlProtocolState.Closing],
    [ControlProtocolState.Stopping, ControlProtocolState.Closing],
    {
      source: [
        ControlProtocolState.ReqSent,
        ControlProtocolState.AckRcvd,
        ControlProtocolState.AckSent,
      ],
      dest: ControlProtocolState.Closing,
      before: ['initTerminateRestartCount', 'sendTerminateRequest'],
    },
    {
      source: ControlProtocolState.Opened,
      dest: ControlProtocolState.Closing,
      before: [
        'thisLayerDown',
        'initTerminateRestartCount',
        'sendTerminateRequest',
      ],
    },
  ]);

  // TO+ Event
  private timeoutRetry = this.addStateTrigger([
    {
      source: ControlProtocolState.Closing,
      dest: ControlProtocolState.Closing,
      before: ['sendTerminateRequest'],
    },
    {
      source: ControlProtocolState.Stopping,
      dest: ControlProtocolState.Stopping,
      before: ['sendTerminateRequest'],
    },
    {
      source: [ControlProtocolState.ReqSent, ControlProtocolState.AckRcvd],
      dest: ControlProtocolState.ReqSent,
      before: ['retransmitConfigureRequest'],
    },
    {
      source: ControlProtocolState.AckSent,
      dest: ControlProtocolState.AckSent,
      before: ['retransmitConfigureRequest'],
    },
  ]);

  // TO- Event
  private timeoutGiveup = this.addStateTrigger([
    {
      source: ControlProtocolState.Closing,
      dest: ControlProtocolState.Closed,
      before: ['_thisLayerFinished'],
    },
    {
      source: [
        ControlProtocolState.Stopping,
        ControlProtocolState.ReqSent,
        ControlProtocolState.AckRcvd,
        ControlProtocolState.AckSent,
      ],
      dest: ControlProtocolState.Stopped,
      before: ['_thisLayerFinished'],
    },
  ]);

  // RCR+ Event
  private receiveConfigureRequestAcceptable = this.addStateTrigger([
    {
      source: ControlProtocolState.Closed,
      dest: ControlProtocolState.Closed,
      before: ['sendTerminateAck'],
    },
    {
      source: ControlProtocolState.Stopped,
      dest: ControlProtocolState.AckSent,
      before: [
        'initConfigureRestartCount',
        'sendConfigureRequest',
        'sendConfigureAck',
      ],
    },
    [ControlProtocolState.Closing, ControlProtocolState.Closing],
    [ControlProtocolState.Stopping, ControlProtocolState.Stopping],
    {
      source: [ControlProtocolState.ReqSent, ControlProtocolState.AckSent],
      dest: ControlProtocolState.AckSent,
      before: ['sendConfigureAck'],
    },
    {
      source: ControlProtocolState.AckRcvd,
      dest: ControlProtocolState.Opened,
      before: ['sendConfigureAck'],
      after: ['thisLayerUp'],
    },
    {
      source: ControlProtocolState.Opened,
      dest: ControlProtocolState.AckSent,
      before: ['thisLayerDown', 'sendConfigureRequest', 'sendConfigureAck'],
    },
  ]);

  // RCR- Event
  private receiveConfigureRequestUnacceptable = this.addStateTrigger([
    {
      source: ControlProtocolState.Closed,
      dest: ControlProtocolState.Closed,
      before: ['sendTerminateAck'],
    },
    {
      source: ControlProtocolState.Stopped,
      dest: ControlProtocolState.ReqSent,
      before: [
        'initConfigureRestartCount',
        'sendConfigureRequest',
        'sendConfigureNakOrRej',
      ],
    },
    [ControlProtocolState.Closing, ControlProtocolState.Closing],
    [ControlProtocolState.Stopping, ControlProtocolState.Stopping],
    {
      source: [ControlProtocolState.ReqSent, ControlProtocolState.AckSent],
      dest: ControlProtocolState.ReqSent,
      before: ['sendConfigureNakOrRej'],
    },
    {
      source: ControlProtocolState.AckRcvd,
      dest: ControlProtocolState.AckRcvd,
      before: ['sendConfigureNakOrRej'],
    },
    {
      source: ControlProtocolState.Opened,
      dest: ControlProtocolState.ReqSent,
      before: [
        'thisLayerDown',
        'sendConfigureRequest',
        'sendConfigureNakOrRej',
      ],
    },
  ]);

  // RCA Event
  private receiveConfigureAck = this.addStateTrigger([
    {
      source: ControlProtocolState.Closed,
      dest: ControlProtocolState.Closed,
      before: ['sendTerminateAck'],
    },
    {
      source: ControlProtocolState.Stopped,
      dest: ControlProtocolState.Stopped,
      before: ['sendTerminateAck'],
    },
    [ControlProtocolState.Closing, ControlProtocolState.Closing],
    [ControlProtocolState.Stopping, ControlProtocolState.Stopping],
    {
      source: ControlProtocolState.ReqSent,
      dest: ControlProtocolState.AckRcvd,
      before: ['initConfigureRestartCount'],
    },
    {
      source: ControlProtocolState.AckRcvd,
      dest: ControlProtocolState.ReqSent,
      before: ['sendConfigureRequest'],
    },
    {
      source: ControlProtocolState.AckSent,
      dest: ControlProtocolState.Opened,
      before: ['initConfigureRestartCount'],
      after: ['thisLayerUp'],
    },
    {
      source: ControlProtocolState.Opened,
      dest: ControlProtocolState.ReqSent,
      before: ['thisLayerDown', 'sendConfigureRequest'],
    },
  ]);

  // RCN Event
  private receiveConfigureNakOrRej = this.addStateTrigger([
    {
      source: ControlProtocolState.Closed,
      dest: ControlProtocolState.Closed,
      before: ['sendTerminateAck'],
    },
    {
      source: ControlProtocolState.Stopped,
      dest: ControlProtocolState.Stopped,
      before: ['sendTerminateAck'],
    },
    [ControlProtocolState.Closing, ControlProtocolState.Closing],
    [ControlProtocolState.Stopping, ControlProtocolState.Stopping],
    {
      source: ControlProtocolState.ReqSent,
      dest: ControlProtocolState.ReqSent,
      before: ['initConfigureRestartCount', 'sendConfigureRequest'],
    },
    {
      source: ControlProtocolState.AckRcvd,
      dest: ControlProtocolState.ReqSent,
      before: ['sendConfigureRequest'],
    },
    {
      source: ControlProtocolState.AckSent,
      dest: ControlProtocolState.AckSent,
      before: ['initConfigureRestartCount', 'sendConfigureRequest'],
    },
    {
      source: ControlProtocolState.Opened,
      dest: ControlProtocolState.ReqSent,
      before: ['thisLayerDown', 'sendConfigureRequest'],
    },
  ]);

  // RTR Event
  private receiveTerminateRequest = this.addStateTrigger([
    {
      source: ControlProtocolState.Closed,
      dest: ControlProtocolState.Closed,
      before: ['sendTerminateAck'],
    },
    {
      source: ControlProtocolState.Stopped,
      dest: ControlProtocolState.Stopped,
      before: ['sendTerminateAck'],
    },
    {
      source: ControlProtocolState.Closing,
      dest: ControlProtocolState.Closing,
      before: ['sendTerminateAck'],
    },
    {
      source: ControlProtocolState.Stopping,
      dest: ControlProtocolState.Stopping,
      before: ['sendTerminateAck'],
    },
    {
      source: [
        ControlProtocolState.ReqSent,
        ControlProtocolState.AckRcvd,
        ControlProtocolState.AckSent,
      ],
      dest: ControlProtocolState.ReqSent,
      before: ['sendTerminateAck'],
    },
    {
      source: ControlProtocolState.Opened,
      dest: ControlProtocolState.Stopping,
      before: ['thisLayerDown', 'zeroRestartCount', 'sendTerminateAck'],
    },
  ]);

  // RTA Event
  private receiveTerminateAck = this.addStateTrigger([
    [ControlProtocolState.Closed, ControlProtocolState.Closed],
    [ControlProtocolState.Stopped, ControlProtocolState.Stopped],
    {
      source: ControlProtocolState.Closing,
      dest: ControlProtocolState.Closed,
      before: ['_thisLayerFinished'],
    },
    {
      source: ControlProtocolState.Stopping,
      dest: ControlProtocolState.Stopped,
      before: ['_thisLayerFinished'],
    },
    [
      [ControlProtocolState.ReqSent, ControlProtocolState.AckRcvd],
      ControlProtocolState.ReqSent,
    ],
    {
      source: ControlProtocolState.Opened,
      dest: ControlProtocolState.ReqSent,
      before: ['thisLayerDown', 'sendConfigureRequest'],
    },
  ]);

  // The RUC event is intentionally left out of the state table.
  // Since that event never triggers a state transition, it is
  // handled as a special case in the code.

  // RXJ+ Event
  private receiveCodeRejectPermitted = this.addStateTrigger([
    [ControlProtocolState.Closed, ControlProtocolState.Closed],
    [ControlProtocolState.Stopped, ControlProtocolState.Stopped],
    [ControlProtocolState.Closing, ControlProtocolState.Closing],
    [ControlProtocolState.Stopping, ControlProtocolState.Stopping],
    [
      [ControlProtocolState.ReqSent, ControlProtocolState.AckRcvd],
      ControlProtocolState.ReqSent,
    ],
    [ControlProtocolState.AckSent, ControlProtocolState.AckSent],
    [ControlProtocolState.Opened, ControlProtocolState.Opened],
  ]);

  // RXJ- Event
  private receiveCodeRejectCatastrophic = this.addStateTrigger([
    {
      source: [ControlProtocolState.Closed, ControlProtocolState.Closing],
      dest: ControlProtocolState.Closed,
      before: ['_thisLayerFinished'],
    },
    {
      source: [
        ControlProtocolState.Stopped,
        ControlProtocolState.Stopping,
        ControlProtocolState.ReqSent,
        ControlProtocolState.AckRcvd,
        ControlProtocolState.AckSent,
      ],
      dest: ControlProtocolState.Stopped,
      before: ['_thisLayerFinished'],
    },
    {
      source: ControlProtocolState.Opened,
      dest: ControlProtocolState.Stopping,
      before: [
        'thisLayerDown',
        'initTerminateRestartCount',
        'sendTerminateRequest',
      ],
    },
  ]);

  // There are no transitions for RXR events because none of the
  // packets which trigger that event are supported by the base
  // Control Protocol state machine.

  public restart(): void {
    this._down();
    this._up();
  }

  public up(socket: InterfaceSocket): void {
    this.socket = socket;
    socket.on('data', this.packetReceived.bind(this));
    socket.on('close', this.down.bind(this));
    this._up();
  }

  public down(): void {
    this._down();
    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }
  }

  /*
    Gracefully close the link, returning a Promise that resolves when
    the link is closed.
  */
  public shutdown(): Promise<void> {
    if (
      [
        ControlProtocolState.Initial,
        ControlProtocolState.Starting,
        ControlProtocolState.Closed,
        ControlProtocolState.Stopped,
      ].includes(this.state)
    ) {
      return Promise.resolve();
    }

    this.close();
    return this.isFinished.wait().then();
  }

  public isOpened(): boolean {
    return this.state === ControlProtocolState.Opened;
  }

  private getCodeRejectIdentifier(): number {
    const identifier = this.codeRejectIdentifier;
    this.codeRejectIdentifier = (this.codeRejectIdentifier + 1) % 256;
    return identifier;
  }

  private getConfigureRequestIdentifier(): number {
    this.configureRequestIdentifier =
      (this.configureRequestIdentifier + 1) % 256;
    return this.configureRequestIdentifier;
  }

  // Restart timer
  private startRestartTimer(timeout: number): void {
    this.stopRestartTimer();
    this.restartTimer = setTimeout(
      this.restartTimerExpired.bind(this),
      timeout,
    );
  }

  private stopRestartTimer(): void {
    if (this.restartTimer !== undefined) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
  }

  private decrementAndStartRestartTimer(): void {
    this.restartCount -= 1;
    if (this.restartCount < 0) {
      /* istanbul ignore next */
      throw new Error('assert failed: restartCount >= 0');
    }
    this.startRestartTimer(ControlProtocol.restartTimeout);
  }

  private restartTimerExpired(): void {
    if (this.restartCount > 0) {
      this.timeoutRetry();
    } else {
      this.timeoutGiveup();
    }
  }

  // Actions

  /*
    Signal to upper layers that the automaton is entering the Opened state.

    Subclasses should override this method.
  */
  protected thisLayerUp(): void {}

  /*
    Signal to upper layers that the automaton is leaving the Opened state.

    Subclasses should override this method.
  */
  protected thisLayerDown(): void {}

  /*
    Signal to lower layers that the automaton is entering the
    Starting state and that the lower layer is needed for the link.

    Subclasses should override this method.
  */
  protected thisLayerStarted(): void {}

  /*
    Signal to lower layers that the lower layer is no longer needed for the link.

    Subclasses should override this method.
  */
  protected thisLayerFinished(): void {}

  /*
    Send a packet out to the lower layer.
  */
  public sendPacket(packet: Buffer): void {
    this.socket?.send(packet);
  }

  // Actions handled internally

  private _thisLayerFinished(): void {
    this.isFinished.set();
    // duplicated because in py there's an event triggered here manually, TODO remove?
    this.thisLayerFinished();
  }

  private initConfigureRestartCount(): void {
    this.restartCount = ControlProtocol.maxConfigure;
  }

  private initTerminateRestartCount(): void {
    this.restartCount = ControlProtocol.maxTerminate;
  }

  private zeroRestartCount(): void {
    this.restartCount = 0;
    this.startRestartTimer(ControlProtocol.restartTimeout);
  }

  private sendConfigureRequest(): void {
    this.decrementAndStartRestartTimer();
    const options = OptionList.build(this.getConfigureRequestOptions());
    const packet = LCPEncapsulation.build(
      ControlCode.ConfigureRequest,
      this.getConfigureRequestIdentifier(),
      options,
    );
    this.lastSentConfigureOptions = options;
    this.lastSentConfigureRequest = packet;
    this.sendPacket(packet);
  }

  private retransmitConfigureRequest(): void {
    this.decrementAndStartRestartTimer();
    this.sendPacket(this.lastSentConfigureRequest);
  }

  private sendConfigureAck(identifier: number, { options }: OptionList): void {
    this.sendPacket(
      LCPEncapsulation.build(
        ControlCode.ConfigureAck,
        identifier,
        OptionList.build(options.map(({ type, data }) => [type, data])),
      ),
    );
  }

  private sendConfigureNakOrRej(): void {
    if (this.configureFailCount > 0) {
      throw new Error('Configure NAK/REJ not implemented');
    }
    // TODO convert nak to reject; strip out locally-desired
    // options.
    // FIXME find an appropriate place to reinitialize the fail
    // count.
  }

  private sendTerminateRequest(): void {
    this.decrementAndStartRestartTimer();
    // FIXME: identifier
    this.sendPacket(LCPEncapsulation.build(ControlCode.TerminateRequest, 42));
  }

  private sendTerminateAck(): void {
    // FIXME: identifier
    this.sendPacket(LCPEncapsulation.build(ControlCode.TerminateAck, 42));
  }

  private sendCodeReject(packet: Buffer): void {
    // Truncate rejected_packet to fit within the link MTU
    const maxLength = ControlProtocol.mtu - LCPEncapsulation.headerSize;
    if (maxLength <= 0) {
      // TODO: add test
      throw new Error('Cannot truncate rejected packet to fit within MTU');
    }

    const truncatedPacket = packet.slice(0, maxLength + 1);

    this.sendPacket(
      LCPEncapsulation.build(
        ControlCode.CodeReject,
        this.getCodeRejectIdentifier(),
        truncatedPacket,
      ),
    );
  }

  // Events not handled by the state table

  /*
    The lower layer must call this method whenever a packet
    is received which is addressed to this protocol.

    The packet must already have any lower layer headers (including
    the protocol number) removed.
  */
  private packetReceived(packet: Buffer): void {
    if (
      this.state === ControlProtocolState.Initial ||
      this.state === ControlProtocolState.Starting
    ) {
      console.warn(`Received unexpected packet in state ${this.state}`);
    }

    let encapsulation: LCPEncapsulation;
    try {
      encapsulation = LCPEncapsulation.parse(packet);
    } catch {
      console.warn('Packet parsing failed');
      return;
    }

    let code: ControlCode;
    if (!Object.values(ControlCode).includes(encapsulation.code)) {
      const handled = this.handleUnknownCode(
        encapsulation.code,
        encapsulation.identifier,
        encapsulation.data,
      );

      if (!handled) this.sendCodeReject(packet);

      return;
    } else {
      code = encapsulation.code;
    }

    if (
      [
        ControlCode.ConfigureRequest,
        ControlCode.ConfigureAck,
        ControlCode.ConfigureNak,
        ControlCode.ConfigureReject,
      ].includes(code)
    ) {
      if (
        [ControlProtocolState.Closing, ControlProtocolState.Stopping].includes(
          this.state,
        )
      ) {
        // Waiting for Terminate-Ack; ignoring configure requests.
        return;
      }

      let options: OptionList;
      try {
        options = OptionList.parse(encapsulation.data);
      } catch {
        console.error('Parsing option list failed');
        return;
      }

      if (code === ControlCode.ConfigureRequest) {
        this.handleConfigureRequest(encapsulation.identifier, options);
      } else {
        if (encapsulation.identifier !== this.configureRequestIdentifier) {
          // Invalid packet; silently discard
          console.warn(
            `Received response packet with mismatched identifier: expected ${this.configureRequestIdentifier} received: ${encapsulation.identifier}`,
          );
          return;
        } else if (code === ControlCode.ConfigureAck) {
          if (
            Buffer.compare(
              encapsulation.data,
              this.lastSentConfigureOptions,
            ) === 0
          ) {
            this.receiveConfigureAck(options);
          } else {
            console.error('Received Configure-Ack with mismatched options');
            return;
          }
        } else if (code === ControlCode.ConfigureNak) {
          this.handleConfigureNak(options);
          this.receiveConfigureNakOrRej();
        } else if (code === ControlCode.ConfigureReject) {
          this.handleConfigureReject(options);
          this.receiveConfigureNakOrRej();
        } else {
          /* istanbul ignore next */
          throw new Error('PPP machine reached impossible state');
        }
      }
    } else if (code === ControlCode.TerminateRequest) {
      this.receiveTerminateRequest();
    } else if (code === ControlCode.TerminateAck) {
      this.receiveTerminateAck();
    } else if (code === ControlCode.CodeReject) {
      let rejectedPacket: LCPEncapsulation;
      try {
        rejectedPacket = LCPEncapsulation.parse(encapsulation.data);
      } catch {
        console.error('Error parsing Code-Reject response');
        return;
      }

      if (Object.values(ControlCode).includes(rejectedPacket.code)) {
        console.error(
          `Remote peer rejected a packet with code ${rejectedPacket.code}; the connection cannot proceed without this code being supported`,
        );
        this.receiveCodeRejectCatastrophic();
      } else {
        const isCatestrophic = this.handleCodeReject(rejectedPacket);
        if (isCatestrophic) {
          console.error(
            'Remote peer rejected a packet which must be supported for the connection to proceeed',
          );
          this.receiveCodeRejectCatastrophic();
        }
      }
    } else {
      /* istanbul ignore next */
      throw new Error('PPP machine did not handle known code');
    }
  }

  private handleConfigureRequest(
    identifier: number,
    options: OptionList,
  ): void {
    const response = this.handleIncomingConfigureRequest(options);
    if (response) {
      this.receiveConfigureRequestAcceptable(identifier, options);
    } else {
      // TODO assert that the response options have not been reordered.
      this.receiveConfigureRequestUnacceptable(identifier, options);
    }
  }

  /*
    Implementations will need to parse the options list and
    determine if the options are acceptable.

    If the complete set of options are acceptable, the
    implementation must configure itself according to the options,
    then return `true`.

    If any of the options are unrecognizable, the implementation
    must return an instance of `OptionList` containing
    all of the options that were not recognized, in the same order
    that they were received.

    If all of the options are recognized but contain unacceptable
    values, or if the implementation wants to request the
    negotiation of an option which the sender of the configuration
    request did not include, the implementation must return an
    instance of `ConfigurationNak` containing the options list that
    should be sent in a Configure-Nak packet (all acceptable options
    filtered out).
  */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected handleIncomingConfigureRequest(
    options: OptionList,
  ): true | OptionList {
    // TODO: match to description above
    return options.options.length === 0 ? true : options;
  }

  // Negotiation of outgoing options (configure remote peer)

  /*
    Return the list of Options to be sent to the remote peer in
    the next Configure-Request packet.
  */
  protected getConfigureRequestOptions(): [number, Buffer][] {
    return [];
  }

  /*
    Handle options that were rejected by the remote peer.
    Implementations must keep track of state so that the next call
    to `getConfigureRequestOptions` will reflect the rejected
    options.

    TODO: If the session cannot proceed because an option was rejected
    which the implementation requires be negotiated,
    `NegotiationFailure` should be raised.
  */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected handleConfigureReject(unacceptableOptions: OptionList): void {
    // pass
  }

  /*
    Handle options which were not acceptable by the remote peer.
    Implementations must update their configuration state so that
    the next call to `getConfigureRequestOptions` will
    reflect the values that the remote peer has deemed unacceptable.
  */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected handleConfigureNak(unacceptableOptions: OptionList): void {
    // pass
  }

  /*
    Handle the remote peer accepting the options list.
  */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected handleConfigureAccepted(options: OptionList): void {
    // pass
  }

  /* Returns `true` if the code is handled, otherwise `false` */
  protected handleUnknownCode(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    code: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    identifier: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    data: Buffer,
  ): boolean {
    return false;
  }

  /*
    Handle a Code-Reject packet received from the peer containing
    a code which the base control protocol implementation does not
    recognize.

    Return `true` if a rejection of that code
    cannot be recovered from, otherwise `false`.
  */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected handleCodeReject(rejectedPacket: LCPEncapsulation): boolean {
    return false;
  }
}
