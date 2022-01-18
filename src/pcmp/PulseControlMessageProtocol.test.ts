import PulseControlMessageProtocol from './PulseControlMessageProtocol';
import Transport from '../transports';

import { encode } from '../encodingUtil';

let transport: Transport;
let pcmp: PulseControlMessageProtocol;

beforeEach(() => {
  jest.useFakeTimers();
  transport = {
    unregisterSocket: jest.fn(),
    send: jest.fn(),
    openSocket: jest.fn(),
    down: jest.fn(),
    mtu: 0,
  };
  pcmp = new PulseControlMessageProtocol(transport);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('close', () => {
  beforeEach(() => {
    pcmp.close();
  });

  it('unregisters the socket', () => {
    expect(transport.unregisterSocket).toBeCalledTimes(1);
  });

  it('is idempotent', () => {
    pcmp.close();
    expect(transport.unregisterSocket).toBeCalledTimes(1);
  });
});

describe('ping', () => {
  describe('resolves', () => {
    it('simple', async () => {
      const pingPromise = pcmp.ping();
      pcmp.onReceive(encode('\x02'));
      await expect(pingPromise).resolves.toBeUndefined();
      expect(jest.getTimerCount()).toEqual(0);
    });

    it('succeeds after single retry', async () => {
      const attempts = 2;
      const timeout = 1000;
      const pingPromise = pcmp.ping(attempts, timeout);
      jest.advanceTimersByTime(timeout);
      pcmp.onReceive(encode('\x02'));
      await expect(pingPromise).resolves.toBeUndefined();
      expect(jest.getTimerCount()).toEqual(0);
    });

    it('succeeds after multiple retries', async () => {
      const attempts = 3;
      const timeout = 1000;
      const pingPromise = pcmp.ping(attempts, timeout);
      expect(transport.send).toBeCalledTimes(1);
      jest.advanceTimersByTime(timeout);
      expect(transport.send).toBeCalledTimes(2);
      jest.advanceTimersByTime(timeout);
      expect(transport.send).toBeCalledTimes(attempts);
      pcmp.onReceive(encode('\x02'));
      await expect(pingPromise).resolves.toBeUndefined();
      expect(jest.getTimerCount()).toEqual(0);
    });
  });

  describe('rejects', () => {
    it('on timeout after single attempt', async () => {
      const attempts = 1;
      const timeout = 1000;
      const pingPromise = pcmp.ping(attempts, timeout);
      jest.advanceTimersByTime(timeout);
      await expect(pingPromise).rejects.toThrow('Ping timed out');
      expect(jest.getTimerCount()).toEqual(0);
    });

    it('on timeout after multiple attempts', async () => {
      const attempts = 3;
      const timeout = 1000;
      const pingPromise = pcmp.ping(attempts, timeout);
      expect(transport.send).toBeCalledTimes(1);
      jest.advanceTimersByTime(timeout);
      expect(transport.send).toBeCalledTimes(2);
      jest.advanceTimersByTime(timeout);
      expect(transport.send).toBeCalledTimes(attempts);
      jest.advanceTimersByTime(timeout);
      await expect(pingPromise).rejects.toThrow('Ping timed out');
      expect(jest.getTimerCount()).toEqual(0);
    });

    it('if socket is closed', async () => {
      const pingPromise = pcmp.ping();
      pcmp.close();
      await expect(pingPromise).rejects.toThrow('Ping failed: socket closed');
      expect(jest.getTimerCount()).toEqual(0);
    });

    it('when attempts=0', () => {
      return expect(pcmp.ping(0)).rejects.toThrowError(
        'attempts must be positive',
      );
    });

    it('when attempts=-1', () => {
      return expect(pcmp.ping(-1)).rejects.toThrowError(
        'attempts must be positive',
      );
    });

    it('when timeout=0', () => {
      return expect(pcmp.ping(1, 0)).rejects.toThrowError(
        'timeout must be positive',
      );
    });

    it('when timeout=-1', () => {
      return expect(pcmp.ping(1, -1)).rejects.toThrowError(
        'timeout must be positive',
      );
    });

    it('ping already in progress', () => {
      void pcmp.ping();
      return expect(pcmp.ping()).rejects.toThrowError(
        'Another ping is currently in progress',
      );
    });
  });
});

it('send unknown code', () => {
  // eslint-disable-next-line
  (pcmp as any).sendUnknownCode(42);
  expect(transport.send).toBeCalledWith(1, encode('\x82\x2a'));
});

it('send echo request', () => {
  // eslint-disable-next-line
  (pcmp as any).sendEchoRequest(encode('abcdefg'));
  expect(transport.send).toBeCalledWith(1, encode('\x01abcdefg'));
});

it('send echo reply', () => {
  // eslint-disable-next-line
  (pcmp as any).sendEchoReply(encode('abcdefg'));
  expect(transport.send).toBeCalledWith(1, encode('\x02abcdefg'));
});

it('receieve an empty packet', () => {
  pcmp.onReceive(Buffer.alloc(0));
  expect(transport.send).not.toBeCalled();
});

it('recieve a message with an unknown code', () => {
  pcmp.onReceive(encode('\x00'));
  expect(transport.send).toBeCalledWith(1, encode('\x82\x00'));
});

it('recieve a message with malformed unknown code', () => {
  pcmp.onReceive(encode('\x82'));
  expect(transport.send).not.toBeCalled();
});

it('recieve a message with malformed unknown code', () => {
  pcmp.onReceive(encode('\x82\x00\x01'));
  expect(transport.send).not.toBeCalled();
});

it('receive a discard request', () => {
  pcmp.onReceive(encode('\x03'));
  expect(transport.send).not.toBeCalled();
});

it('receive a discard request with data', () => {
  pcmp.onReceive(encode('\x03asdfasdfasdf'));
  expect(transport.send).not.toBeCalled();
});

it('receieve an echo request', () => {
  pcmp.onReceive(encode('\x01'));
  expect(transport.send).toBeCalledWith(1, encode('\x02'));
});

it('receieve an echo request with data', () => {
  pcmp.onReceive(encode('\x01a'));
  expect(transport.send).toBeCalledWith(1, encode('\x02a'));
});

it('receive an echo reply', () => {
  pcmp.onReceive(encode('\x02'));
  expect(transport.send).not.toBeCalled();
});

it('receive an echo reply with data', () => {
  pcmp.onReceive(encode('\x02abc'));
  expect(transport.send).not.toBeCalled();
});

it('receive port closed without handler', () => {
  pcmp.onReceive(encode('\x81\xab\xcd'));
  expect(transport.send).not.toBeCalled();
});

it('receive port closed with handler', () => {
  const closedHandler = jest.fn();
  pcmp.on('portClosed', closedHandler);
  pcmp.onReceive(encode('\x81\xab\xcd'));
  expect(closedHandler).toBeCalledWith(0xabcd);
});

it('receive malformed port closed', () => {
  const closedHandler = jest.fn();
  pcmp.on('portClosed', closedHandler);
  pcmp.onReceive(encode('\x81\xab'));
  expect(closedHandler).not.toBeCalled();
});

it('receive malformed port closed', () => {
  const closedHandler = jest.fn();
  pcmp.on('portClosed', closedHandler);
  pcmp.onReceive(encode('\x81\xab\xcd\xef'));
  expect(closedHandler).not.toBeCalled();
});

it('cannot be used as a socket', () => {
  expect(() => pcmp.send(Buffer.alloc(1))).toThrowError(
    'PCMP cannot be used as a socket',
  );
});

it('ignores a received malformed UnknownCode packet', () => {
  expect(() => pcmp.onReceive(encode('\x82'))).not.toThrowError();
});

it('ignores a received UnknownCode packet', () => {
  expect(() => pcmp.onReceive(encode('\x82\xff'))).not.toThrowError();
});
