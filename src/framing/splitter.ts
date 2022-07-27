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

import { flag } from '.';
export class FrameSplitter extends stream.Transform {
  /*
  Takes a byte stream and partitions it into frames (object mode stream output).

  Empty frames (two consecutive flag bytes) are silently discarded.
  No transparency conversion is applied to the contents of the frames.
  */
  constructor(private maxFrameLength?: number) {
    super({
      readableObjectMode: true,
      writableObjectMode: false,
    });
  }

  private waitingForSync = true;
  private frame: number[] = [];

  _write(chunk: Buffer, _: string, done: () => void): void {
    for (const byte of chunk.values()) {
      if (this.waitingForSync) {
        if (byte === flag) {
          this.waitingForSync = false;
        }
      } else {
        if (byte === flag) {
          if (this.frame.length > 0) {
            this.push(new Uint8Array(this.frame));
            this.frame = [];
          }
        } else {
          if (
            this.maxFrameLength === undefined ||
            this.frame.length < this.maxFrameLength
          ) {
            this.frame.push(byte);
          } else {
            this.frame = [];
            this.waitingForSync = true;
          }
        }
      }
    }
    done();
  }
}
