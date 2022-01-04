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
