/**
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export default class MagicPlusData {
  private constructor(public magicNumber: number, public data: Buffer) {}

  static headerSize = 4;

  static parse(buf: Buffer): MagicPlusData {
    if (buf.byteLength < MagicPlusData.headerSize) {
      throw new Error('Magic number less than minimum possible byte length');
    }

    let offset = 0;
    const magicNumber = buf.readUInt32BE(offset);
    offset += MagicPlusData.headerSize;

    const data = buf.slice(offset);

    return new MagicPlusData(magicNumber, data);
  }

  static build(magicNumber: number, data = Buffer.alloc(0)): Buffer {
    const buf = Buffer.alloc(data.byteLength + MagicPlusData.headerSize);
    let offset = 0;

    buf.writeUInt32BE(magicNumber, offset);
    offset += MagicPlusData.headerSize;

    data.copy(buf, offset);

    return buf;
  }
}
