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

const flag = 0xff;

export function encode(input: Buffer): Buffer {
  const maxOverhead = Math.ceil(input.byteLength / (flag - 1));
  const output = Buffer.alloc(input.byteLength + maxOverhead);

  let inputPtr = 0;
  let outputPtr = 1;
  let codePtr = 0;
  let code = 1;

  while (inputPtr < input.byteLength) {
    const byte = input[inputPtr++];

    if (byte !== 0) {
      output[outputPtr++] = byte;
      code++;
    }

    if (byte === 0 || code === flag) {
      output[codePtr] = code;
      code = 1;
      codePtr = outputPtr;

      if (byte === 0 || inputPtr < input.byteLength) {
        outputPtr++;
      }
    }
  }

  output[codePtr] = code;
  return output.slice(0, outputPtr);
}

export function decode(input: Buffer): Buffer {
  const output = Buffer.alloc(input.byteLength);

  let inputPtr = 0;
  let outputPtr = 0;
  let code = flag;
  let block = 0;

  while (inputPtr < input.byteLength) {
    if (input[inputPtr] === 0) {
      throw new Error(`Unexpected zero in COBS data at index ${inputPtr}`);
    }

    if (block !== 0) {
      output[outputPtr++] = input[inputPtr++];
    } else {
      if (code != flag) {
        output[outputPtr++] = 0;
      }

      block = code = input[inputPtr++];
    }

    block--;
  }

  if (block > 0) {
    throw new Error(`End of COBS data but ${block} more bytes expected`);
  }

  return output.slice(0, outputPtr);
}
