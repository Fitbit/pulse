import PCMPPacket from './PCMPPacket';
import { decode, encode } from '../encodingUtil';

describe('parse', () => {
  it.each([
    ['with data', '\x01datadata', [1, 'datadata']],
    ['without data', '\x02', [2, '']],
  ])('%s', (_, input, [code, information]) => {
    const parsed = PCMPPacket.parse(encode(input));
    expect(parsed.code).toEqual(code);
    expect(decode(parsed.information)).toEqual(information);
  });

  it('too short packet throws', () => {
    expect(() => PCMPPacket.parse(encode(''))).toThrow();
  });
});

describe('build', () => {
  it.each<[string, [number, Buffer], string]>([
    ['without data', [1, Buffer.alloc(0)], '\x01'],
    ['with data', [2, encode('foobar')], '\x02foobar'],
  ])('%s', (_, inputArgs, output) => {
    expect(decode(PCMPPacket.build(...inputArgs))).toEqual(output);
  });

  it('default to no data', () => {
    expect(decode(PCMPPacket.build(3))).toEqual('\x03');
  });
});
