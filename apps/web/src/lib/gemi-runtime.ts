import { createHash } from "node:crypto";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_GEMI_BASE_URL = "https://opendata-api.businessportal.gr/api/opendata/v1";
const DEFAULT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const gemiLimiterKey = "__buyLocalSpartaGemiLimiter" as const;

type Globals = typeof globalThis & { [gemiLimiterKey]?: PostgresFixedWindowRateLimiter };
const globals = globalThis as Globals;

export type GemiLookupStatus = "matched" | "not_found" | "unavailable";

export type GemiCompanyRecord = Readonly<{
  lookupStatus: "matched";
  taxNumber: string;
  gemiNumber: string;
  legalName: string;
  tradingName?: string;
  companyStatus?: string;
  legalType?: string;
  addressLine1?: string;
  city?: string;
  municipality?: string;
  prefecture?: string;
  postcode?: string;
  email?: string;
  phone?: string;
  url?: string;
  checkedAt: number;
  fromCache: boolean;
}>;

export type GemiLookupResult =
  | GemiCompanyRecord
  | Readonly<{ lookupStatus: "not_found"; taxNumber: string; checkedAt: number; fromCache: boolean }>
  | Readonly<{ lookupStatus: "unavailable"; taxNumber: string; checkedAt: number; message: string; fromCache: false }>;

type CacheRow = SqlRow & {
  tax_number: string;
  lookup_status: string;
  gemi_number: string | null;
  legal_name: string | null;
  trading_name: string | null;
  company_status: string | null;
  legal_type: string | null;
  address_line1: string | null;
  city: string | null;
  municipality: string | null;
  prefecture: string | null;
  postcode: string | null;
  public_email: string | null;
  public_phone: string | null;
  public_url: string | null;
  last_checked_at: Date | string;
  expires_at: Date | string;
};

type GemiConfig = Readonly<{
  apiKey: string;
  baseUrl: string;
  requestTimeoutMs: number;
  cacheTtlMs: number;
}>;

export function normalizeGreekAfm(raw: string): string {
  const afm = raw.trim().replace(/\s+/g, "");
  if (!/^\d{9}$/.test(afm)) throw new Error("Το ΑΦΜ πρέπει να έχει 9 ψηφία.");
  let weighted = 0;
  for (let index = 0; index < 8; index += 1) weighted += Number(afm[index]) * (2 ** (8 - index));
  if (((weighted % 11) % 10) !== Number(afm[8])) throw new Error("Το ΑΦΜ δεν είναι έγκυρο.");
  return afm;
}

export function gemiLookupReadiness(env: NodeJS.ProcessEnv = process.env) {
  if (!productionDatabaseConfigured(env)) return { ready: false, message: "Η σύνδεση με το Γ.Ε.ΜΗ. δεν είναι προσωρινά διαθέσιμη." } as const;
  const apiKey = env.GEMI_OPENDATA_API_KEY?.trim();
  if (!apiKey) return { ready: false, message: "Η σύνδεση με το Γ.Ε.ΜΗ. δεν έχει ενεργοποιηθεί ακόμη." } as const;
  return { ready: true, message: "Γ.Ε.ΜΗ. OpenData διαθέσιμο." } as const;
}

export async function consumePublicGemiLookupLimit(visitorKey: string, now = Date.now()) {
  if (!productionDatabaseConfigured()) return { allowed: false, retryAfterMs: 60_000 };
  return limiter().consume({ route: "public-gemi-afm", key: visitorKey, limit: 12, windowMs: 60 * 60 * 1000, now });
}

