/** Shares one in-flight operation per key and only lets that exact promise clear itself. */
export class KeyedSingleFlight<Key> {
  private readonly flights = new Map<Key, Promise<unknown>>();

  run<Value>(key: Key, task: () => Promise<Value>): Promise<Value> {
    const existing = this.flights.get(key) as Promise<Value> | undefined;
    if (existing) return existing;
    let flight: Promise<Value>;
    flight = Promise.resolve().then(task).finally(() => {
      if (this.flights.get(key) === flight) this.flights.delete(key);
    });
    this.flights.set(key, flight);
    return flight;
  }
}
