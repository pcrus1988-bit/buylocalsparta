export type ScheduledJobLease = Readonly<{
  name: string;
  ownerId: string;
  lockedUntil: number;
  nextRunAt: number;
  lastStartedAt?: number;
  lastSucceededAt?: number;
  consecutiveFailures: number;
  lastError?: string;
}>;

export interface ScheduledJobStore {
  claimDue(input: { now: number; ownerId: string; jobNames: readonly string[]; leaseMs: number; limit: number }): readonly ScheduledJobLease[] | Promise<readonly ScheduledJobLease[]>;
  complete(input: { name: string; ownerId: string; now: number; nextRunAt: number }): void | Promise<void>;
  fail(input: { name: string; ownerId: string; now: number; nextRunAt: number; error: string }): void | Promise<void>;
}

export class InMemoryScheduledJobStore implements ScheduledJobStore {
  readonly #jobs = new Map<string, ScheduledJobLease>();

  claimDue(input: { now: number; ownerId: string; jobNames: readonly string[]; leaseMs: number; limit: number }): readonly ScheduledJobLease[] {
    if (!input.ownerId.trim()) throw new Error("Scheduled job owner is required");
    const claimed: ScheduledJobLease[] = [];
    for (const name of input.jobNames) {
      if (claimed.length >= input.limit) break;
      const existing = this.#jobs.get(name) ?? { name, ownerId: "", lockedUntil: 0, nextRunAt: 0, consecutiveFailures: 0 };
      const leaseExpired = existing.lockedUntil <= input.now;
      if (existing.nextRunAt > input.now || !leaseExpired) continue;
      const next: ScheduledJobLease = { ...existing, ownerId: input.ownerId, lockedUntil: input.now + input.leaseMs, lastStartedAt: input.now };
      this.#jobs.set(name, next);
      claimed.push(structuredClone(next));
    }
    return claimed;
  }

  complete(input: { name: string; ownerId: string; now: number; nextRunAt: number }): void {
    const existing = this.#required(input.name, input.ownerId);
    this.#jobs.set(input.name, { ...existing, ownerId: "", lockedUntil: 0, nextRunAt: input.nextRunAt, lastSucceededAt: input.now, consecutiveFailures: 0, lastError: undefined });
  }

  fail(input: { name: string; ownerId: string; now: number; nextRunAt: number; error: string }): void {
    const existing = this.#required(input.name, input.ownerId);
    this.#jobs.set(input.name, { ...existing, ownerId: "", lockedUntil: 0, nextRunAt: input.nextRunAt, consecutiveFailures: existing.consecutiveFailures + 1, lastError: input.error.slice(0, 2_000) });
  }

  state(name: string): ScheduledJobLease | undefined {
    const value = this.#jobs.get(name);
    return value ? structuredClone(value) : undefined;
  }

  #required(name: string, ownerId: string): ScheduledJobLease {
    const existing = this.#jobs.get(name);
    if (!existing) throw new Error("Scheduled job not found");
    if (existing.ownerId !== ownerId) throw new Error("Scheduled job lease belongs to another worker");
    return existing;
  }
}

export type ScheduledJobRunResult = Readonly<{
  claimed: number;
  succeeded: readonly string[];
  failed: readonly string[];
}>;

export class ScheduledJobRunner {
  readonly #store: ScheduledJobStore;
  readonly #ownerId: string;
  readonly #leaseMs: number;
  readonly #jobs = new Map<string, { intervalMs: number; retryMs: number; run: (now: number) => void | Promise<void> }>();

  constructor(input: { store: ScheduledJobStore; ownerId: string; leaseMs?: number }) {
    if (!input.ownerId.trim()) throw new Error("Scheduled job runner owner is required");
    this.#store = input.store;
    this.#ownerId = input.ownerId;
    this.#leaseMs = input.leaseMs ?? 60_000;
  }

  register(input: { name: string; intervalMs: number; retryMs?: number; run: (now: number) => void | Promise<void> }): void {
    if (!input.name.trim()) throw new Error("Scheduled job name is required");
    if (this.#jobs.has(input.name)) throw new Error(`Scheduled job ${input.name} already registered`);
    if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs <= 0) throw new Error("Scheduled job interval must be positive");
    const retryMs = input.retryMs ?? Math.min(input.intervalMs, 60_000);
    if (!Number.isSafeInteger(retryMs) || retryMs <= 0) throw new Error("Scheduled job retry interval must be positive");
    this.#jobs.set(input.name, { intervalMs: input.intervalMs, retryMs, run: input.run });
  }

  async runDue(now: number, limit = 20): Promise<ScheduledJobRunResult> {
    const names = [...this.#jobs.keys()];
    const claimed = await this.#store.claimDue({ now, ownerId: this.#ownerId, jobNames: names, leaseMs: this.#leaseMs, limit });
    const succeeded: string[] = [];
    const failed: string[] = [];
    for (const lease of claimed) {
      const job = this.#jobs.get(lease.name);
      if (!job) continue;
      try {
        await job.run(now);
        await this.#store.complete({ name: lease.name, ownerId: this.#ownerId, now, nextRunAt: now + job.intervalMs });
        succeeded.push(lease.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.#store.fail({ name: lease.name, ownerId: this.#ownerId, now, nextRunAt: now + job.retryMs, error: message });
        failed.push(lease.name);
      }
    }
    return { claimed: claimed.length, succeeded, failed };
  }
}
