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

import ControlProtocol, {
  ControlCode,
  ControlProtocolState,
} from './ControlProtocol';
import Interface from '../Interface';
import InterfaceSocket from '../InterfaceSocket';
import LCPEncapsulation from './LCPEncapsulation';
import { encode } from '../encodingUtil';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('state machine', () => {
  let controlProtocol: ControlProtocol;
  let socket: InterfaceSocket;

  let layerStartedSpy: jest.SpyInstance;
  let layerUpSpy: jest.SpyInstance;
  let layerDownSpy: jest.SpyInstance;
  let layerFinishedSpy: jest.SpyInstance;
  let sendPacketSpy: jest.SpyInstance;
  let startRestartTimerSpy: jest.SpyInstance;

  function controlProtocolSpy(method: string): jest.SpyInstance {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return jest.spyOn(controlProtocol as any, method);
  }

  function assertPacketSent(
    code: number,
    identifier: number,
    body = Buffer.alloc(0),
  ): void {
    const packet = LCPEncapsulation.build(code, identifier, body);
    expect(sendPacketSpy).toBeCalledWith(packet);
    sendPacketSpy.mockClear();
  }

  function assertState(state: ControlProtocolState): void {
    expect(
      (controlProtocol as unknown as { state: ControlProtocolState }).state,
    ).toEqual(state);
  }

  beforeEach(() => {
    controlProtocol = new ControlProtocol('PPP');
    socket = new InterfaceSocket(new Interface(), 0xf00d);

    layerStartedSpy = controlProtocolSpy('thisLayerStarted');
    layerUpSpy = controlProtocolSpy('thisLayerUp');
    layerDownSpy = controlProtocolSpy('thisLayerDown');
    layerFinishedSpy = controlProtocolSpy('thisLayerFinished');
    sendPacketSpy = controlProtocolSpy('sendPacket');
    startRestartTimerSpy = controlProtocolSpy('startRestartTimer');
  });

  it('open() whilst down', () => {
    controlProtocol.open();
    expect(layerStartedSpy).toBeCalledTimes(1);
    expect(layerUpSpy).not.toBeCalled();
    expect(layerDownSpy).not.toBeCalled();
    expect(layerFinishedSpy).not.toBeCalled();
  });

  it('up() whilst closed', () => {
    controlProtocol.up(socket);
    expect(layerStartedSpy).not.toBeCalled();
    expect(layerUpSpy).not.toBeCalled();
    expect(layerDownSpy).not.toBeCalled();
    expect(layerFinishedSpy).not.toBeCalled();
  });

  function handshake() {
    controlProtocol.open();
    controlProtocol.up(socket);
    assertPacketSent(ControlCode.ConfigureRequest, 0);
    socket.handlePacket(LCPEncapsulation.build(ControlCode.ConfigureAck, 0));
    socket.handlePacket(
      LCPEncapsulation.build(ControlCode.ConfigureRequest, 17),
    );
    assertPacketSent(ControlCode.ConfigureAck, 17);
    assertState(ControlProtocolState.Opened);
  }

  it('trivial handshake', handshake);

  it('terminate cleanly', () => {
    handshake();
    controlProtocol.close();
    expect(layerDownSpy).toBeCalledTimes(1);
    assertPacketSent(ControlCode.TerminateRequest, 42);
  });

  it('remote terminate', () => {
    handshake();
    socket.handlePacket(
      LCPEncapsulation.build(ControlCode.TerminateRequest, 42),
    );
    assertPacketSent(ControlCode.TerminateAck, 42);
    expect(layerDownSpy).toBeCalled();
    expect(startRestartTimerSpy).toBeCalled();
    expect(layerFinishedSpy).not.toBeCalled();

    // mimicing the Python test by manually calling this
    // in practice the timer will be stopped by the transition to the stopped state
    // eslint-disable-next-line
    (controlProtocol as any).restartTimerExpired();
    jest.runAllTimers();

    expect(layerFinishedSpy).toBeCalled();
    assertState(ControlProtocolState.Stopped);
  });

  it('remote rejects configure request code', () => {
    controlProtocol.open();
    controlProtocol.up(socket);
    assertPacketSent(ControlCode.ConfigureRequest, 0);

    socket.handlePacket(
      LCPEncapsulation.build(
        ControlCode.CodeReject,
        3,
        LCPEncapsulation.build(ControlCode.ConfigureRequest, 0),
      ),
    );
    assertState(ControlProtocolState.Stopped);
    expect(layerFinishedSpy).toBeCalledTimes(1);
  });

  it('receieve extended code', () => {
    const unknownCodeSpy = controlProtocolSpy('handleUnknownCode');
    handshake();

    const encodedData = encode('Life, the universe and everything');
    socket.handlePacket(
      LCPEncapsulation.build(42 as ControlCode, 11, encodedData),
    );
    expect(unknownCodeSpy).toBeCalledWith(42, 11, encodedData);
  });

  it('receive unimplemented code', () => {
    handshake();
    const packet = LCPEncapsulation.build(0x55, 0);
    socket.handlePacket(packet);
    assertPacketSent(ControlCode.CodeReject, 0, packet);
  });

  it('code reject truncates rejected packet', () => {
    handshake();
    const packet = LCPEncapsulation.build(
      0xaa,
      0x20,
      Buffer.alloc(1496).fill('a'),
    );
    socket.handlePacket(packet);
    assertPacketSent(
      ControlCode.CodeReject,
      0,
      packet.slice(0, packet.length - 3),
    );
  });

  it('code reject identifier changes', () => {
    handshake();
    const packet = LCPEncapsulation.build(0xaa, 0);
    socket.handlePacket(packet);
    assertPacketSent(ControlCode.CodeReject, 0, packet);
    socket.handlePacket(packet);
    assertPacketSent(ControlCode.CodeReject, 1, packet);
  });

  // TODO additional tests not present in Py
  // Local events: up, down, open, close
  // Option negotiation: reject, nak
  // Exceptional situations: catastrophic code-reject
  // Restart negotiation after opening
  // Remote Terminate-Req, -Ack at various points in the lifecycle
  // Negotiation infinite loop
  // Local side gives up on negotiation
  // Corrupt packets received
});
