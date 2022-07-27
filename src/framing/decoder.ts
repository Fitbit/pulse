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

import * as stream from 'stream';

import { buf as crc32 } from 'crc-32';
import * as cobs from './cobs';
import { flag } from '.';

const crc32Residue = crc32(new Uint8Array(4));

export function decodeTransparency(data: Buffer): Buffer {
  if (data.indexOf(flag) !== -1) {
    throw new Error('Flag byte in encoded frame');
  }
  return cobs.decode(data);
}

export function stripFCS(data: Buffer): Buffer {
  if (data.length <= 4) {
    throw new Error('Frame too short');
  }

  if (crc32(data) != crc32Residue) {
    throw new Error('FCS check failure');
  }

  return data.slice(0, data.length - 4);
}

export class FrameDecoder extends stream.Transform {
  /*
  Takes an object stream with each object comprising a buffer mapping to a single frame,
  and emits a corresponding decoded frame (FCS checked, transparency removed)
  */

  constructor() {
    super({ readableObjectMode: true, allowHalfOpen: false });
  }

  _transform(
    chunk: Buffer,
    _: string,
    callback: (err?: Error | null, data?: Buffer) => void,
  ): void {
    try {
      callback(null, stripFCS(decodeTransparency(chunk)));
    } catch (ex) {
      callback(ex as Error);
    }
  }
}
