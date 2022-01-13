import PPPFrame from './PPPFrame';
import { decode, encode } from '../encodingUtil';

describe('parse', () => {
  it('simple', () => {
    const frame = PPPFrame.parse(encode('\xc0\x21Information'));
    expect(frame.protocol).toEqual(0xc021);
    expect(decode(frame.information)).toEqual('Information');
  });

  it('empty information', () => {
    const frame = PPPFrame.parse(encode('\xc0\x21'));
    expect(frame.protocol).toEqual(0xc021);
    expect(decode(frame.information)).toEqual('');
  });

  it('empty frame throws', () =>
    expect(() => PPPFrame.parse(Buffer.alloc(0))).toThrow(
      'Datagram too short',
    ));

  it('too short frame throws', () =>
    expect(() => PPPFrame.parse(encode('\x21'))).toThrow('Datagram too short'));
});

describe('build', () => {
  it('encapsulates a frame', () => {
    expect(decode(PPPFrame.build(0xc021, encode('Information')))).toEqual(
      '\xc0\x21Information',
    );
  });
});
