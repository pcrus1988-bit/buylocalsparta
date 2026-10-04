import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_GEMI_BASE_URL = "https://opendata-api.businessportal.gr/api/opendata/v1";
const DEFAULT_TIMEOUT_MS = 15_000;
const METADATA_TTL_MS = 6 * 60 * 60 * 1000;
const CREDENTIAL_TTL_MS = 12 * 60 * 60 * 1000;
const PAGE_SIZE = 200;
const ALL_PREFECTURES = "__all_prefectures__";

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

export type GemiAdminActivityGroup = Readonly<{
  id: string;
  label: string;
  description: string;
  activityCount: number;
}>;

export type GemiAdminMetadata = Readonly<{
  activities: readonly GemiAdminActivity[];
  activityGroups: readonly GemiAdminActivityGroup[];
  prefectures: readonly GemiAdminPrefecture[];
  municipalities: readonly GemiAdminMunicipality[];
  fetchedAt: number;
}>;

export type GemiAdminFilters = Readonly<{
  activityIds: readonly string[];
  activityGroupIds: readonly string[];
  prefectureId: string;
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
  matchedActivities: string;
  matchedGroups: string;
}>;

export type GemiAdminPreview = Readonly<{
  totalCount: number;
  returned: number;
  withEmail: number;
  activityCount: number;
  rows: readonly GemiAdminPreviewRow[];
}>;

type GemiActivityGroupDefinition = Readonly<{
  id: string;
  label: string;
  description: string;
  includePrefixes: readonly string[];
  excludePrefixes?: readonly string[];
}>;

