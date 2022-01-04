const flag = 0xff;

export function encode(input: Buffer): Buffer {
  const maxOverhead = Math.ceil(input.byteLength / (flag - 1));
  const output = Buffer.alloc(input.byteLength + maxOverhead);

  let inputPtr = 0;
  let outputPtr = 1;
  let codePtr = 0;
  let code = 1;

  while (inputPtr < input.byteLength) {
    const byte = input[inputPtr++];

    if (byte !== 0) {
      output[outputPtr++] = byte;
      code++;
    }

    if (byte === 0 || code === flag) {
      output[codePtr] = code;
      code = 1;
      codePtr = outputPtr;

      if (byte === 0 || inputPtr < input.byteLength) {
        outputPtr++;
      }
    }
  }

  output[codePtr] = code;
  return output.slice(0, outputPtr);
}

export function decode(input: Buffer): Buffer {
  const output = Buffer.alloc(input.byteLength);

  let inputPtr = 0;
  let outputPtr = 0;
  let code = flag;
  let block = 0;

  while (inputPtr < input.byteLength) {
    if (input[inputPtr] === 0) {
      throw new Error(`Unexpected zero in COBS data at index ${inputPtr}`);
    }

    if (block !== 0) {
      output[outputPtr++] = input[inputPtr++];
    } else {
      if (code != flag) {
        output[outputPtr++] = 0;
      }

      block = code = input[inputPtr++];
    }

    block--;
  }

  if (block > 0) {
    throw new Error(`End of COBS data but ${block} more bytes expected`);
  }

  return output.slice(0, outputPtr);
}
