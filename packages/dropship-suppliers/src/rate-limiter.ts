export class SupplierRateLimiter {
  readonly requestsPerMinute: number;
  readonly minimumSpacingMs: number;

  #nextAllowedAt = 0;
  #tail: Promise<void> = Promise.resolve();

  constructor(requestsPerMinute = 60) {
    if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1) {
      throw new Error("requestsPerMinute must be a positive integer");
    }

    this.requestsPerMinute = requestsPerMinute;
    this.minimumSpacingMs = Math.ceil(60_000 / requestsPerMinute);
  }

  async acquire(): Promise<void> {
    const scheduled = this.#tail.then(async () => {
      const now = Date.now();
      const delayMs = Math.max(0, this.#nextAllowedAt - now);
      if (delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
      this.#nextAllowedAt = Date.now() + this.minimumSpacingMs;
    });

    this.#tail = scheduled.catch(() => undefined);
    await scheduled;
  }
}
