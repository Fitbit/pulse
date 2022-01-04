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