export async function resolveGemiCompanyByAfm(rawAfm: string, now = Date.now()): Promise<GemiLookupResult> {
  const taxNumber = normalizeGreekAfm(rawAfm);
  const readiness = gemiLookupReadiness();
  if (!readiness.ready) return { lookupStatus: "unavailable", taxNumber, checkedAt: now, message: readiness.message, fromCache: false };

  const config = configFromEnv();
  const cached = await readCache(taxNumber);
  if (cached && Date.parse(String(cached.expires_at)) > now) return resultFromCache(cached);

  const providerAllowance = await limiter().consume({
    route: "gemi-opendata-provider",
    key: "global",
    limit: 3,
    windowMs: 60 * 1000,
    now
  });
  if (!providerAllowance.allowed) {
    if (cached?.lookup_status === "matched") return resultFromCache(cached);
    return { lookupStatus: "unavailable", taxNumber, checkedAt: now, message: "Το Γ.Ε.ΜΗ. έχει προσωρινά αυξημένη κίνηση. Δοκιμάστε ξανά σε λίγο.", fromCache: false };
  }

  try {
    const search = await fetchJson(`${config.baseUrl}/companies?afm=${encodeURIComponent(taxNumber)}&resultsSize=10`, config);
    const candidates = arrayField(search, "searchResults", "results", "companies");
    const candidate = candidates.find((item) => normalizeOptionalAfm(stringField(item, "afm")) === taxNumber) ?? candidates[0];
    if (!candidate) {
      await writeNotFound(taxNumber, now, config.cacheTtlMs);
      return { lookupStatus: "not_found", taxNumber, checkedAt: now, fromCache: false };
    }

    const gemiNumber = digitsOnly(stringField(candidate, "arGemi", "gemiNumber", "gemi_number"));
    if (!gemiNumber) {
      await writeNotFound(taxNumber, now, config.cacheTtlMs);
      return { lookupStatus: "not_found", taxNumber, checkedAt: now, fromCache: false };
    }

    let company = candidate;
    try {
      company = await fetchJson(`${config.baseUrl}/companies/${encodeURIComponent(gemiNumber)}`, config);
    } catch {
      // Search results already carry enough public identity fields for a safe degraded enrichment.
    }

    const record = normalizeCompany(company, candidate, taxNumber, gemiNumber, now);
    if (!record.legalName) {
      return { lookupStatus: "unavailable", taxNumber, checkedAt: now, message: "Το Γ.Ε.ΜΗ. επέστρεψε ελλιπή στοιχεία για την επιχείρηση.", fromCache: false };
    }
    await writeMatched(record, company, now, config.cacheTtlMs);
    return record;
  } catch (error) {
    if (cached?.lookup_status === "matched") return resultFromCache(cached);
    return {
      lookupStatus: "unavailable",
      taxNumber,
      checkedAt: now,
      message: error instanceof Error && error.name === "AbortError"
        ? "Η σύνδεση με το Γ.Ε.ΜΗ. καθυστέρησε υπερβολικά. Δοκιμάστε ξανά."
        : "Δεν ήταν δυνατή η επικοινωνία με το Γ.Ε.ΜΗ. αυτή τη στιγμή.",
      fromCache: false
    };
  }
}

function configFromEnv(env: NodeJS.ProcessEnv = process.env): GemiConfig {
  const apiKey = env.GEMI_OPENDATA_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMI_OPENDATA_API_KEY is required");
  const baseUrl = (env.GEMI_OPENDATA_BASE_URL?.trim() || DEFAULT_GEMI_BASE_URL).replace(/\/+$/, "");
  return {
    apiKey,
    baseUrl,
    requestTimeoutMs: positiveInteger(env.GEMI_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
    cacheTtlMs: positiveInteger(env.GEMI_CACHE_TTL_HOURS, 168) * 60 * 60 * 1000
  };
}

function limiter(): PostgresFixedWindowRateLimiter {
  const runtime = getProductionPostgresRuntime();
  return globals[gemiLimiterKey] ?? (globals[gemiLimiterKey] = new PostgresFixedWindowRateLimiter(runtime.sqlPool));
}

async function fetchJson(url: string, config: GemiConfig): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", api_key: config.apiKey },
      signal: controller.signal,
      cache: "no-store"
    });
    if (response.status === 404) return {};
    if (!response.ok) throw new Error(`GEMI HTTP ${response.status}`);
    const body = await response.json();
    return isRecord(body) ? body : {};
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCompany(
  detail: Record<string, unknown>,
  fallback: Record<string, unknown>,
  taxNumber: string,
  gemiNumber: string,
  now: number
): GemiCompanyRecord {
  const source = Object.keys(detail).length ? detail : fallback;
  const legalName = stringField(source, "coNameEl", "coName", "legalName") || stringField(fallback, "coNameEl", "coName", "legalName") || "";
  const titles = stringArrayField(source, "coTitlesEl", "titles", "tradeNames");
  const street = stringField(source, "street");
  const streetNumber = stringField(source, "streetNumber");
  const addressLine1 = [street, streetNumber].filter(Boolean).join(" ").trim() || stringField(source, "address");
  return {
    lookupStatus: "matched",
    taxNumber,
    gemiNumber,
    legalName,
    tradingName: titles[0] || undefined,
    companyStatus: nestedDescription(source.status) || stringField(source, "statusDescr", "status"),
    legalType: nestedDescription(source.legalType) || stringField(source, "legalTypeDescr"),
    addressLine1: addressLine1 || undefined,
    city: nestedDescription(source.city) || stringField(source, "city"),
    municipality: nestedDescription(source.municipality),
    prefecture: nestedDescription(source.prefecture),
    postcode: stringField(source, "zipCode", "postcode", "postalCode") || undefined,
    email: normalizeEmail(stringField(source, "email")),
    phone: stringField(source, "phone", "telephone", "phoneNumber") || undefined,
    url: stringField(source, "url", "website") || undefined,
    checkedAt: now,
    fromCache: false
  };
}

