import "server-only";

const QUOTA_API_BASE = "https://merchantapi.googleapis.com/quota/v1";
const PRODUCT_INSERT_PATH = "products/v1/productInputs.insert";
const DEFAULT_TARGET = 2000;
const DAILY_SAFETY_FRACTION = 0.02;
const MIN_DAILY_RESERVE = 250;
const MINUTE_SAFETY_FRACTION = 0.8;
const MAX_WINDOWS_PER_RUN = 5;

type QuotaMethod = Readonly<{
  method?: string;
  path?: string;
}>;

type QuotaGroup = Readonly<{
  name?: string;
  quotaUsage?: string;
  quotaLimit?: string;
  quotaMinuteLimit?: string;
  methodDetails?: readonly QuotaMethod[];
}>;

type QuotaListResponse = Readonly<{
  quotaGroups?: readonly QuotaGroup[];
  nextPageToken?: string;
}>;

function normalizedQuotaMethod(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isProductInputInsertQuotaMethod(detail: QuotaMethod): boolean {
  const method = normalizedQuotaMethod(detail.method);
  const path = normalizedQuotaMethod(detail.path);
  const expectedPath = PRODUCT_INSERT_PATH.toLowerCase();

  return path === expectedPath
    || path.endsWith("/productinputs.insert")
    || path.endsWith("productinputs.insert")
    || method.endsWith("productinputs.insert")
    || method.endsWith("insertproductinput");
}

export type MerchantWriteQuota = Readonly<{
  groupName: string | null;
  dailyLimit: number;
  dailyUsage: number;
  dailyRemaining: number;
  minuteLimit: number;
  safeMinuteBudget: number;
  safeDailyBudget: number;
}>;

export type MerchantWritePlan = Readonly<{
  requested: number;
  allowed: number;
  deferred: number;
  quota: MerchantWriteQuota;
}>;

function safeInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

async function quotaPage(accessToken: string, accountId: string, pageToken?: string): Promise<QuotaListResponse> {
  const url = new URL(`${QUOTA_API_BASE}/accounts/${accountId}/quotas`);
  url.searchParams.set("pageSize", "1000");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const response = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Merchant quota lookup failed (${response.status}): ${text.replace(/\s+/g, " ").trim().slice(0, 700) || response.statusText}`
    );
  }
  try {
    return JSON.parse(text) as QuotaListResponse;
  } catch {
    throw new Error("Merchant quota lookup returned invalid JSON.");
  }
}

export async function getMerchantProductInsertQuota(
  accessToken: string,
  accountId: string
): Promise<MerchantWriteQuota> {
  let pageToken: string | undefined;
  let matched: QuotaGroup | undefined;
  const observedMethods = new Set<string>();

  do {
    const page = await quotaPage(accessToken, accountId, pageToken);
    for (const group of page.quotaGroups ?? []) {
      for (const detail of group.methodDetails ?? []) {
        const method = detail.method?.trim() || "<none>";
        const path = detail.path?.trim() || "<none>";
        observedMethods.add(`${method}|${path}`);
      }
      if (!matched && (group.methodDetails ?? []).some(isProductInputInsertQuotaMethod)) {
        matched = group;
      }
    }
    if (matched) break;
    pageToken = page.nextPageToken;
  } while (pageToken);

  if (!matched) {
    const observed = [...observedMethods].filter((value) => /product|insert/i.test(value)).slice(0, 20);
    throw new Error(
      `Merchant productInputs.insert quota group was not returned for this account. Observed: ${observed.join(", ") || "none"}`
    );
  }

  const dailyLimit = safeInteger(matched.quotaLimit);
  const dailyUsage = safeInteger(matched.quotaUsage);
  const minuteLimit = safeInteger(matched.quotaMinuteLimit);
  if (dailyLimit <= 0 || minuteLimit <= 0) {
    throw new Error("Merchant productInputs.insert quota limits are unavailable or zero.");
  }

  const dailyRemaining = Math.max(0, dailyLimit - dailyUsage);
  const dailyReserve = Math.max(MIN_DAILY_RESERVE, Math.ceil(dailyLimit * DAILY_SAFETY_FRACTION));
  const safeDailyBudget = Math.max(0, dailyRemaining - dailyReserve);
  const safeMinuteBudget = Math.max(1, Math.floor(minuteLimit * MINUTE_SAFETY_FRACTION));

  return {
    groupName: matched.name?.trim() || null,
    dailyLimit,
    dailyUsage,
    dailyRemaining,
    minuteLimit,
    safeMinuteBudget,
    safeDailyBudget
  };
}

export function merchantWritePlan(
  quota: MerchantWriteQuota,
  requested = DEFAULT_TARGET
): MerchantWritePlan {
  const normalizedRequested = Math.max(0, Math.floor(requested));
  const allowed = Math.min(normalizedRequested, quota.safeDailyBudget, quota.safeMinuteBudget * MAX_WINDOWS_PER_RUN);
  return {
    requested: normalizedRequested,
    allowed,
    deferred: Math.max(0, normalizedRequested - allowed),
    quota
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs writes in quota-sized minute windows. The first window starts
 * immediately; later windows wait a full rolling minute before proceeding.
 */
export async function runMerchantWritesQuotaAware<T>(
  items: readonly T[],
  quota: MerchantWriteQuota,
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (!items.length) return;
  const windowSize = Math.max(1, quota.safeMinuteBudget);

  for (let offset = 0; offset < items.length; offset += windowSize) {
    const window = items.slice(offset, offset + windowSize);
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(Math.max(1, concurrency), window.length) }, async () => {
        while (true) {
          const index = cursor++;
          if (index >= window.length) return;
          await worker(window[index]);
        }
      })
    );
    if (offset + windowSize < items.length) {
      await sleep(61_000);
    }
  }
}
