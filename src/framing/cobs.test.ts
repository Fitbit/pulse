import * as cobs from './cobs';

const zeroTo255 = Array.from(Array(256).keys());

const testCases = [
  [[0], [1, 1]],
  [
    [0, 0],
    [1, 1, 1],
  ],
  [
    [11, 22, 0, 33],
    [3, 11, 22, 2, 33],
  ],
  [
    [11, 22, 33, 44],
    [5, 11, 22, 33, 44],
  ],
  [
    [11, 0, 0, 0],
    [2, 11, 1, 1, 1],
  ],
  [zeroTo255.slice(1, 255), [255, ...zeroTo255.slice(1, 255)]],
  [zeroTo255.slice(0, 255), [1, 255, ...zeroTo255.slice(1, 255)]],
  [zeroTo255.slice(1), [255, ...zeroTo255.slice(1, 255), 2, 255]],
  [
    [...zeroTo255.slice(2), 0],
    [255, ...zeroTo255.slice(2, 256), 1, 1],
  ],
  [
    [...zeroTo255.slice(3), 0, 1],
    [254, ...zeroTo255.slice(3, 256), 2, 1],
  ],
];

it.each(testCases)('encodes: %s', (decoded, encoded) => {
  expect(Array.from(cobs.encode(Buffer.from(decoded)).values())).toEqual(
    encoded,
  );
});

it.each(testCases)('decodes: %s', (decoded, encoded) => {
  expect(Array.from(cobs.decode(Buffer.from(encoded)).values())).toEqual(
    decoded,
  );
});

it.each([
  [[0]], // unexpected 0
  [[5, 1, 2, 3]], // flag in 5 bytes, but only 3 more
  [[5, 1, 2, 3, 4, 0]], // flag in 5 bytes, but zero at next flag value
  [[5, 1, 2, 0, 4]], // flag in 5 bytes, but only 4 more and unexpected 0
])('decode error thrown: %s', (encoded) => {
  expect(() => cobs.decode(Buffer.from(encoded))).toThrowError();
});
