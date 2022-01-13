import OptionList, { Option } from './OptionList';
import { decode, encode } from '../encodingUtil';

describe('parse', () => {
  it.each([
    ['no options', '', []],
    ['one empty option', '\xaa\x02', [[0xaa, '']]],
    ['one option with length', '\xab\x07Data!', [[0xab, 'Data!']]],
    [
      'multiple options, empty first',
      '\x22\x02\x23\x03a\x21\x04ab',
      [
        [0x22, ''],
        [0x23, 'a'],
        [0x21, 'ab'],
      ],
    ],
    [
      'multiple options, dataful first',
      '\x31\x08option\x32\x02',
      [
        [0x31, 'option'],
        [0x32, ''],
      ],
    ],
  ])('%s', (_, input, outputs) => {
    const { options } = OptionList.parse(encode(input));

    expect(options).toHaveLength(outputs.length);

    for (let i = 0; i < outputs.length; i++) {
      const [type, data] = outputs[i];
      expect(options[i].type).toEqual(type);
      expect(decode(options[i].data)).toEqual(data);
    }
  });

  it.each([
    ['too short', '\x41\x01'],
    ['malformed option', '\x0a\x02\x0b\x01\x0c\x03a'],
    ['truncated terminal option', '\x61\x02\x62\x03a\x63\x0ccandleja'],
  ])('throws: %s', (_, input) => {
    expect(() => OptionList.parse(encode(input))).toThrow();
  });

  it('throws: parsing a single option below min size', () => {
    expect(() => Option.parse(encode(''))).toThrow();
  });
});

describe('build', () => {
  it.each<[string, [type: number, data: string][], string]>([
    ['no options', [], ''],
    ['one empty option', [[0xaa, '']], '\xaa\x02'],
    ['one option with data', [[0xbb, 'Data!']], '\xbb\x07Data!'],
    [
      'two options',
      [
        [0xcc, 'foo'],
        [0xdd, 'xyzzy'],
      ],
      '\xcc\x05foo\xdd\x07xyzzy',
    ],
  ])('%s', (_, input, output) => {
    expect(
      decode(
        OptionList.build(input.map(([type, data]) => [type, encode(data)])),
      ),
    ).toEqual(output);
  });

  it('default no data', () => {
    expect(decode(OptionList.build([[0xaa]]))).toEqual('\xaa\x02');
  });
});
