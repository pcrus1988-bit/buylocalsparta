const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 30_000;

export type NovaReadRetryOptions = Readonly<{
  maxRetries?: number;
  retryBaseDelayMs?: number;
  sleepImpl?: (delayMs: number) => Promise<void>;
}>;

/**
 * Adds bounded retry/backoff only to Nova reads and the documented read-only
 * POST /products/check-status operation. Mutating POST /orders is deliberately
 * never retried: an ambiguous network/5xx outcome must flow into the existing
 * submission_uncertain reconciliation safety state instead of risking a
 * duplicate supplier order.
 */
export function createNovaReadRetryFetch(
  fetchImpl: typeof fetch = fetch,
  options: NovaReadRetryOptions = {}
): typeof fetch {
  const maxRetries = boundedInteger(options.maxRetries ?? DEFAULT_MAX_RETRIES, 0, 6, "Nova max retries");
  const retryBaseDelayMs = boundedInteger(options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS, 0, 10_000, "Nova retry base delay");
  const sleep = options.sleepImpl ?? defaultSleep;

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = input instanceof Request ? new URL(input.url) : new URL(String(input));
    const retryableOperation = method === "GET"
      || (method === "POST" && /\/products\/check-status\/?$/.test(url.pathname));

    if (!retryableOperation || maxRetries === 0) return fetchImpl(input, init);

    let lastNetworkError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await fetchImpl(input, init);
        if (!isRetryableStatus(response.status) || attempt >= maxRetries) return response;

        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        await response.body?.cancel().catch(() => undefined);
        await sleepBeforeRetry(retryDelayMs(attempt, retryBaseDelayMs, retryAfterMs), init?.signal, sleep);
      } catch (error) {
        lastNetworkError = error;
        if (attempt >= maxRetries || init?.signal?.aborted) throw error;
        await sleepBeforeRetry(retryDelayMs(attempt, retryBaseDelayMs, null), init?.signal, sleep);
      }
    }

    throw lastNetworkError instanceof Error
      ? lastNetworkError
      : new Error("Nova read failed after retries");
  }) as typeof fetch;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value?.trim()) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
}

function retryDelayMs(attempt: number, baseDelayMs: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null) return Math.min(Math.round(retryAfterMs), MAX_RETRY_DELAY_MS);
  const exponential = baseDelayMs * 2 ** attempt;
  const jittered = exponential * (0.75 + Math.random() * 0.5);
  return Math.min(Math.round(jittered), MAX_RETRY_DELAY_MS);
}

async function sleepBeforeRetry(
  delayMs: number,
  signal: AbortSignal | null | undefined,
  sleep: (delayMs: number) => Promise<void>
): Promise<void> {
  if (signal?.aborted) throw abortError(signal);
  await sleep(delayMs);
  if (signal?.aborted) throw abortError(signal);
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("Nova request aborted");
  error.name = "AbortError";
  return error;
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function boundedInteger(value: number, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}
