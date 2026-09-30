import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_GEMI_BASE_URL = "https://opendata-api.businessportal.gr/api/opendata/v1";
const DEFAULT_TIMEOUT_MS = 15_000;
const METADATA_TTL_MS = 6 * 60 * 60 * 1000;
const CREDENTIAL_TTL_MS = 12 * 60 * 60 * 1000;
const PAGE_SIZE = 200;

export type GemiAdminActivity = Readonly<{
  id: string;
  descr: string;
  descrEn?: string;
  kadVersion?: string;
}>;

export type GemiAdminPrefecture = Readonly<{
  id: string;
  descr: string;
  descrEn?: string;
}>;

export type GemiAdminMunicipality = Readonly<{
  id: string;
  prefectureId: string;
  descr: string;
  descrEn?: string;
}>;

export type GemiAdminMetadata = Readonly<{
  activities: readonly GemiAdminActivity[];
  prefectures: readonly GemiAdminPrefecture[];
  municipalities: readonly GemiAdminMunicipality[];
  fetchedAt: number;
}>;

export type GemiAdminFilters = Readonly<{
  activityId: string;
  prefectureId?: string;
  municipalityId?: string;
  activeOnly: boolean;
}>;

export type GemiAdminPreviewRow = Readonly<{
  gemiNumber: string;
  afm: string;
  legalName: string;
  tradingNames: string;
  status: string;
  prefecture: string;
  municipality: string;
  city: string;
  postcode: string;
  email: string;
  website: string;
}>;

export type GemiAdminPreview = Readonly<{
  totalCount: number;
  returned: number;
  withEmail: number;
  rows: readonly GemiAdminPreviewRow[];
}>;

type GemiCompany = Record<string, unknown>;
type SearchResponse = Readonly<{
  searchMetadata?: { totalCount?: number; resultsOffset?: number; resultsSize?: string | number };
  searchResults?: GemiCompany[];
}>;

type MetadataCache = { value?: GemiAdminMetadata; expiresAt: number };
type CredentialCache = { value?: string; expiresAt: number; pending?: Promise<string | undefined> };
const metadataCacheKey = "__kontaMouGemiAdminMetadata" as const;
const credentialCacheKey = "__kontaMouGemiAdminCredential" as const;
type Globals = typeof globalThis & {
  [metadataCacheKey]?: MetadataCache;
  [credentialCacheKey]?: CredentialCache;
};
const globals = globalThis as Globals;

async function gemiApiKey(now = Date.now()): Promise<string | undefined> {
  const direct = process.env.GEMI_OPENDATA_API_KEY?.trim();
  if (direct) return direct;

  const cache = globals[credentialCacheKey] ?? (globals[credentialCacheKey] = { expiresAt: 0 });
  if (cache.value && cache.expiresAt > now) return cache.value;
  if (cache.pending) return cache.pending;
  if (!productionDatabaseConfigured()) return undefined;

  cache.pending = (async () => {
    try {
      const result = await getProductionPostgresRuntime().nativePool.query<{ decrypted_secret: string | null }>(
        "SELECT bls_private.get_gemi_opendata_api_key() AS decrypted_secret"
      );
      const value = result.rows[0]?.decrypted_secret?.trim() || undefined;
      if (value) {
        cache.value = value;
        cache.expiresAt = Date.now() + CREDENTIAL_TTL_MS;
      }
      return value;
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "gemi.admin_credential_lookup_failed",
        message: error instanceof Error ? error.message : String(error)
      }));
      return undefined;
    } finally {
      cache.pending = undefined;
    }
  })();

  return cache.pending;
}

export async function gemiAdminCredential(): Promise<string | undefined> {
  return gemiApiKey();
}

function gemiBaseUrl(): string {
  return (process.env.GEMI_OPENDATA_BASE_URL?.trim() || DEFAULT_GEMI_BASE_URL).replace(/\/+$/, "");
}

