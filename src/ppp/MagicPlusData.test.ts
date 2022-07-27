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

import MagicPlusData from './MagicPlusData';
import { decode, encode } from '../encodingUtil';

describe('parse', () => {
  it.each([
    ['with data', '\xab\xcd\xef\x01datadata', [0xabcdef01, 'datadata']],
    ['without data', '\xfe\xed\xfa\xce', [0xfeedface, '']],
  ])('%s', (_, input, [magicNumber, data]) => {
    const parsed = MagicPlusData.parse(encode(input));
    expect(parsed.magicNumber).toEqual(magicNumber);
    expect(decode(parsed.data)).toEqual(data);
  });

  it('truncated packet throws', () => {
    expect(() => MagicPlusData.parse(encode('abc'))).toThrow();
  });
});

describe('build', () => {
  it.each<[string, [number, Buffer], string]>([
    ['without data', [0x12345678, Buffer.alloc(0)], '\x12\x34\x56\x78'],
    ['with data', [0xabcdef01, encode('foobar')], '\xab\xcd\xef\x01foobar'],
  ])('%s', (_, inputArgs, output) => {
    expect(decode(MagicPlusData.build(...inputArgs))).toEqual(output);
  });

  it('default to no data', () => {
    expect(decode(MagicPlusData.build(0x12345678))).toEqual('\x12\x34\x56\x78');
  });
});
