export type RateLimitRule = Readonly<{
  limit: number;
  windowMs: number;
}>;

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}>;

export class RateLimitError extends Error {
  readonly decision: RateLimitDecision;

  constructor(decision: RateLimitDecision) {
    super("Too many requests");
    this.name = "RateLimitError";
    this.decision = decision;
  }
}

type Bucket = {
  windowStartedAt: number;
  count: number;
};

/**
 * Deterministic fixed-window limiter used by the executable development runtime.
 * Production deployments can replace this contract with Redis/edge-rate-limiting
 * without changing route policy or error semantics.
 */
export class InMemoryRateLimiter {
  readonly #buckets = new Map<string, Bucket>();

  consume(input: { key: string; rule: RateLimitRule; now: number; cost?: number }): RateLimitDecision {
    if (!input.key.trim()) throw new Error("Rate-limit key is required");
    if (!Number.isSafeInteger(input.rule.limit) || input.rule.limit <= 0) throw new Error("Rate-limit limit must be a positive integer");
    if (!Number.isSafeInteger(input.rule.windowMs) || input.rule.windowMs <= 0) throw new Error("Rate-limit windowMs must be a positive integer");
    const cost = input.cost ?? 1;
    if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error("Rate-limit cost must be a positive integer");

    let bucket = this.#buckets.get(input.key);
    if (!bucket || input.now >= bucket.windowStartedAt + input.rule.windowMs) {
      bucket = { windowStartedAt: input.now, count: 0 };
      this.#buckets.set(input.key, bucket);
    }

    const resetAt = bucket.windowStartedAt + input.rule.windowMs;
    if (bucket.count + cost > input.rule.limit) {
      return {
        allowed: false,
        limit: input.rule.limit,
        remaining: Math.max(0, input.rule.limit - bucket.count),
        resetAt,
        retryAfterMs: Math.max(1, resetAt - input.now)
      };
    }

    bucket.count += cost;
    return {
      allowed: true,
      limit: input.rule.limit,
      remaining: Math.max(0, input.rule.limit - bucket.count),
      resetAt,
      retryAfterMs: 0
    };
  }

  assertAllowed(input: { key: string; rule: RateLimitRule; now: number; cost?: number }): RateLimitDecision {
    const decision = this.consume(input);
    if (!decision.allowed) throw new RateLimitError(decision);
    return decision;
  }

  prune(now: number): number {
    let removed = 0;
    for (const [key, bucket] of this.#buckets) {
      // Buckets can have different windows, so idle buckets are conservatively
      // removed after 24 hours. Active route windows remain much shorter.
      if (now - bucket.windowStartedAt > 24 * 60 * 60 * 1000) {
        this.#buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  bucketCount(): number {
    return this.#buckets.size;
  }
}
