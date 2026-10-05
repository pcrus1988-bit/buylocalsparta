export const CUSTOMER_TRY_ON_MONTHLY_LIMIT = 50;

export type CustomerTryOnMonthlyQuota = Readonly<{
  limit: number;
  used: number;
  remaining: number;
  monthStart: string;
  resetAt: string;
}>;

export function customerTryOnQuotaWindow(now: number): Readonly<{
  monthStart: string;
  resetAt: string;
  resetAtMs: number;
}> {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid Try On quota time");
  const monthStartMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const resetAtMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return {
    monthStart: new Date(monthStartMs).toISOString().slice(0, 10),
    resetAt: new Date(resetAtMs).toISOString(),
    resetAtMs
  };
}

export function customerTryOnQuotaSnapshot(used: number, now: number): CustomerTryOnMonthlyQuota {
  const window = customerTryOnQuotaWindow(now);
  const normalizedUsed = Number.isFinite(used)
    ? Math.min(CUSTOMER_TRY_ON_MONTHLY_LIMIT, Math.max(0, Math.trunc(used)))
    : 0;
  return {
    limit: CUSTOMER_TRY_ON_MONTHLY_LIMIT,
    used: normalizedUsed,
    remaining: Math.max(0, CUSTOMER_TRY_ON_MONTHLY_LIMIT - normalizedUsed),
    monthStart: window.monthStart,
    resetAt: window.resetAt
  };
}
