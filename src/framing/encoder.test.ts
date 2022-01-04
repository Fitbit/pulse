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
