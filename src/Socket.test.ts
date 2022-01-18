import Socket from './Socket';
import Transport from './transports';

let socket: Socket;
let transport: Transport;

const mtu = 1500;
const protocol = 1234;
const packet = Buffer.from('hello world!');

beforeEach(() => {
  transport = {
    openSocket: jest.fn(),
    unregisterSocket: jest.fn(),
    send: jest.fn(),
    down: jest.fn(),
    mtu,
  };

  socket = new Socket(transport, protocol);
});

it('receives data', () => {
  const receiveHandler = jest.fn();
  socket.on('data', receiveHandler);

  socket.onReceive(packet);
  expect(receiveHandler).toBeCalledWith(packet);
});

it('sends data', () => {
  socket.send(packet);
  expect(transport.send).toBeCalledWith(protocol, packet);
});

it('sending data throws if closed', () => {
  socket.close();
  expect(() => socket.send(packet)).toThrowError(
    'I/O operation on closed socket',
  );
});

it('closing emits event', () => {
  const closeHandler = jest.fn();
  socket.on('close', closeHandler);
  socket.close();
  expect(closeHandler).toBeCalledTimes(1);
});

it('closing marks socket closed', () => {
  socket.close();
  expect(socket.closed).toEqual(true);
});

it('closing an already closed socket does not emit a second event', () => {
  const closeHandler = jest.fn();
  socket.on('close', closeHandler);
  socket.close();
  expect(closeHandler).toBeCalledTimes(1);
  socket.close();
  expect(closeHandler).toBeCalledTimes(1);
});

it('passes through the transport MTU', () => {
  expect(socket.mtu).toEqual(mtu);
  // eslint-disable-next-line
  (transport as any).mtu -= 1;
  expect(socket.mtu).toEqual(mtu - 1);
});
