const MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Parse the RFC 9110 Retry-After response header into a bounded delay. AADE/APIM
 * may return either delta-seconds or an HTTP date. Callers can persist this value
 * on durable reconciliation jobs without re-parsing transport-specific headers.
 */
export function retryAfterDelayMs(value: string | null | undefined, nowMs = Date.now()): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;

  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    if (!Number.isSafeInteger(seconds) || seconds < 0) return undefined;
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }

  const retryAt = Date.parse(normalized);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.min(Math.max(0, retryAt - nowMs), MAX_RETRY_AFTER_MS);
}
