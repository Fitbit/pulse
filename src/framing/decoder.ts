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
