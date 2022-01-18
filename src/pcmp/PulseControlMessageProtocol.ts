import EventEmitter from 'events';

import PCMPPacket from './PCMPPacket';
import Transport from '../transports';

export enum PCMPCode {
  EchoRequest = 1,
  EchoReply = 2,
  DiscardRequest = 3,
  PortClosed = 129,
  UnknownCode = 130,
}

/*
  This protocol is unique in that it is logically part of the
  transport but is layered on top of the transport over the wire.
  It acts like a socket and a protocol all in one.
*/
export default class PulseControlMessageProtocol extends EventEmitter {
  public readonly port = 0x0001;
  public readonly mtu = 0;
  public closed = false;

  private pingAttemptsRemaining = 0;
  private pingPromiseResolve?: () => void;
  private pingPromiseReject?: (err?: Error) => void;
  private pingTimer?: NodeJS.Timeout;
  private pingTimeout = 0;

  constructor(private transport: Transport) {
    super();
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;

    if (this.pingPromiseReject) {
      this.pingPromiseReject(new Error('Ping failed: socket closed'));
    }
    this.resetPingTimer();

    this.transport.unregisterSocket(this.port);
  }

  private sendUnknownCode(code: number): void {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(code);
    this.transport.send(this.port, PCMPPacket.build(PCMPCode.UnknownCode, buf));
  }

  private sendEchoRequest(data = Buffer.alloc(0)): void {
    this.transport.send(
      this.port,
      PCMPPacket.build(PCMPCode.EchoRequest, data),
    );
  }

  private sendEchoReply(data: Buffer): void {
    this.transport.send(this.port, PCMPPacket.build(PCMPCode.EchoReply, data));
  }

  public onReceive(rawPacket: Buffer): void {
    let packet: PCMPPacket;

    try {
      packet = PCMPPacket.parse(rawPacket);
    } catch {
      console.error('Received malformed PCMP packet');
      return;
    }

    if (!Object.values(PCMPCode).includes(packet.code)) {
      console.error(
        `Received PCMP packet with unknown code: ${packet.code.toString(16)}`,
      );
      this.sendUnknownCode(packet.code);
      return;
    }

    const code: PCMPCode = packet.code;

    switch (code) {
      case PCMPCode.DiscardRequest:
        break;
      case PCMPCode.EchoRequest:
        this.sendEchoReply(packet.information);
        break;
      case PCMPCode.EchoReply:
        if (this.pingPromiseResolve) this.pingPromiseResolve();
        this.resetPingTimer();
        console.log(`PCMP Echo-Reply: ${packet.information.toString('hex')}`);
        break;
      case PCMPCode.PortClosed:
        if (packet.information.byteLength === 2) {
          const closedPort = packet.information.readUInt16BE();
          this.emit('portClosed', closedPort);
        } else {
          console.error(
            `Remote peer sent malformed Port-Closed packet: ${packet.information.toString(
              'hex',
            )}`,
          );
        }
        break;
      case PCMPCode.UnknownCode:
        if (packet.information.byteLength === 1) {
          console.error(
            `Remote peer sent Unknown-Code(${packet.information.readUInt8()}) packet`,
          );
        } else {
          console.error(
            `Remote peer sent malformed Unknown-Code packet: ${packet.information.toString(
              'hex',
            )}`,
          );
        }
        break;
      default:
        /* istanbul ignore next */
        throw new Error('PCMP machine did not handle known code');
    }
  }

  /*
    Test the link quality by sending Echo-Request packets and
    listening for Echo-Reply packets from the remote peer.

    The ping is performed asynchronously, with the result returned as Promise.
    It will resolve if the ping is successful, or reject if all attempts/timeouts
    are exhausted and it is not.
  */
  public ping(attempts = 3, timeout = 1000): Promise<void> {
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
    this.sendEchoRequest();
    this.pingTimer = setTimeout(this.pingTimerExpired.bind(this), timeout);

    return new Promise((resolve, reject) => {
      this.pingPromiseResolve = resolve;
      this.pingPromiseReject = reject;
    });
  }

  private resetPingTimer(): void {
    if (this.pingTimer !== undefined) {
      clearTimeout(this.pingTimer);
      this.pingTimer = undefined;
    }
    this.pingAttemptsRemaining = 0;
    this.pingPromiseResolve = undefined;
    this.pingPromiseReject = undefined;
  }

  private pingTimerExpired(): void {
    if (this.pingAttemptsRemaining > 0) {
      this.pingAttemptsRemaining -= 1;
      this.sendEchoRequest();
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public send(data: Buffer): void {
    throw new Error('PCMP cannot be used as a socket');
  }
}
