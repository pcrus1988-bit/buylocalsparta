export const GEMI_OPENDATA_DEFAULT_BASE_URL = "https://opendata-api.businessportal.gr/api/opendata/v1";
export const GEMI_OPENDATA_DEFAULT_REQUESTS_PER_MINUTE = 7;
export const GEMI_OPENDATA_MAX_DOCUMENTED_REQUESTS_PER_MINUTE = 8;

export type GemiQueryValue = string | number | boolean | readonly (string | number | boolean)[] | undefined | null;

export type GemiDescriptor<T extends string | number = string | number> = Readonly<{
  id: T;
  descr: string;
  descrEn?: string;
}>;

export type GemiCompanyActivity = Readonly<{
  activity: Readonly<{ id: string; descr: string; kadVersion?: string }>;
  type?: string;
  dtFrom?: string;
  dtTo?: string;
}>;

export type GemiCompany = Readonly<{
  arGemi: number;
  afm?: string;
  coNameEl?: string;
  coNamesEn?: readonly string[];
  coTitlesEl?: readonly string[];
  coTitlesEn?: readonly string[];
  municipality?: GemiDescriptor<number>;
  prefecture?: GemiDescriptor<number>;
  city?: string;
  street?: string;
  streetNumber?: string;
  zipCode?: string;
  url?: string;
  email?: string;
  isBranch?: boolean;
  objective?: string;
  legalType?: GemiDescriptor<number>;
  gemiOffice?: GemiDescriptor<number>;
  incorporationDate?: string;
  lastStatusChange?: string;
  status?: GemiDescriptor<number>;
  autoRegistered?: boolean;
  activities?: readonly GemiCompanyActivity[];
  branch?: readonly number[];
  [key: string]: unknown;
}>;

export type GemiSearchParams = Readonly<{
  arGemi?: string;
  afm?: string;
  name?: string;
  legalTypes?: readonly number[];
  gemiOffices?: readonly string[];
  municipalities?: readonly string[];
  prefectures?: readonly number[];
  statuses?: readonly number[];
  isActive?: boolean;
  activities?: readonly string[];
  resultsSortBy?: "+coName" | "-coName" | "+afm" | "-afm" | "+arGemi" | "-arGemi" | "+incorporationDate" | "-incorporationDate";
  resultsOffset?: number;
  resultsSize?: number;
}>;

export type GemiSearchResponse = Readonly<{
  searchMetadata?: Readonly<{ totalCount?: number; resultsOffset?: number; resultsSize?: string | number }>;
  searchResults?: readonly GemiCompany[];
  [key: string]: unknown;
}>;

export type GemiReferenceDataset = "activities" | "prefectures" | "municipalities" | "companyStatuses" | "legalTypes" | "gemiOffices" | "assemblySubjects";

export class GemiOpenDataError extends Error {
  readonly status?: number;
  readonly code: "UNAUTHORIZED" | "RATE_LIMITED" | "UPSTREAM" | "INVALID_RESPONSE" | "CONFIGURATION" | "NETWORK";
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number; code: GemiOpenDataError["code"]; retryable?: boolean; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "GemiOpenDataError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable === true;
  }
}

type FetchLike = typeof fetch;

export type GemiOpenDataClientOptions = Readonly<{
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  requestsPerMinute?: number;
  requestTimeoutMs?: number;
  maxRetries?: number;
  cacheTtlMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}>;

type CacheEntry = { expiresAt: number; value: unknown };

export class GemiOpenDataClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly limiter: SlidingWindowLimiter;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: GemiOpenDataClientOptions = {}) {
    const key = options.apiKey?.trim() || process.env.GEMI_OPENDATA_API_KEY?.trim() || "";
    if (!key) {
      throw new GemiOpenDataError("GEMI_OPENDATA_API_KEY is required for official GEMI OpenData access", {
        code: "CONFIGURATION"
      });
    }
    this.apiKey = key;
    this.baseUrl = (options.baseUrl?.trim() || process.env.GEMI_OPENDATA_BASE_URL?.trim() || GEMI_OPENDATA_DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestTimeoutMs = positiveInteger(options.requestTimeoutMs ?? fromEnvInt("GEMI_OPENDATA_REQUEST_TIMEOUT_MS", 15_000), "requestTimeoutMs");
    this.maxRetries = nonNegativeInteger(options.maxRetries ?? fromEnvInt("GEMI_OPENDATA_MAX_RETRIES", 3), "maxRetries");
    this.cacheTtlMs = nonNegativeInteger(options.cacheTtlMs ?? fromEnvInt("GEMI_OPENDATA_CACHE_TTL_MS", 86_400_000), "cacheTtlMs");
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const requestedRate = positiveInteger(options.requestsPerMinute ?? fromEnvInt("GEMI_OPENDATA_REQUESTS_PER_MINUTE", GEMI_OPENDATA_DEFAULT_REQUESTS_PER_MINUTE), "requestsPerMinute");
    if (requestedRate > GEMI_OPENDATA_MAX_DOCUMENTED_REQUESTS_PER_MINUTE) {
      throw new GemiOpenDataError(`GEMI OpenData rate cannot exceed the documented ${GEMI_OPENDATA_MAX_DOCUMENTED_REQUESTS_PER_MINUTE} requests/minute`, {
        code: "CONFIGURATION"
      });
    }
    this.limiter = new SlidingWindowLimiter(requestedRate, 60_000, this.now, this.sleep);
  }

