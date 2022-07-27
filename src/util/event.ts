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

export default class Event {
  flag!: Promise<boolean>;
  flagResolve!: (val: true) => void;
  timers: NodeJS.Timer[] = [];

  constructor() {
    this.clear();
  }

  clear(): void {
    this.flag = new Promise((resolve) => {
      this.flagResolve = resolve;
    });
  }

  set(): void {
    this.timers.map(clearTimeout);
    this.timers = [];
    if (this.flagResolve) this.flagResolve(true);
  }

  wait(timeout?: number): Promise<boolean> {
    if (timeout === undefined) return this.flag;

    return Promise.race([
      this.flag,
      new Promise<boolean>((resolve) =>
        this.timers.push(setTimeout(() => resolve(false), timeout)),
      ),
    ]);
  }
}
