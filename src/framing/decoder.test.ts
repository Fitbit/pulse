import * as decoder from './decoder';
import { decode, encode } from '../encodingUtil';

describe('decodeTransparency', () => {
  it.each([
    ['simple', '\x06abcde', 'abcde'],
    ['escaped flag', '\x03QU\x04ACK', 'QU\0ACK'],
  ])('%s', (_, input, output) => {
    expect(decode(decoder.decodeTransparency(encode(input)))).toEqual(output);
  });

  it.each([
    ['Flag byte in encoded frame', '\x06ab\x00de'],
    ['End of COBS data but 6 more bytes expected', '\x0aabc'], // truncated COBS
  ])('%s: throws', (error, input) =>
    expect(() => decoder.decodeTransparency(encode(input))).toThrow(error),
  );
});

describe('stripFCS', () => {
  it.each([
    ['Frame too short', 'abcd'],
    ['FCS check failure', 'abce\x11\xcd\x82\xed'], // frame corrupted
    ['FCS check failure', 'abcd\x13\xcd\x82\xed'], // FCS corrupted
  ])('%s: throws', (error, input) =>
    expect(() => decoder.stripFCS(encode(input))).toThrow(error),
  );

  it('simple', () =>
    expect(decoder.stripFCS(encode('abcd\x11\xcd\x82\xed'))).toEqual(
      encode('abcd'),
    ));
});

describe('FrameDecoder', () => {
  let frameDecoder: decoder.FrameDecoder;

  beforeEach(() => {
    frameDecoder = new decoder.FrameDecoder();
  });

  it('decodes a frame', async () => {
    const encodedData = new Promise<string>((resolve) =>
      frameDecoder.on('data', (chunk: Buffer) => {
        resolve(decode(chunk));
      }),
    );
    frameDecoder.write(encode('\x02Q\x09UACK\x48\xe6\xc1\xc1'));
    return expect(encodedData).resolves.toEqual('Q\0UACK');
  });

  it('emits an error if decoding fails', () => {
    const errorPromise = new Promise((_, reject) =>
      frameDecoder.on('error', reject),
    );
    frameDecoder.write(encode('\x09abcd\x13\xcd\x82\xed'));
    return expect(errorPromise).rejects.toThrowError('FCS check failure');
  });
});
