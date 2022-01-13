export default class Event {
  flag!: Promise<boolean>;
  flagResolve!: (val: true) => void;

  constructor() {
    this.clear();
  }

  clear(): void {
    this.flag = new Promise((resolve) => {
      this.flagResolve = resolve;
    });
  }

  set(): void {
    if (this.flagResolve) this.flagResolve(true);
  }

  wait(timeout?: number): Promise<boolean> {
    if (timeout === undefined) return this.flag;

    return Promise.race([
      this.flag,
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), timeout),
      ),
    ]);
  }
}
