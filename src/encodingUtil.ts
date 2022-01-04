// ASCII drops the 8th bit
export const encode = (input: string): Buffer => Buffer.from(input, 'latin1');

export const decode = (input: Buffer): string =>
  Buffer.from(input).toString('latin1');
