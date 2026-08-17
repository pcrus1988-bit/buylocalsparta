import type { OutboxEvent, OutboxStore } from "../common/outbox.ts";

export type BackgroundJobHandler = (event: OutboxEvent, now: number) => void | Promise<void>;

export type WorkerRunResult = Readonly<{
  claimed: number;
  processed: number;
  retried: number;
  deadLettered: number;
}>;

export class BackgroundWorker {
  readonly #outbox: OutboxStore;
  readonly #handlers = new Map<string, BackgroundJobHandler[]>();
  readonly #maxAttempts: number;
  readonly #baseRetryMs: number;
  readonly #workerId: string;
  readonly #leaseMs: number;

  constructor(input: { outbox: OutboxStore; workerId?: string; maxAttempts?: number; baseRetryMs?: number; leaseMs?: number }) {
    this.#outbox = input.outbox;
    this.#workerId = input.workerId ?? `worker-${process.pid}`;
    this.#maxAttempts = input.maxAttempts ?? 5;
    this.#baseRetryMs = input.baseRetryMs ?? 5_000;
    this.#leaseMs = input.leaseMs ?? 30_000;
    if (!this.#workerId.trim()) throw new Error("workerId is required");
    if (!Number.isSafeInteger(this.#maxAttempts) || this.#maxAttempts <= 0) throw new Error("maxAttempts must be a positive integer");
    if (!Number.isSafeInteger(this.#baseRetryMs) || this.#baseRetryMs < 0) throw new Error("baseRetryMs must be a non-negative integer");
    if (!Number.isSafeInteger(this.#leaseMs) || this.#leaseMs <= 0) throw new Error("leaseMs must be a positive integer");
  }

  register(eventType: string, handler: BackgroundJobHandler): void {
    if (!eventType.trim()) throw new Error("Event type is required");
    const handlers = this.#handlers.get(eventType) ?? [];
    handlers.push(handler);
    this.#handlers.set(eventType, handlers);
  }

  async runOnce(now: number, limit = 20): Promise<WorkerRunResult> {
    const eventTypes = [...this.#handlers.keys()];
    if (!eventTypes.length) return { claimed: 0, processed: 0, retried: 0, deadLettered: 0 };
    const claimed = await this.#outbox.claim(now, limit, this.#leaseMs, eventTypes, this.#workerId);
    let processed = 0;
    let retried = 0;
    let deadLettered = 0;
    for (const event of claimed) {
      const handlers = this.#handlers.get(event.type) ?? [];
      try {
        if (!handlers.length) throw new Error(`No handler registered for ${event.type}`);
        for (const handler of handlers) await handler(event, now);
        await this.#outbox.complete(event.id, now, this.#workerId);
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (event.attempts >= this.#maxAttempts) {
          await this.#outbox.deadLetter(event.id, message, now, this.#workerId);
          deadLettered += 1;
        } else {
          const exponentialDelay = this.#baseRetryMs * Math.max(1, 2 ** Math.max(0, event.attempts - 1));
          await this.#outbox.fail(event.id, message, now, exponentialDelay, this.#workerId);
          retried += 1;
        }
      }
    }
    return { claimed: claimed.length, processed, retried, deadLettered };
  }
}

export class MaintenanceJobs {
  readonly #tasks: Array<{ name: string; run: (now: number) => number | Promise<number> }> = [];

  register(name: string, run: (now: number) => number | Promise<number>): void {
    if (!name.trim()) throw new Error("Maintenance task name is required");
    if (this.#tasks.some((task) => task.name === name)) throw new Error(`Maintenance task ${name} already registered`);
    this.#tasks.push({ name, run });
  }

  async run(now: number): Promise<Readonly<Record<string, number>>> {
    const result: Record<string, number> = {};
    for (const task of this.#tasks) result[task.name] = await task.run(now);
    return result;
  }
}
