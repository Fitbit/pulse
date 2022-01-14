import LinkControlProtocol, { LCPCode } from './LinkControlProtocol';
import Interface from '../Interface';
import InterfaceSocket from '../InterfaceSocket';
import LCPEncapsulation from './LCPEncapsulation';
import { ControlProtocolState } from './ControlProtocol';
import { encode } from '../encodingUtil';

let linkControlProtocol: LinkControlProtocol;
let socket: InterfaceSocket;
let intf: Interface;

let sendPacketSpy: jest.SpyInstance;

function assertPacketSent(
  code: number,
  identifier: number,
  body = Buffer.alloc(0),
): void {
  const packet = LCPEncapsulation.build(code, identifier, body);
  expect(sendPacketSpy).toBeCalledWith(packet);
  sendPacketSpy.mockClear();
}

function setControlState(state: ControlProtocolState): void {
  // eslint-disable-next-line
  (linkControlProtocol as any).state = state;
}

beforeEach(() => {
  jest.useFakeTimers();

  intf = new Interface();
  linkControlProtocol = new LinkControlProtocol(intf);
  linkControlProtocol.up();

  // eslint-disable-next-line
  socket = (linkControlProtocol as any).socket;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendPacketSpy = jest.spyOn(linkControlProtocol as any, 'sendPacket');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('receieved echo request', () => {
  function sendEchoRequest(identifier = 0, data = Buffer.alloc(4)): void {
    // eslint-disable-next-line
    const result = (linkControlProtocol as any).handleUnknownCode(
      LCPCode.EchoRequest,
      identifier,
      data,
    );
    expect(result).toEqual(true);
  }

  beforeEach(() => {
    setControlState(ControlProtocolState.Opened);
  });

  it('is dropped when not in opened state', () => {
    setControlState(ControlProtocolState.AckSent);
    sendEchoRequest();
    expect(sendPacketSpy).not.toBeCalled();
  });

  it('elicits reply', () => {
    sendEchoRequest();
    assertPacketSent(LCPCode.EchoReply, 0, Buffer.alloc(4));
  });

  it('includes request data in reply', () => {
    const data = encode('\x00\x00\x00\x00datadata');
    sendEchoRequest(5, data);
    assertPacketSent(LCPCode.EchoReply, 5, data);
  });

  it('drops request with missing magic number field', () => {
    sendEchoRequest(0, Buffer.alloc(0));
    expect(sendPacketSpy).not.toBeCalled();
  });

  it('drops request with non-zero magic number field', () => {
    const data = encode('\x00\x00\x00\x01');
    sendEchoRequest(0, data);
    expect(sendPacketSpy).not.toBeCalled();
  });
});

describe('ping', () => {
  const timeout = 1000;

  beforeEach(() => {
    setControlState(ControlProtocolState.Opened);
  });

  function respondToPing(): number {
    const lastCallIndex = sendPacketSpy.mock.calls.length - 1;
    // eslint-disable-next-line
    const packet: Buffer = (sendPacketSpy.mock.calls[lastCallIndex] as any)[0];
    const identifier = packet.readUInt8(1);
    expect(packet[0]).toEqual(LCPCode.EchoRequest);
    packet.writeUInt8(LCPCode.EchoReply);
    socket.handlePacket(packet);
    return identifier;
  }

  describe('rejects', () => {
    it('when LCP is not opened', () => {
      setControlState(ControlProtocolState.AckRcvd);
      return expect(linkControlProtocol.ping()).rejects.toThrowError(
        'Cannot ping when LCP is not opened',
      );
    });

    it('when attempts=0', () => {
      return expect(linkControlProtocol.ping(0)).rejects.toThrowError(
        'attempts must be positive',
      );
    });

    it('when attempts=-1', () => {
      return expect(linkControlProtocol.ping(-1)).rejects.toThrowError(
        'attempts must be positive',
      );
    });

    it('when timeout=0', () => {
      return expect(linkControlProtocol.ping(1, 0)).rejects.toThrowError(
        'timeout must be positive',
      );
    });

    it('when timeout=-1', () => {
      return expect(linkControlProtocol.ping(1, -1)).rejects.toThrowError(
        'timeout must be positive',
      );
    });

    it('one attempt with no reply', async () => {
      const attempts = 1;

      const pingPromise = linkControlProtocol.ping(attempts, timeout);
      jest.advanceTimersByTime(timeout);
      await expect(pingPromise).rejects.toThrowError('Ping timed out');
      expect(sendPacketSpy).toBeCalledTimes(attempts);
    });

    it('multiple attempts with no reply', async () => {
      const attempts = 2;

      const pingPromise = linkControlProtocol.ping(attempts, timeout);
      expect(sendPacketSpy).toBeCalledTimes(1);
      jest.advanceTimersByTime(timeout);
      expect(sendPacketSpy).toBeCalledTimes(attempts);
      jest.advanceTimersByTime(timeout);

      await expect(pingPromise).rejects.toThrowError('Ping timed out');
      expect(sendPacketSpy).toBeCalledTimes(attempts);
    });

    it('when reply delay exceeds timeout', () => {
      const attempts = 1;

      const pingPromise = linkControlProtocol.ping(attempts, timeout);
      jest.advanceTimersByTime(timeout);
      respondToPing();
      return expect(pingPromise).rejects.toThrowError('Ping timed out');
    });

    it('if layer goes down during ping', () => {
      const attempts = 1;
      const pingPromise = linkControlProtocol.ping(attempts, timeout);
      linkControlProtocol.down();
      return expect(pingPromise).rejects.toThrowError(
        'Ping failed: layer down',
      );
    });

    it('if response has wrong identifier', () => {
      const attempts = 1;

      let pingResolved = false;
      const pingPromise = linkControlProtocol.ping(attempts, timeout);
      void pingPromise.then(
        () => {
          pingResolved = true;
        },
        () => undefined,
      );

      const lastCallIndex = sendPacketSpy.mock.calls.length - 1;
      // eslint-disable-next-line
      const [packet]: [Buffer] = sendPacketSpy.mock.calls[lastCallIndex] as any;
      packet.writeUInt8(LCPCode.EchoReply);
      packet[1] += 1;
      socket.handlePacket(packet);

      expect(pingResolved).toEqual(false);

      jest.advanceTimersByTime(timeout);

      return expect(pingPromise).rejects.toThrowError('Ping timed out');
    });

    it('if response has wrong data', () => {
      const attempts = 1;

      let pingResolved = false;
      const pingPromise = linkControlProtocol.ping(attempts, timeout);
      void pingPromise.then(
        () => {
          pingResolved = true;
        },
        () => undefined,
      );

      const lastCallIndex = sendPacketSpy.mock.calls.length - 1;
      // eslint-disable-next-line
      const [packet]: [Buffer] = sendPacketSpy.mock.calls[lastCallIndex] as any;
      const identifier = packet.readUInt8(1);
      socket.handlePacket(
        LCPEncapsulation.build(
          LCPCode.EchoReply,
          identifier,
          encode('\0\x26\0\0\0\0bad reply bad reply bad reply.'),
        ),
      );

      expect(pingResolved).toEqual(false);

      jest.advanceTimersByTime(timeout);

      return expect(pingPromise).rejects.toThrowError('Ping timed out');
    });

    it('malformed echo reply', () => {
      const attempts = 1;
      const pingPromise = linkControlProtocol.ping(attempts, timeout);
      // Only three bytes of Magic-Number
      socket.handlePacket(encode('\x0a\0\0\x07\0\0\0'));
      jest.advanceTimersByTime(timeout);
      return expect(pingPromise).rejects.toThrowError('Ping timed out');
    });

    it('ping already in progress', () => {
      void linkControlProtocol.ping();
      return expect(linkControlProtocol.ping()).rejects.toThrowError(
        'Another ping is currently in progress',
      );
    });
  });

  describe('resolves', () => {
    it('simple', () => {
      const pingPromise = linkControlProtocol.ping();
      respondToPing();
      expect(sendPacketSpy).toBeCalledTimes(1);
      return expect(pingPromise).resolves.toBeUndefined();
    });

    it('one timeout before responding', async () => {
      const attempts = 2;

      let pingResolved = false;
      const pingPromise = linkControlProtocol.ping(attempts, timeout);
      void pingPromise.then(() => {
        pingResolved = true;
      });

      jest.advanceTimersByTime(timeout);
      expect(pingResolved).toEqual(false);
      expect(sendPacketSpy).toBeCalledTimes(attempts);

      respondToPing();
      await expect(pingPromise).resolves.toBeUndefined();
      expect(pingResolved).toEqual(true);
      expect(sendPacketSpy).toBeCalledTimes(attempts);
    });
  });

  it('successive pings use different identifiers', async () => {
    let pingPromise: Promise<void>;

    pingPromise = linkControlProtocol.ping();
    const identifierOne = respondToPing();
    await expect(pingPromise).resolves.toBeUndefined();

    pingPromise = linkControlProtocol.ping();
    const identifierTwo = respondToPing();
    await expect(pingPromise).resolves.toBeUndefined();

    expect(identifierOne).not.toEqual(identifierTwo);
  });

  it("unsolicited echo reply doesn't break anything", () => {
    socket.handlePacket(encode('\x0a\0\0\x08\0\0\0\0'));
  });
});
