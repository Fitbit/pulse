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

import Interface from '../Interface';
import ControlProtocol from '../ppp/ControlProtocol';

export default class TransportControlProtocol extends ControlProtocol {
  constructor(
    private intf: Interface,
    private transport: {
      thisLayerUp: () => void;
      thisLayerDown: () => void;
    },
    private ncpProtocol: number,
    displayName: string,
  ) {
    super(displayName);
  }

  public up(): void {
    super.up(this.intf.connect(this.ncpProtocol));
  }

  protected thisLayerUp(): void {
    this.transport.thisLayerUp();
  }

  protected thisLayerDown(): void {
    this.transport.thisLayerDown();
  }
}