type GemiResolvedActivitySelection = Readonly<{
  activityIds: readonly string[];
  activityIdSet: ReadonlySet<string>;
  groups: readonly GemiActivityGroupDefinition[];
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

const ACTIVITY_GROUP_DEFINITIONS: readonly GemiActivityGroupDefinition[] = [
  {
    id: "retail-non-food",
    label: "Λιανική — μη τρόφιμα",
    description: "Λιανικό εμπόριο 47.*, χωρίς τρόφιμα/ποτά/καπνό, καύσιμα και υπηρεσίες διαμεσολάβησης λιανικής.",
    includePrefixes: ["47"],
    excludePrefixes: ["47.11", "47.2", "47.3", "47.9"]
  },
  {
    id: "retail-all",
    label: "Όλο το λιανικό εμπόριο",
    description: "Όλοι οι τρέχοντες ΚΑΔ 47.* του λιανικού εμπορίου.",
    includePrefixes: ["47"]
  },
  {
    id: "retail-food",
    label: "Λιανική — τρόφιμα / ποτά / καπνός",
    description: "Μη εξειδικευμένη λιανική με κυρίαρχα τρόφιμα και εξειδικευμένη λιανική τροφίμων, ποτών και καπνού.",
    includePrefixes: ["47.11", "47.2"]
  },
  {
    id: "wholesale-all",
    label: "Όλο το χονδρικό εμπόριο",
    description: "Όλοι οι τρέχοντες ΚΑΔ 46.* του χονδρικού εμπορίου.",
    includePrefixes: ["46"]
  },
  {
    id: "wholesale-non-food",
    label: "Χονδρική — μη τρόφιμα",
    description: "Χονδρικό εμπόριο 46.*, χωρίς αγροτικές πρώτες ύλες/ζώντα ζώα και τρόφιμα/ποτά/καπνό.",
    includePrefixes: ["46"],
    excludePrefixes: ["46.2", "46.3"]
  },
  {
    id: "wholesale-consumer-goods",
    label: "Χονδρική — καταναλωτικά αγαθά",
    description: "Χονδρικό εμπόριο ειδών οικιακής και προσωπικής κατανάλωσης (46.4*).",
    includePrefixes: ["46.4"]
  },
  {
    id: "fashion-footwear",
    label: "Μόδα / Υποδήματα / Αξεσουάρ",
    description: "Λιανική ένδυσης και υπόδησης και οι αντίστοιχοι βασικοί ΚΑΔ χονδρικής.",
    includePrefixes: ["47.71", "47.72", "46.41", "46.42"]
  },
  {
    id: "beauty-personal-care",
    label: "Καλλυντικά / Ομορφιά / Προσωπική φροντίδα",
    description: "Λιανική καλλυντικών και ειδών προσωπικής φροντίδας, μαζί με τη σχετική χονδρική.",
    includePrefixes: ["47.75", "46.45"]
  },
  {
    id: "home-living",
    label: "Σπίτι / Έπιπλα / Διακόσμηση",
    description: "Υφάσματα, καλύμματα, οικιακές συσκευές, έπιπλα, φωτισμός και συναφή είδη σπιτιού.",
    includePrefixes: ["47.51", "47.53", "47.54", "47.55", "46.43", "46.44", "46.47"]
  },
  {
    id: "diy-building",
    label: "Χρώματα / Εργαλεία / Οικοδομικά",
    description: "Λιανική και χονδρική δομικών υλικών, χρωμάτων, ειδών υδραυλικών και θέρμανσης.",
    includePrefixes: ["47.52", "46.83", "46.84"]
  },
  {
    id: "electronics",
    label: "Ηλεκτρονικά / Ηλεκτρικά",
    description: "ICT, τηλεπικοινωνίες, ηλεκτρονικά και ηλεκτρικές οικιακές συσκευές.",
    includePrefixes: ["47.40", "47.54", "46.5", "46.43"]
  },
  {
    id: "sports-books-toys",
    label: "Αθλητικά / Βιβλία / Παιχνίδια / Hobby",
    description: "Βιβλία, χαρτικά, αθλητικός εξοπλισμός, παιχνίδια και λοιπά πολιτιστικά/ψυχαγωγικά είδη.",
    includePrefixes: ["47.61", "47.62", "47.63", "47.64", "47.69"]
  },
  {
    id: "jewellery-watches",
    label: "Κοσμήματα / Ρολόγια",
    description: "Λιανική και βασική χονδρική ρολογιών και κοσμημάτων.",
    includePrefixes: ["47.77", "46.48"]
  },
  {
    id: "flowers-pets",
    label: "Άνθη / Φυτά / Pet",
    description: "Λιανική ανθέων, φυτών, λιπασμάτων, κατοικίδιων και σχετικών ειδών.",
    includePrefixes: ["47.76"]
  },
  {
    id: "second-hand",
    label: "Μεταχειρισμένα / Second-hand",
    description: "Λιανικό εμπόριο μεταχειρισμένων αγαθών.",
    includePrefixes: ["47.79"]
  },
  {
    id: "automotive-trade",
    label: "Οχήματα / Ανταλλακτικά",
    description: "Χονδρικό και λιανικό εμπόριο οχημάτων, μοτοσικλετών, ανταλλακτικών και αξεσουάρ.",
    includePrefixes: ["46.7", "47.8"]
  }
] as const;

function normalizedKadCode(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function kadPrefixMatches(activityId: string, prefix: string): boolean {
  const code = normalizedKadCode(activityId);
  const wanted = normalizedKadCode(prefix);
  if (!code || !wanted) return false;
  if (code === wanted || code.startsWith(wanted + ".")) return true;
  const digits = code.replace(/\D/g, "");
  const wantedDigits = wanted.replace(/\D/g, "");
  return Boolean(digits && wantedDigits && digits.startsWith(wantedDigits));
}

function activityMatchesGroup(activity: GemiAdminActivity, group: GemiActivityGroupDefinition): boolean {
  if (!group.includePrefixes.some((prefix) => kadPrefixMatches(activity.id, prefix))) return false;
  return !(group.excludePrefixes ?? []).some((prefix) => kadPrefixMatches(activity.id, prefix));
}

function publicActivityGroups(activities: readonly GemiAdminActivity[]): GemiAdminActivityGroup[] {
  return ACTIVITY_GROUP_DEFINITIONS.map((group) => ({
    id: group.id,
    label: group.label,
    description: group.description,
    activityCount: activities.filter((activity) => activityMatchesGroup(activity, group)).length
  })).filter((group) => group.activityCount > 0);
}

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

  const value = {
    activities,
    activityGroups: publicActivityGroups(activities),
    prefectures,
    municipalities,
    fetchedAt: now
  } as const;
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

function idList(value: unknown, label: string, maxItems = 32): string[] {
  const raw = Array.isArray(value)
    ? value.flatMap((item) => String(item ?? "").split(","))
    : String(value ?? "").split(",");
  const ids = [...new Set(raw.map((item) => item.trim()).filter(Boolean).map((item) => oneId(item, label)))];
  if (ids.length > maxItems) throw new Error(`${label} has too many selections.`);
  return ids;
}

export function normalizeGemiAdminFilters(input: {
  activityId?: unknown;
  activityIds?: unknown;
  activityGroupIds?: unknown;
  prefectureId?: unknown;
  municipalityId?: unknown;
  activeOnly?: unknown;
}): GemiAdminFilters {
  const activityIds = idList(input.activityIds ?? input.activityId, "ΚΑΔ");
  const activityGroupIds = idList(input.activityGroupIds, "Ομάδα ΚΑΔ");
  const knownGroups = new Set(ACTIVITY_GROUP_DEFINITIONS.map((group) => group.id));
  const unknownGroup = activityGroupIds.find((id) => !knownGroups.has(id));
  if (unknownGroup) throw new Error("Ομάδα ΚΑΔ is invalid.");
  if (!activityIds.length && !activityGroupIds.length) throw new Error("Επίλεξε ΚΑΔ ή ομάδα ΚΑΔ.");

  const prefectureRaw = String(input.prefectureId ?? "").trim();
  const prefectureId = prefectureRaw ? oneId(prefectureRaw, "Νομός") : ALL_PREFECTURES;
  const municipalityRaw = String(input.municipalityId ?? "").trim();
  const municipalityId = municipalityRaw ? oneId(municipalityRaw, "Δήμος") : undefined;
  if (municipalityId && prefectureId === ALL_PREFECTURES) throw new Error("Νομός is required when Δήμος is selected.");
  const activeOnly = input.activeOnly !== false && input.activeOnly !== "false" && input.activeOnly !== "0";
  return { activityIds, activityGroupIds, prefectureId, municipalityId, activeOnly };
}

async function resolveActivitySelection(filters: GemiAdminFilters, apiKey?: string): Promise<GemiResolvedActivitySelection> {
  const metadata = await gemiAdminMetadata(Date.now(), apiKey);
  const activitiesById = new Map(metadata.activities.map((activity) => [activity.id, activity] as const));
  const unknownActivity = filters.activityIds.find((id) => !activitiesById.has(id));
  if (unknownActivity) throw new Error(`ΚΑΔ ${unknownActivity} is not a current ΓΕΜΗ activity.`);

  const selectedGroups = filters.activityGroupIds.map((id) => {
    const group = ACTIVITY_GROUP_DEFINITIONS.find((candidate) => candidate.id === id);
    if (!group) throw new Error("Ομάδα ΚΑΔ is invalid.");
    return group;
  });

  const activityIds = new Set(filters.activityIds);
  for (const activity of metadata.activities) {
    if (selectedGroups.some((group) => activityMatchesGroup(activity, group))) activityIds.add(activity.id);
  }

  if (!activityIds.size) throw new Error("Η επιλογή ομάδων δεν αντιστοιχεί σε τρέχοντες ΚΑΔ ΓΕΜΗ.");
  return {
    activityIds: [...activityIds].sort((a, b) => a.localeCompare(b, "el", { numeric: true })),
    activityIdSet: activityIds,
    groups: selectedGroups
  };
}

function searchParams(
  filters: GemiAdminFilters,
  selection: GemiResolvedActivitySelection,
  offset: number,
  size: number
): Record<string, string | number | boolean> {
  return {
    activities: selection.activityIds.join(","),
    ...(filters.prefectureId !== ALL_PREFECTURES ? { prefectures: filters.prefectureId } : {}),
    ...(filters.municipalityId ? { municipalities: filters.municipalityId } : {}),
    ...(filters.activeOnly ? { isActive: true } : {}),
    resultsSortBy: "+arGemi",
    resultsOffset: Math.max(0, offset),
    resultsSize: Math.min(PAGE_SIZE, Math.max(1, size))
  };
}

async function searchCompanies(
  filters: GemiAdminFilters,
  selection: GemiResolvedActivitySelection,
  offset: number,
  size: number,
  apiKey?: string
): Promise<{ totalCount: number; companies: GemiCompany[] }> {
  const raw = await gemiGet("/companies", searchParams(filters, selection, offset, size), 4, apiKey) as SearchResponse;
  const companies = Array.isArray(raw.searchResults) ? raw.searchResults.filter((item): item is GemiCompany => Boolean(objectField(item))) : [];
  const totalCount = Number(raw.searchMetadata?.totalCount ?? companies.length);
  return { totalCount: Number.isFinite(totalCount) && totalCount >= 0 ? totalCount : companies.length, companies };
}

function matchedCompanyActivityEntries(
  company: GemiCompany,
  selection: GemiResolvedActivitySelection
): Array<Record<string, unknown>> {
  return companyActivities(company).filter((entry) => {
    const activity = objectField(entry.activity);
    return activity ? selection.activityIdSet.has(asString(activity.id)) : false;
  });
}

function matchedGroupLabels(company: GemiCompany, selection: GemiResolvedActivitySelection): string[] {
  const activities = companyActivities(company).flatMap((entry) => {
    const activity = objectField(entry.activity);
    if (!activity) return [];
    const id = asString(activity.id);
    const descr = asString(activity.descr);
    return id ? [{ id, descr }] : [];
  });
  return selection.groups
    .filter((group) => activities.some((activity) => activityMatchesGroup(activity, group)))
    .map((group) => group.label);
}

function companyPreview(company: GemiCompany, selection: GemiResolvedActivitySelection): GemiAdminPreviewRow {
  const matched = matchedCompanyActivityEntries(company, selection);
  const matchedActivities = matched.map((entry) => {
    const activity = objectField(entry.activity);
    if (!activity) return "";
    const id = asString(activity.id);
    const descr = asString(activity.descr);
    return id ? `${id}${descr ? ` · ${descr}` : ""}` : "";
  }).filter(Boolean).join(" | ");

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
    website: asString(company.url),
    matchedActivities,
    matchedGroups: matchedGroupLabels(company, selection).join(" | ")
  };
}

export async function gemiAdminPreview(filters: GemiAdminFilters, apiKey?: string): Promise<GemiAdminPreview> {
  const selection = await resolveActivitySelection(filters, apiKey);
  const page = await searchCompanies(filters, selection, 0, 25, apiKey);
  const rows = page.companies.map((company) => companyPreview(company, selection));
  return {
    totalCount: page.totalCount,
    returned: rows.length,
    withEmail: rows.filter((row) => row.email).length,
    activityCount: selection.activityIds.length,
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

function activityValuesFromEntries(entries: readonly Record<string, unknown>[], field: "id" | "descr" | "kadVersion"): string {
  return entries.map((entry) => {
    const activity = objectField(entry.activity);
    return activity ? asString(activity[field]) : "";
  }).filter(Boolean).join(" | ");
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
  "matched_activity_codes",
  "matched_activity_descriptions",
  "matched_kad_groups",
  "selected_kad",
  "selected_kads",
  "selected_kad_groups",
  "selected_prefecture_id",
  "selected_municipality_id"
] as const;

function companyCsvRow(
  company: GemiCompany,
  filters: GemiAdminFilters,
  selection: GemiResolvedActivitySelection
): string {
  const matchedEntries = matchedCompanyActivityEntries(company, selection);
  const selectedGroupLabels = selection.groups.map((group) => group.label);
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
    activityValuesFromEntries(matchedEntries, "id"),
    activityValuesFromEntries(matchedEntries, "descr"),
    matchedGroupLabels(company, selection).join(" | "),
    filters.activityIds[0] ?? "",
    filters.activityIds.join(" | "),
    selectedGroupLabels.join(" | "),
    filters.prefectureId === ALL_PREFECTURES ? "" : filters.prefectureId,
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
  let selectionPromise: Promise<GemiResolvedActivitySelection> | undefined;
  const seen = new Set<string>();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return;
      try {
        if (!headerSent) {
          controller.enqueue(encoder.encode("\uFEFF" + CSV_HEADERS.map(csvCell).join(",") + "\r\n"));
          headerSent = true;
        }

        const selection = await (selectionPromise ??= resolveActivitySelection(filters, apiKey));
        const page = await searchCompanies(filters, selection, offset, PAGE_SIZE, apiKey);
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
          chunk += companyCsvRow(company, filters, selection);
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
  const selectionPart = filters.activityGroupIds.length
    ? `groups-${filters.activityGroupIds.join("-")}`
    : `kad-${filters.activityIds.join("-")}`;
  const parts = [
    "kontamou-gemi",
    selectionPart,
    filters.municipalityId
      ? `municipality-${filters.municipalityId}`
      : filters.prefectureId !== ALL_PREFECTURES
        ? `prefecture-${filters.prefectureId}`
        : "all-prefectures",
    filters.activeOnly ? "active" : "all"
  ];
  return parts.join("_").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 180) + ".csv";
}