async function gemiGet(path: string, params: Record<string, string | number | boolean> = {}, attempts = 4, apiKey?: string): Promise<unknown> {
  const key = apiKey?.trim() || await gemiApiKey();
  if (!key) throw new Error("ΓΕΜΗ API credential is not configured.");

  const url = new URL(`${gemiBaseUrl()}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.GEMI_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", api_key: key },
        cache: "no-store",
        signal: controller.signal
      });
      const text = await response.text();
      if (response.status === 404 && path === "/companies") return { searchMetadata: { totalCount: 0 }, searchResults: [] };
      if (response.ok) return text ? JSON.parse(text) as unknown : {};
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`ΓΕΜΗ HTTP ${response.status}: ${text.slice(0, 240)}`);
      }
      lastError = new Error(`ΓΕΜΗ HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
  }
  throw lastError ?? new Error("ΓΕΜΗ request failed.");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

function objectField(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function nestedDescr(value: unknown): string {
  const item = objectField(value);
  return item ? asString(item.descr ?? item.description ?? item.name) : asString(value);
}

function normalizeMetadataArray<T>(value: unknown, mapper: (item: Record<string, unknown>) => T | undefined): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = objectField(entry);
    if (!item) return [];
    const mapped = mapper(item);
    return mapped ? [mapped] : [];
  });
}

export async function gemiAdminMetadata(now = Date.now(), apiKey?: string): Promise<GemiAdminMetadata> {
  const cache = globals[metadataCacheKey] ?? (globals[metadataCacheKey] = { expiresAt: 0 });
  if (cache.value && cache.expiresAt > now) return cache.value;

  const [activitiesRaw, prefecturesRaw, municipalitiesRaw] = await Promise.all([
    gemiGet("/metadata/activities", {}, 4, apiKey),
    gemiGet("/metadata/prefectures", {}, 4, apiKey),
    gemiGet("/metadata/municipalities", {}, 4, apiKey)
  ]);

  // The ΓΕΜΗ metadata feed contains both historical KAD 2008 and current KAD 2026
  // rows. GET /companies searches current company activities, so exposing legacy
  // codes in the prospecting picker creates false "0 results" responses. Keep
  // unversioned rows as a compatibility fallback, but prefer only the current
  // 2026 vocabulary for operational partner prospecting.
  const activities = normalizeMetadataArray(activitiesRaw, (item) => {
    const id = asString(item.id);
    const descr = asString(item.descr);
    if (!id || !descr) return undefined;
    return { id, descr, descrEn: asString(item.descrEn) || undefined, kadVersion: asString(item.kadVersion) || undefined };
  }).filter((activity) => {
    const version = activity.kadVersion?.trim().toLocaleLowerCase("en") ?? "";
    return !version || version.includes("2026");
  }).sort((a, b) => a.id.localeCompare(b.id, "el", { numeric: true }));

  const prefectures = normalizeMetadataArray(prefecturesRaw, (item) => {
    const id = asString(item.id);
    const descr = asString(item.descr);
    if (!id || !descr) return undefined;
    return { id, descr, descrEn: asString(item.descrEn) || undefined };
  }).sort((a, b) => a.descr.localeCompare(b.descr, "el", { sensitivity: "base" }));

  const municipalities = normalizeMetadataArray(municipalitiesRaw, (item) => {
    const id = asString(item.id);
    const prefectureId = asString(item.prefectureId);
    const descr = asString(item.descr);
    if (!id || !prefectureId || !descr) return undefined;
    return { id, prefectureId, descr, descrEn: asString(item.descrEn) || undefined };
  }).sort((a, b) => a.descr.localeCompare(b.descr, "el", { sensitivity: "base" }));

  const value = { activities, prefectures, municipalities, fetchedAt: now } as const;
  cache.value = value;
  cache.expiresAt = now + METADATA_TTL_MS;
  return value;
}

