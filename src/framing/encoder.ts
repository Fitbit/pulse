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

export function encode(data: Buffer): Buffer {
  const fcs = Buffer.alloc(4);
  fcs.writeInt32LE(crc32(data));

  const encoded = cobs.encode(Buffer.concat([data, fcs]));
  const flagBytes = new Uint8Array([flag]);

  return Buffer.concat([flagBytes, encoded, flagBytes]);
}

export class FrameEncoder extends stream.Transform {
  /*
  Takes an object stream with each object comprising a buffer with data to be framed.
  It is output with COBS encoding and FCS appended.
  */

  constructor() {
    super({ writableObjectMode: true, allowHalfOpen: false });
  }

  _transform(
    chunk: Buffer,
    _: string,
    callback: (err?: Error | null, data?: Buffer) => void,
  ): void {
    try {
      callback(null, encode(chunk));
    } catch (ex) {
      /* istanbul ignore next */
      callback(ex as Error);
    }
  }
}