async function readCache(taxNumber: string): Promise<CacheRow | undefined> {
  const result = await getProductionPostgresRuntime().sqlPool.query<CacheRow>(`
    SELECT tax_number,lookup_status,gemi_number,legal_name,trading_name,company_status,legal_type,
           address_line1,city,municipality,prefecture,postcode,public_email,public_phone,public_url,
           last_checked_at,expires_at
    FROM gemi_company_lookup_cache
    WHERE tax_number=$1
    LIMIT 1
  `, [taxNumber]);
  return result.rows[0];
}

function resultFromCache(row: CacheRow): GemiLookupResult {
  const checkedAt = Date.parse(String(row.last_checked_at));
  if (row.lookup_status !== "matched" || !row.gemi_number || !row.legal_name) {
    return { lookupStatus: "not_found", taxNumber: row.tax_number, checkedAt, fromCache: true };
  }
  return {
    lookupStatus: "matched",
    taxNumber: row.tax_number,
    gemiNumber: row.gemi_number,
    legalName: row.legal_name,
    tradingName: row.trading_name || undefined,
    companyStatus: row.company_status || undefined,
    legalType: row.legal_type || undefined,
    addressLine1: row.address_line1 || undefined,
    city: row.city || undefined,
    municipality: row.municipality || undefined,
    prefecture: row.prefecture || undefined,
    postcode: row.postcode || undefined,
    email: row.public_email || undefined,
    phone: row.public_phone || undefined,
    url: row.public_url || undefined,
    checkedAt,
    fromCache: true
  };
}

async function writeNotFound(taxNumber: string, now: number, ttlMs: number): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    INSERT INTO gemi_company_lookup_cache(
      tax_number,lookup_status,last_checked_at,expires_at
    ) VALUES($1,'not_found',to_timestamp($2/1000.0),to_timestamp($3/1000.0))
    ON CONFLICT(tax_number) DO UPDATE SET
      lookup_status='not_found',gemi_number=NULL,legal_name=NULL,trading_name=NULL,
      company_status=NULL,legal_type=NULL,address_line1=NULL,city=NULL,municipality=NULL,
      prefecture=NULL,postcode=NULL,public_email=NULL,public_phone=NULL,public_url=NULL,
      payload_hash=NULL,last_checked_at=EXCLUDED.last_checked_at,expires_at=EXCLUDED.expires_at
  `, [taxNumber, now, now + ttlMs]);
}

async function writeMatched(record: GemiCompanyRecord, payload: Record<string, unknown>, now: number, ttlMs: number): Promise<void> {
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  await getProductionPostgresRuntime().sqlPool.query(`
    INSERT INTO gemi_company_lookup_cache(
      tax_number,lookup_status,gemi_number,legal_name,trading_name,company_status,legal_type,
      address_line1,city,municipality,prefecture,postcode,public_email,public_phone,public_url,
      payload_hash,last_checked_at,expires_at
    ) VALUES(
      $1,'matched',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
      to_timestamp($16/1000.0),to_timestamp($17/1000.0)
    )
    ON CONFLICT(tax_number) DO UPDATE SET
      lookup_status='matched',gemi_number=EXCLUDED.gemi_number,legal_name=EXCLUDED.legal_name,
      trading_name=EXCLUDED.trading_name,company_status=EXCLUDED.company_status,legal_type=EXCLUDED.legal_type,
      address_line1=EXCLUDED.address_line1,city=EXCLUDED.city,municipality=EXCLUDED.municipality,
      prefecture=EXCLUDED.prefecture,postcode=EXCLUDED.postcode,public_email=EXCLUDED.public_email,
      public_phone=EXCLUDED.public_phone,public_url=EXCLUDED.public_url,payload_hash=EXCLUDED.payload_hash,
      last_checked_at=EXCLUDED.last_checked_at,expires_at=EXCLUDED.expires_at
  `, [
    record.taxNumber, record.gemiNumber, record.legalName, record.tradingName ?? null,
    record.companyStatus ?? null, record.legalType ?? null, record.addressLine1 ?? null,
    record.city ?? null, record.municipality ?? null, record.prefecture ?? null, record.postcode ?? null,
    record.email ?? null, record.phone ?? null, record.url ?? null, payloadHash, now, now + ttlMs
  ]);
}

function arrayField(value: unknown, ...keys: string[]): Record<string, unknown>[] {
  if (!isRecord(value)) return [];
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }
  return [];
}

function stringArrayField(value: unknown, ...keys: string[]): string[] {
  if (!isRecord(value)) return [];
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  }
  return [];
}

function stringField(value: unknown, ...keys: string[]): string {
  if (!isRecord(value)) return "";
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number") return String(candidate);
  }
  return "";
}

function nestedDescription(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!isRecord(value)) return undefined;
  return stringField(value, "descr", "description", "name") || undefined;
}

function normalizeOptionalAfm(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  return digits.length === 9 ? digits : undefined;
}

function digitsOnly(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  return digits || undefined;
}

function normalizeEmail(value: string): string | undefined {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