function oneId(value: unknown, label: string): string {
  const id = String(value ?? "").trim();
  if (!id || id.length > 64 || id.includes(",")) throw new Error(`${label} is required.`);
  if (!/^[0-9A-Za-z._-]+$/.test(id)) throw new Error(`${label} is invalid.`);
  return id;
}

export function normalizeGemiAdminFilters(input: {
  activityId?: unknown;
  prefectureId?: unknown;
  municipalityId?: unknown;
  activeOnly?: unknown;
}): GemiAdminFilters {
  const activityId = oneId(input.activityId, "ΚΑΔ");
  const prefectureRaw = String(input.prefectureId ?? "").trim();
  const prefectureId = prefectureRaw ? oneId(prefectureRaw, "Νομός") : undefined;
  const municipalityRaw = String(input.municipalityId ?? "").trim();
  const municipalityId = municipalityRaw ? oneId(municipalityRaw, "Δήμος") : undefined;
  if (municipalityId && !prefectureId) throw new Error("Νομός is required when Δήμος is selected.");
  const activeOnly = input.activeOnly !== false && input.activeOnly !== "false" && input.activeOnly !== "0";
  return { activityId, prefectureId, municipalityId, activeOnly };
}

function searchParams(filters: GemiAdminFilters, offset: number, size: number): Record<string, string | number | boolean> {
  return {
    activities: filters.activityId,
    ...(filters.prefectureId ? { prefectures: filters.prefectureId } : {}),
    ...(filters.municipalityId ? { municipalities: filters.municipalityId } : {}),
    ...(filters.activeOnly ? { isActive: true } : {}),
    resultsSortBy: "+arGemi",
    resultsOffset: Math.max(0, offset),
    resultsSize: Math.min(PAGE_SIZE, Math.max(1, size))
  };
}

async function searchCompanies(filters: GemiAdminFilters, offset: number, size: number, apiKey?: string): Promise<{ totalCount: number; companies: GemiCompany[] }> {
  const raw = await gemiGet("/companies", searchParams(filters, offset, size), 4, apiKey) as SearchResponse;
  const companies = Array.isArray(raw.searchResults) ? raw.searchResults.filter((item): item is GemiCompany => Boolean(objectField(item))) : [];
  const totalCount = Number(raw.searchMetadata?.totalCount ?? companies.length);
  return { totalCount: Number.isFinite(totalCount) && totalCount >= 0 ? totalCount : companies.length, companies };
}

function companyPreview(company: GemiCompany): GemiAdminPreviewRow {
  return {
    gemiNumber: asString(company.arGemi),
    afm: asString(company.afm),
    legalName: asString(company.coNameEl),
    tradingNames: asStringArray(company.coTitlesEl).join(" | "),
    status: nestedDescr(company.status),
    prefecture: nestedDescr(company.prefecture),
    municipality: nestedDescr(company.municipality),
    city: asString(company.city),
    postcode: asString(company.zipCode),
    email: asString(company.email).toLowerCase(),
    website: asString(company.url)
  };
}

