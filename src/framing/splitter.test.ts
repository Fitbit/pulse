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

import { FrameSplitter } from './splitter';

async function runTestCase(
  inputs: string[],
  splitter = new FrameSplitter(),
): Promise<string[]> {
  const actualOutput: string[] = [];

  const closePromise = new Promise((resolve) => splitter.on('end', resolve));
  splitter.on('data', (data) =>
    actualOutput.push(Buffer.from(data as ArrayBuffer).toString('ascii')),
  );

  for (const input of inputs) splitter.write(input);
  splitter.end();

  await closePromise;
  return actualOutput;
}

it.each([
  [
    'basic',
    ['\x00abcdefg\x00foobar\x00asdf\x00'],
    ['abcdefg', 'foobar', 'asdf'],
  ],
  ['waits for sync', ['garbage data\x00frame 1\x00'], ['frame 1']],
  ['double flags', ['\x00abcd\x00\x00efgh\x00'], ['abcd', 'efgh']],
  ['multiple writes', ['\x00ab', 'cd\x00'], ['abcd']],
  ['lots of writes', '\x00abcd\x00ef'.split(''), ['abcd']],
])('%s', (_, inputs, expectedOutput) =>
  expect(runTestCase(inputs)).resolves.toEqual(expectedOutput),
);

it('max frame length', () =>
  expect(
    runTestCase(
      ['\x0012345\x00123456\x001234567\x001234\x0012345678\x00'],
      new FrameSplitter(6),
    ),
  ).resolves.toEqual(['12345', '123456', '1234']));
