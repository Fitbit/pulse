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
