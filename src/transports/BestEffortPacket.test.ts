import BestEffortPacket from './BestEffortPacket';
import { decode, encode } from '../encodingUtil';

it('parse', () => {
  const packet = BestEffortPacket.parse(
    encode('\xbe\xef\x00\x12Data goes here'),
  );
  expect(packet.port).toEqual(0xbeef);
  expect(packet.information).toEqual(encode('Data goes here'));
  expect(packet.padding).toEqual(encode(''));
});

it('parse with padding', () => {
  const packet = BestEffortPacket.parse(
    encode('\xbe\xef\x00\x12Data goes herepadding'),
  );
  expect(packet.port).toEqual(0xbeef);
  expect(packet.information).toEqual(encode('Data goes here'));
  expect(packet.padding).toEqual(encode('padding'));
});

it.each([
  ['truncated packet - min size', Buffer.alloc(3)],
  [
    'truncated packet - length extends beyond buffer',
    encode('\xca\xfe\x00\x05'),
  ],
])('throws: %s', (_, input) => {
  expect(() => BestEffortPacket.parse(input)).toThrowError(
    'Packet truncated or corrupt',
  );
});

it('build', () => {
  expect(
    decode(BestEffortPacket.build(0xcafe, encode('Data goes here'))),
  ).toEqual('\xca\xfe\x00\x12Data goes here');
});