  searchCompanies(params: GemiSearchParams, signal?: AbortSignal): Promise<GemiSearchResponse> {
    const hasCriterion = [params.arGemi, params.afm, params.name, params.legalTypes?.length, params.gemiOffices?.length, params.municipalities?.length, params.prefectures?.length, params.statuses?.length, params.activities?.length].some(Boolean);
    if (!hasCriterion) throw new TypeError("At least one GEMI search criterion is required");
    if (params.resultsSize !== undefined && (params.resultsSize < 1 || params.resultsSize > 200)) throw new TypeError("resultsSize must be between 1 and 200");
    return this.getJson<GemiSearchResponse>("/companies", params as Record<string, GemiQueryValue>, { signal, cache: true });
  }

  getCompany(arGemi: string | number, signal?: AbortSignal): Promise<GemiCompany> {
    const normalized = normalizeGemiNumber(arGemi);
    if (!normalized) throw new TypeError("A valid GEMI number is required");
    return this.getJson<GemiCompany>(`/companies/${encodeURIComponent(normalized)}`, undefined, { signal, cache: true });
  }

  getCompanyDocuments(arGemi: string | number, signal?: AbortSignal): Promise<unknown> {
    const normalized = normalizeGemiNumber(arGemi);
    if (!normalized) throw new TypeError("A valid GEMI number is required");
    return this.getJson(`/companies/${encodeURIComponent(normalized)}/documents`, undefined, { signal, cache: true });
  }

  getReferenceData<T = unknown>(dataset: GemiReferenceDataset, signal?: AbortSignal): Promise<T> {
    return this.getJson<T>(`/metadata/${dataset}`, undefined, { signal, cache: true, cacheTtlMs: Math.max(this.cacheTtlMs, 7 * 86_400_000) });
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async getJson<T>(path: string, query?: Record<string, GemiQueryValue>, options: { signal?: AbortSignal; cache?: boolean; cacheTtlMs?: number } = {}): Promise<T> {
    const url = `${this.baseUrl}${path}${queryString(query)}`;
    const cached = options.cache ? this.cache.get(url) : undefined;
    if (cached && cached.expiresAt > this.now()) return cached.value as T;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.limiter.acquire(options.signal);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error("GEMI request timed out")), this.requestTimeoutMs);
      const abort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", abort, { once: true });
      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json", api_key: this.apiKey },
          signal: controller.signal
        });
        if (response.ok) {
          let parsed: T;
          try {
            parsed = await response.json() as T;
          } catch (error) {
            throw new GemiOpenDataError("GEMI OpenData returned invalid JSON", { status: response.status, code: "INVALID_RESPONSE", cause: error });
          }
          if (options.cache) this.cache.set(url, { expiresAt: this.now() + (options.cacheTtlMs ?? this.cacheTtlMs), value: parsed });
          return parsed;
        }

        const responseText = await safeText(response);
        if (response.status === 401) {
          throw new GemiOpenDataError(`GEMI OpenData rejected the API key (401)${responseText ? `: ${truncate(responseText)}` : ""}`, {
            status: 401,
            code: "UNAUTHORIZED"
          });
        }
        if (response.status === 429) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"), this.now());
          const error = new GemiOpenDataError("GEMI OpenData rate limit reached (429)", { status: 429, code: "RATE_LIMITED", retryable: true });
          if (attempt === this.maxRetries) throw error;
          await this.sleep(retryAfterMs ?? backoffMs(attempt));
          continue;
        }
        if (response.status >= 500) {
          const error = new GemiOpenDataError(`GEMI OpenData temporary upstream error (${response.status})`, { status: response.status, code: "UPSTREAM", retryable: true });
          if (attempt === this.maxRetries) throw error;
          await this.sleep(backoffMs(attempt));
          continue;
        }
        throw new GemiOpenDataError(`GEMI OpenData request failed (${response.status})${responseText ? `: ${truncate(responseText)}` : ""}`, { status: response.status, code: "UPSTREAM" });
      } catch (error) {
        if (error instanceof GemiOpenDataError) throw error;
        lastError = error;
        if (options.signal?.aborted) throw options.signal.reason ?? error;
        if (attempt === this.maxRetries) break;
        await this.sleep(backoffMs(attempt));
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abort);
      }
    }
    throw new GemiOpenDataError("GEMI OpenData network request failed after retries", { code: "NETWORK", retryable: true, cause: lastError });
  }
}

class SlidingWindowLimiter {
  private readonly timestamps: number[] = [];
  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number, private readonly sleep: (ms: number) => Promise<void>) {}

  async acquire(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw signal.reason ?? new Error("Aborted");
      const now = this.now();
      while (this.timestamps.length && this.timestamps[0]! <= now - this.windowMs) this.timestamps.shift();
      if (this.timestamps.length < this.limit) {
        this.timestamps.push(now);
        return;
      }
      const waitMs = Math.max(1, this.timestamps[0]! + this.windowMs - now);
      await this.sleep(waitMs);
    }
  }
}

export function normalizeAfm(value: unknown): string | undefined {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : undefined;
}

export function normalizeGemiNumber(value: unknown): string | undefined {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{6,15}$/.test(digits) ? digits : undefined;
}

function queryString(query?: Record<string, GemiQueryValue>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined || raw === null || raw === "") continue;
    if (Array.isArray(raw)) {
      if (raw.length) params.set(key, raw.map(String).join(","));
    } else params.set(key, String(raw));
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

function fromEnvInt(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) ? value : fallback;
}
function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
  return value;
}
function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative integer`);
  return value;
}
function backoffMs(attempt: number): number { return Math.min(30_000, 2_000 * (2 ** attempt)); }
function truncate(value: string): string { return value.replace(/\s+/g, " ").slice(0, 300); }
async function safeText(response: Response): Promise<string> { try { return await response.text(); } catch { return ""; } }
function parseRetryAfterMs(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}
