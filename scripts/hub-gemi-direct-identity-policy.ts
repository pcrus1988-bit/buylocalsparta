/**
 * Independent factual GEMI identity matching, without any publication rights.
 *
 * A municipality directory classification never becomes an exact address,
 * active seller, approved privacy assessment or public search listing.
 */
export const MAX_DIRECT_GEMI_BATCH = 12;
export const GEMI_PROVIDER_SPACING_MS = 30_500;
export type DirectGemiOptions = Readonly<{ apply: boolean; limit: number; after: string; hub: string }>;
export type CandidateIdentity = Readonly<{
  gemi_number: string; legal_name: string; postcode: string;
  registry_municipality_id: string; directory_hub_slug: string;
}>;

export function parseDirectGemiOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env
): DirectGemiOptions {
  const accepted = /^(--apply|--limit=[0-9]+|--hub=[a-z0-9-]+|--after=[0-9]{8,20})$/;
  if (args.some(arg => !accepted.test(arg))) throw new Error("Invalid direct GEMI verification argument");
  if (new Set(args.map(arg => arg.split("=")[0])).size !== args.length) {
    throw new Error("Duplicate direct GEMI argument");
  }
  const value = (name: string) => args.find(arg => arg.startsWith(name + "="))?.slice(name.length + 1);
  const apply = args.includes("--apply");
  const limit = Number(value("--limit") ?? "3");
  const after = value("--after") ?? "";
  const hub = value("--hub") ?? "";
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_DIRECT_GEMI_BATCH) {
    throw new Error("Direct GEMI batch exceeds safe bound");
  }
  if (hub && (hub.length > 80 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(hub))) {
    throw new Error("Invalid HUB slug");
  }
  if (apply && env.KM_GEMI_OFFICIAL_IDENTITY_VERIFY_APPROVED !== "true") {
    throw new Error("Explicit approval for official GEMI API verification required");
  }
  return { apply, limit, after, hub };
}

export const directGemiCandidatesSql = [
  "SELECT d.gemi_number,d.legal_name,d.postcode,d.registry_municipality_id,d.directory_hub_slug",
  "FROM research_private.hub_gemi_directory d",
  "WHERE d.gemi_number>$2 AND ($3='' OR d.directory_hub_slug=$3)",
  "AND d.publication_basis='municipality'",
  "AND d.directory_hub_slug IS NOT NULL AND d.display_status='unpublished'",
  "AND d.registry_verified_at IS NULL",
  "AND d.source_checked_at>=now()-interval '90 days'",
  "AND d.gemi_number ~ '^[0-9]{8,20}$'",
  "AND d.postcode ~ '^[0-9]{5}$'",
  "AND length(btrim(d.legal_name))>=5",
  "AND EXISTS (SELECT 1 FROM research_private.hub_gemi_municipality_matches m",
  "JOIN research_private.hub_gemi_hub_master hub",
  "ON hub.hub_id=m.candidate_hub_id AND hub.hub_slug=m.candidate_hub_slug",
  "WHERE m.registry_municipality_id=d.registry_municipality_id",
  "AND m.review_status='reviewed'",
  "AND m.candidate_hub_slug=d.directory_hub_slug",
  "AND m.candidate_hub_distance_km<=hub.radius_km)",
  "AND NOT EXISTS (SELECT 1 FROM public.vendor_businesses v",
  "WHERE v.gemi_number=d.gemi_number AND v.status='active' AND v.public_directory_visible=true)",
  "AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h",
  "WHERE h.gemi_number=d.gemi_number AND h.status='converted' AND h.owner_user_id IS NOT NULL)",
  "ORDER BY d.gemi_number LIMIT $1"
].join("\n");

export const directGemiUpdateSql = [
  "UPDATE research_private.hub_gemi_directory d",
  "SET registry_verified_at=now(),registry_verification_ref=$5,",
  "registry_verified_by='automation:official-gemi-live-exact-v1',updated_at=now()",
  "WHERE d.gemi_number=$1 AND d.legal_name=$2 AND d.postcode=$3",
  "AND d.registry_municipality_id=$4 AND d.directory_hub_slug=$6",
  "AND d.display_status='unpublished' AND d.registry_verified_at IS NULL",
  "AND d.publication_basis='municipality'",
  "AND d.source_checked_at>=now()-interval '90 days'",
  "AND EXISTS (SELECT 1 FROM research_private.hub_gemi_municipality_matches m",
  "JOIN research_private.hub_gemi_hub_master hub",
  "ON hub.hub_id=m.candidate_hub_id AND hub.hub_slug=m.candidate_hub_slug",
  "WHERE m.registry_municipality_id=d.registry_municipality_id",
  "AND m.review_status='reviewed' AND m.candidate_hub_slug=d.directory_hub_slug",
  "AND m.candidate_hub_distance_km<=hub.radius_km)",
  "AND NOT EXISTS (SELECT 1 FROM public.vendor_businesses v",
  "WHERE v.gemi_number=d.gemi_number AND v.status='active' AND v.public_directory_visible=true)",
  "AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h",
  "WHERE h.gemi_number=d.gemi_number AND h.status='converted' AND h.owner_user_id IS NOT NULL)",
  "RETURNING d.gemi_number"
].join("\n");

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function asString(value: unknown): string {
  return typeof value === "string" ? value.trim()
    : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
}
function digits(value: unknown): string {
  const s = asString(value);
  return /^[0-9]+$/.test(s) ? s.replace(/^0+(?=[0-9])/, "") : "";
}
function normName(value: unknown): string {
  return asString(value).normalize("NFD").toLocaleLowerCase("el")
    .replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
}

/** Fail closed when any identity, administrative municipality or status field differs. */
export function exactGemiIdentityMatch(
  candidate: CandidateIdentity, payload: unknown
): boolean {
  const company = object(payload);
  if (!company || company.autoRegistered === false) return false;
  const status = object(company.status);
  const municipality = object(company.municipality);
  if (!status || !municipality) return false;
  return digits(company.arGemi) !== "" &&
    digits(company.arGemi) === digits(candidate.gemi_number) &&
    normName(company.coNameEl).length >= 5 &&
    normName(company.coNameEl) === normName(candidate.legal_name) &&
    asString(company.zipCode) === candidate.postcode &&
    digits(municipality.id) !== "" &&
    digits(municipality.id) === digits(candidate.registry_municipality_id) &&
    normName(status.descr) === "ενεργη";
}
