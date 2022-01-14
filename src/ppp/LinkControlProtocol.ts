import ControlProtocol, { ControlProtocolState } from './ControlProtocol';
import Interface from '../Interface';
import LCPEncapsulation from './LCPEncapsulation';
import MagicPlusData from './MagicPlusData';

import identifierGenerator from '../util/identifierGenerator';

// LCP-specific Code values
export enum LCPCode {
  ProtocolReject = 8,
  EchoRequest = 9,
  EchoReply = 10,
  DiscardRequest = 11,
  Identification = 12,
}

export default class LinkControlProtocol extends ControlProtocol {
  private echoRequestIdentifier = identifierGenerator();
  private lastSentEchoRequestIdentifier = 255;
  private lastSentEchoRequestData = Buffer.alloc(0);
  private pingAttemptsRemaining = 0;
  private pingPromiseResolve?: () => void;
  private pingPromiseReject?: (err?: Error) => void;
  private pingTimer?: NodeJS.Timeout;
  private pingTimeout = 0;

  constructor(private intf: Interface) {
    super('LCP');
  }

  private resetPingTimer(): void {
    if (this.pingTimer !== undefined) {
      clearTimeout(this.pingTimer);
      this.pingTimer = undefined;
      this.pingPromiseResolve = undefined;
      this.pingPromiseReject = undefined;
    }
  }

  public up(): void {
    super.up(this.intf.connect(0xc021));
  }

  protected handleUnknownCode(
    code: LCPCode,
    identifier: number,
    data: Buffer,
  ): boolean {
    if (!Object.values(LCPCode).includes(code)) {
      return false;
    }

    switch (code) {
      case LCPCode.ProtocolReject:
        break; // TODO: tell NCP that it's been rejected
      case LCPCode.EchoRequest:
        this.handleEchoRequest(identifier, data);
        break;
      case LCPCode.EchoReply:
        this.handleEchoReply(identifier, data);
        break;
      case LCPCode.DiscardRequest:
        break;
      case LCPCode.Identification:
        break; // TODO
      default:
        /* istanbul ignore next */
        throw new Error('Supported LCP code not handled');
    }
    return true;
  }

  public ping(attempts = 3, timeout = 1000): Promise<void> {
    if (this.state !== ControlProtocolState.Opened) {
      return Promise.reject(new Error('Cannot ping when LCP is not opened'));
    }

    if (attempts < 1) {
      return Promise.reject(new Error('attempts must be positive'));
    }

    if (timeout <= 0) {
      return Promise.reject(new Error('timeout must be positive'));
    }

    if (this.pingTimer !== undefined) {
      return Promise.reject(new Error('Another ping is currently in progress'));
    }

    this.pingAttemptsRemaining = attempts - 1;
    this.pingTimeout = timeout;
    this.sendEchoRequest(Buffer.alloc(0));
    this.pingTimer = setTimeout(this.pingTimerExpired.bind(this), timeout);

    return new Promise((resolve, reject) => {
      this.pingPromiseResolve = resolve;
      this.pingPromiseReject = reject;
    });
  }

  private sendEchoRequest(data: Buffer): void {
    this.lastSentEchoRequestIdentifier = this.echoRequestIdentifier();
    this.lastSentEchoRequestData = data;
    this.sendPacket(
      LCPEncapsulation.build(
        LCPCode.EchoRequest,
        this.lastSentEchoRequestIdentifier,
        MagicPlusData.build(0, data),
      ),
    );
  }

  private handleEchoRequest(identifier: number, data: Buffer): void {
    if (this.state !== ControlProtocolState.Opened) return;

    let request: MagicPlusData;

    try {
      request = MagicPlusData.parse(data);
    } catch {
      console.error('Error parsing Echo-Request packet');
      return;
    }

    if (request.magicNumber !== 0) {
      // The Magic-Number option is not implemented, so an
      // Echo-Request packet MUST be transmitted with the
      // Magic-Number field set to zero. An Echo-Request with
      // any other value must therefore be malformed.
      console.log(
        `Received malformed Echo-Request packet: packet contains nonzero Magic-Number value 0x${request.magicNumber.toString(
          8,
        )}`,
      );
      return;
    }

    this.sendPacket(
      LCPEncapsulation.build(
        LCPCode.EchoReply,
        identifier,
        MagicPlusData.build(0, request.data),
      ),
    );
  }

  private handleEchoReply(identifier: number, data: Buffer): void {
    if (this.state !== ControlProtocolState.Opened) return;

    let reply: MagicPlusData;

    try {
      reply = MagicPlusData.parse(data);
    } catch {
      console.error('Error parsing Echo-Reply packet');
      return;
    }

    if (reply.magicNumber !== 0) {
      // The Magic-Number option is not implemented, so an
      // Echo-Reply packet MUST be transmitted with the
      // Magic-Number field set to zero. An Echo-Reply with
      // any other value must therefore be malformed.
      console.log(
        `Received malformed Echo-Reply packet: packet contains nonzero Magic-Number value 0x${reply.magicNumber.toString(
          8,
        )}`,
      );
      return;
    }

    if (
      identifier != this.lastSentEchoRequestIdentifier ||
      Buffer.compare(reply.data, this.lastSentEchoRequestData) !== 0
    ) {
      return;
    }

    if (this.pingPromiseResolve) this.pingPromiseResolve();
    this.resetPingTimer();
  }

  private pingTimerExpired(): void {
    if (this.pingAttemptsRemaining > 0) {
      this.pingAttemptsRemaining -= 1;
      this.sendEchoRequest(Buffer.alloc(0));
      this.pingTimer = setTimeout(
        this.pingTimerExpired.bind(this),
        this.pingTimeout,
      );
    } else {
      if (this.pingPromiseReject) {
        this.pingPromiseReject(new Error('Ping timed out'));
      }
      this.resetPingTimer();
    }
  }

  protected thisLayerUp(): void {
    console.log(`[${this.displayName}] layer up`);
    this.emit('linkUp');
  }

  protected thisLayerDown(): void {
    console.log(`[${this.displayName}] layer down`);
    if (this.pingTimer) {
      if (this.pingPromiseReject) {
        this.pingPromiseReject(new Error('Ping failed: layer down'));
      }
      this.resetPingTimer();
    }
    this.emit('linkDown');
  }

  protected thisLayerStarted(): void {
    console.log(`[${this.displayName}] layer started`);
    this.emit('linkStarted');
  }

  protected thisLayerFinished(): void {
    console.log(`[${this.displayName}] layer finished`);
    this.emit('linkFinished');
  }
}
