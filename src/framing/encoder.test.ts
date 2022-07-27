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

import * as encoder from './encoder';
import { decode, encode } from '../encodingUtil';

describe('FrameEncoder', () => {
  let frameEncoder: encoder.FrameEncoder;

  beforeEach(() => {
    frameEncoder = new encoder.FrameEncoder();
  });

  it.each([
    ['empty frame', '', '\x00\x01\x01\x01\x01\x01\x00'],
    ['simple', 'abcdefg', '\x00\x0cabcdefg\xa6\x6a\x2a\x31\x00'],
    [
      'flag in data',
      'QU\0ACK',
      '\x00\x03\x51\x55\x08\x41\x43\x4b\x63\x59\xe1\xcd\x00',
    ],
    ['flag in FCS', 'ae', '\x00\x06ae\xce\xdd\xe7\x01\x00'], // crc32('ae') contains 0x00 hex (flag)
  ])('encodes %s', async (_, input, output) => {
    const encodedData = new Promise<string>((resolve) =>
      frameEncoder.on('data', (chunk: Buffer) => {
        resolve(decode(chunk));
      }),
    );
    frameEncoder.write(encode(input));
    return expect(encodedData).resolves.toEqual(output);
  });
});
