import LCPEncapsulation from './LCPEncapsulation';
import { decode, encode } from '../encodingUtil';

describe('parse', () => {
  it('no padding', () => {
    const parsed = LCPEncapsulation.parse(encode('\x01\xab\x00\x0aabcdef'));
    expect(parsed.code).toEqual(1);
    expect(parsed.identifier).toEqual(0xab);
    expect(decode(parsed.data)).toEqual('abcdef');
    expect(parsed.padding).toHaveLength(0);
  });

  it('empty data', () => {
    const parsed = LCPEncapsulation.parse(encode('\x03\x01\x00\x04'));
    expect(parsed.code).toEqual(3);
    expect(parsed.identifier).toEqual(1);
    expect(decode(parsed.data)).toEqual('');
    expect(decode(parsed.padding)).toEqual('');
  });

  it('padding', () => {
    const parsed = LCPEncapsulation.parse(
      encode('\x01\xab\x00\x0aabcdefpadding'),
    );
    expect(decode(parsed.data)).toEqual('abcdef');
    expect(decode(parsed.padding)).toEqual('padding');
  });

  it.each([
    [
      'truncated packet (length field exceeds message size)',
      '\x01\xab\x00\x0aabcde',
    ],
    ['truncated packet (below min size)', ''],
    ['bogus length', '\x01\xbc\x00\x03'],
  ])('%s throws', (_, input) => {
    expect(() => LCPEncapsulation.parse(encode(input))).toThrowError();
  });
});

describe('build', () => {
  it.each<[string, [number, number, Buffer | undefined], string]>([
    ['without data (explicit)', [1, 0xfe, Buffer.alloc(0)], '\x01\xfe\x00\x04'],
    ['without data (default)', [1, 0xfe, undefined], '\x01\xfe\x00\x04'],
    [
      'with data',
      [3, 0x2a, encode('Hello, world!')],
      '\x03\x2a\x00\x11Hello, world!',
    ],
  ])('%s', (_, inputArgs, output) => {
    expect(decode(LCPEncapsulation.build(...inputArgs))).toEqual(output);
  });
});
