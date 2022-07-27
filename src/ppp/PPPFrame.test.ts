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

import PPPFrame from './PPPFrame';
import { decode, encode } from '../encodingUtil';

describe('parse', () => {
  it('simple', () => {
    const frame = PPPFrame.parse(encode('\xc0\x21Information'));
    expect(frame.protocol).toEqual(0xc021);
    expect(decode(frame.information)).toEqual('Information');
  });

  it('empty information', () => {
    const frame = PPPFrame.parse(encode('\xc0\x21'));
    expect(frame.protocol).toEqual(0xc021);
    expect(decode(frame.information)).toEqual('');
  });

  it('empty frame throws', () =>
    expect(() => PPPFrame.parse(Buffer.alloc(0))).toThrow(
      'Datagram too short',
    ));

  it('too short frame throws', () =>
    expect(() => PPPFrame.parse(encode('\x21'))).toThrow('Datagram too short'));
});

describe('build', () => {
  it('encapsulates a frame', () => {
    expect(decode(PPPFrame.build(0xc021, encode('Information')))).toEqual(
      '\xc0\x21Information',
    );
  });
});
