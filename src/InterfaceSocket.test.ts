import Interface from './Interface';
import InterfaceSocket from './InterfaceSocket';

jest.mock('./Interface');

let intf: Interface;
let intfSocket: InterfaceSocket;

beforeEach(() => {
  intf = new Interface();
  intfSocket = new InterfaceSocket(intf, 0xf2f1);
});

it('is not closed after instanciation', () => {
  expect(intfSocket.closed).toEqual(false);
});

it('sends data', () => {
  const data = Buffer.from('data');
  intfSocket.send(data);
  expect(intf.sendPacket).toBeCalledWith(0xf2f1, data);
});

it('marks as close once closed', () => {
  intfSocket.close();
  expect(intfSocket.closed).toEqual(true);
});

it('unregisters socket from interface upon close', () => {
  intfSocket.close();
  expect(intf.unregisterSocket).toBeCalledWith(0xf2f1);
});

it('calls close handler on close', () => {
  const closeHandler = jest.fn();
  intfSocket.once('close', closeHandler);
  intfSocket.close();
  expect(closeHandler).toBeCalledTimes(1);
});

it('throws when sending after closed', () => {
  intfSocket.close();
  expect(() => intfSocket.send(Buffer.from('data'))).toThrowError(
    'I/O operation on closed socket',
  );
});

it('handles a packet', () => {
  const dataHandler = jest.fn();
  const packet = Buffer.from('data');
  intfSocket.once('data', dataHandler);
  intfSocket.handlePacket(packet);
  expect(dataHandler).toBeCalledWith(packet);
});

it("doesn't emit event for packet if closed", () => {
  const dataHandler = jest.fn();
  intfSocket.once('data', dataHandler);
  intfSocket.close();
  intfSocket.handlePacket(Buffer.from('data'));
  expect(dataHandler).not.toBeCalled();
});

it('close() is idempotent', () => {
  const closeHandler = jest.fn();
  intfSocket.once('close', closeHandler);
  intfSocket.close();
  intfSocket.close();
  expect(closeHandler).toBeCalledTimes(1);
  expect(intf.unregisterSocket).toBeCalledTimes(1);
});