export async function gemiAdminPreview(filters: GemiAdminFilters, apiKey?: string): Promise<GemiAdminPreview> {
  const page = await searchCompanies(filters, 0, 25, apiKey);
  const rows = page.companies.map(companyPreview);
  return {
    totalCount: page.totalCount,
    returned: rows.length,
    withEmail: rows.filter((row) => row.email).length,
    rows
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function companyActivities(company: GemiCompany): Array<Record<string, unknown>> {
  return Array.isArray(company.activities)
    ? company.activities.flatMap((entry) => {
        const item = objectField(entry);
        return item ? [item] : [];
      })
    : [];
}

function activityValues(company: GemiCompany, field: "id" | "descr" | "kadVersion"): string {
  return companyActivities(company).map((entry) => {
    const activity = objectField(entry.activity);
    return activity ? asString(activity[field]) : "";
  }).filter(Boolean).join(" | ");
}

function activityTypes(company: GemiCompany): string {
  return companyActivities(company).map((entry) => asString(entry.type)).filter(Boolean).join(" | ");
}

const CSV_HEADERS = [
  "gemi_number",
  "afm",
  "legal_name_el",
  "legal_names_en",
  "trade_names_el",
  "trade_names_en",
  "company_status",
  "legal_type",
  "gemi_office",
  "prefecture",
  "municipality",
  "city",
  "street",
  "street_number",
  "postcode",
  "po_box",
  "email",
  "phone",
  "website",
  "incorporation_date",
  "last_status_change",
  "is_branch",
  "auto_registered",
  "objective",
  "activity_codes",
  "activity_descriptions",
  "activity_types",
  "activity_versions",
  "selected_kad",
  "selected_prefecture_id",
  "selected_municipality_id"
] as const;

function companyCsvRow(company: GemiCompany, filters: GemiAdminFilters): string {
  const values = [
    asString(company.arGemi),
    asString(company.afm),
    asString(company.coNameEl),
    asStringArray(company.coNamesEn).join(" | "),
    asStringArray(company.coTitlesEl).join(" | "),
    asStringArray(company.coTitlesEn).join(" | "),
    nestedDescr(company.status),
    nestedDescr(company.legalType),
    nestedDescr(company.gemiOffice),
    nestedDescr(company.prefecture),
    nestedDescr(company.municipality),
    asString(company.city),
    asString(company.street),
    asString(company.streetNumber),
    asString(company.zipCode),
    asString(company.poBox),
    asString(company.email).toLowerCase(),
    asString(company.phone ?? company.telephone ?? company.phoneNumber),
    asString(company.url),
    asString(company.incorporationDate),
    asString(company.lastStatusChange),
    typeof company.isBranch === "boolean" ? String(company.isBranch) : "",
    typeof company.autoRegistered === "boolean" ? String(company.autoRegistered) : "",
    asString(company.objective),
    activityValues(company, "id"),
    activityValues(company, "descr"),
    activityTypes(company),
    activityValues(company, "kadVersion"),
    filters.activityId,
    filters.prefectureId ?? "",
    filters.municipalityId ?? ""
  ];
  return values.map(csvCell).join(",") + "\r\n";
}

export function gemiAdminCsvStream(filters: GemiAdminFilters, apiKey?: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let offset = 0;
  let totalCount: number | undefined;
  let headerSent = false;
  let closed = false;
  const seen = new Set<string>();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return;
      try {
        if (!headerSent) {
          controller.enqueue(encoder.encode("\uFEFF" + CSV_HEADERS.map(csvCell).join(",") + "\r\n"));
          headerSent = true;
        }

        const page = await searchCompanies(filters, offset, PAGE_SIZE, apiKey);
        if (totalCount === undefined) totalCount = page.totalCount;

        if (!page.companies.length) {
          closed = true;
          controller.close();
          return;
        }

        let chunk = "";
        for (const company of page.companies) {
          const gemi = asString(company.arGemi);
          if (gemi && seen.has(gemi)) continue;
          if (gemi) seen.add(gemi);
          chunk += companyCsvRow(company, filters);
        }
        if (chunk) controller.enqueue(encoder.encode(chunk));

        offset += page.companies.length;
        if (offset >= (totalCount ?? offset) || page.companies.length < PAGE_SIZE) {
          closed = true;
          controller.close();
        }
      } catch (error) {
        closed = true;
        controller.error(error);
      }
    },
    cancel() {
      closed = true;
    }
  });
}

export function gemiAdminCsvFilename(filters: GemiAdminFilters): string {
  const parts = [
    "kontamou-gemi",
    filters.activityId,
    filters.municipalityId
      ? `municipality-${filters.municipalityId}`
      : filters.prefectureId
        ? `prefecture-${filters.prefectureId}`
        : "all-prefectures",
    filters.activeOnly ? "active" : "all"
  ];
  return parts.join("_").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 180) + ".csv";
}
