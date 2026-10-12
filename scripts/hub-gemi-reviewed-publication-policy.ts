/**
 * Reviewed GEMI municipality publication policy.
 * Pure SQL and argument validation, deliberately safe to import in tests.
 */
export const MAX_PUBLICATION_BATCH = 500;
export type PublicationOptions = Readonly<{ limit: number; after: string; hub: string; apply: boolean }>;
const HUB_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GEMI_NUMBER = /^[0-9]{8,20}$/;

export function parsePublicationOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env
): PublicationOptions {
  if (args.some(arg => !(arg === "--apply" || arg.startsWith("--limit=") ||
    arg.startsWith("--after=") || arg.startsWith("--hub=")))) {
    throw new Error("Supported flags: --limit=N --after=GEMI --hub=slug --apply");
  }
  if (new Set(args.map(arg => arg.split("=")[0])).size !== args.length) {
    throw new Error("Duplicate publication argument");
  }
  const value = (name: string) => args.find(arg => arg.startsWith(name + "="))?.slice(name.length + 1);
  const limit = Number(value("--limit") ?? "100");
  const after = value("--after") ?? "";
  const hub = value("--hub") ?? "";
  const apply = args.includes("--apply");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PUBLICATION_BATCH) {
    throw new Error("Batch limit must be 1.." + MAX_PUBLICATION_BATCH);
  }
  if (after && !GEMI_NUMBER.test(after)) throw new Error("Invalid GEMI cursor");
  if (hub && (hub.length > 80 || !HUB_SLUG.test(hub))) throw new Error("Invalid HUB slug");
  if (apply && env.KM_GEMI_REVIEWED_PUBLICATION_APPROVED !== "true") {
    throw new Error("Explicit approval to run reviewed-only publication is required");
  }
  return { limit, after, hub, apply };
}

// Administrative municipality grouping is not legal, editorial, ownership or
// exact-GEO approval. These independent database gates must all be satisfied.
// Values are bound parameters; never interpolate CLI input into these strings.
const candidateConditions = [
  "d.publication_basis='municipality'",
  "AND d.display_status='unpublished'",
  "AND d.gemi_number>$2",
  "AND ($3='' OR d.directory_hub_slug=$3)",
  "AND d.directory_hub_slug IS NOT NULL",
  "AND d.seo_approved=true",
  "AND d.public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'",
  "AND length(d.public_slug)<=128",
  "AND nullif(btrim(d.legal_name),'') IS NOT NULL",
  "AND d.source_checked_at>=now()-interval '90 days'",
  "AND d.registry_verified_at>=now()-interval '30 days'",
  "AND length(btrim(d.registry_verification_ref))>=12",
  "AND nullif(btrim(d.registry_verified_by),'') IS NOT NULL",
  "AND d.privacy_review_status='approved'",
  "AND d.privacy_reviewed_at IS NOT NULL",
  "AND nullif(btrim(d.privacy_reviewer_id),'') IS NOT NULL",
  "AND d.editorial_reviewed_at IS NOT NULL",
  "AND nullif(btrim(d.editorial_reviewer_id),'') IS NOT NULL",
  "AND nullif(btrim(d.publication_evidence_note),'') IS NOT NULL",
  "AND EXISTS (SELECT 1 FROM research_private.hub_gemi_municipality_matches m",
  "JOIN research_private.hub_gemi_hub_master hm",
  "ON hm.hub_id=m.candidate_hub_id AND hm.hub_slug=m.candidate_hub_slug",
  "WHERE m.registry_municipality_id=d.registry_municipality_id",
  "AND m.candidate_hub_slug=d.directory_hub_slug",
  "AND m.review_status='reviewed'",
  "AND m.candidate_hub_distance_km<=hm.radius_km)",
  "AND NOT EXISTS (SELECT 1 FROM public.vendor_businesses v",
  "WHERE v.gemi_number=d.gemi_number",
  "AND v.status='active' AND v.public_directory_visible=true)",
  "AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h",
  "WHERE h.gemi_number=d.gemi_number",
  "AND h.status='converted' AND h.owner_user_id IS NOT NULL)"
].join("\n  ");

function candidates(lockRows: boolean): string {
  return "WITH candidates AS MATERIALIZED (" +
    " SELECT d.gemi_number FROM research_private.hub_gemi_directory d WHERE " +
    candidateConditions + " ORDER BY d.gemi_number LIMIT $1" +
    (lockRows ? " FOR UPDATE OF d SKIP LOCKED" : "") + ")";
}

export const reviewedPublicationPreviewSql = candidates(false) +
  " SELECT count(*)::integer AS selected,max(gemi_number) AS last_gemi FROM candidates";

export const reviewedPublicationWriteSql = candidates(true) +
  ",published AS (UPDATE research_private.hub_gemi_directory d" +
  " SET display_status='published',updated_at=now() FROM candidates c" +
  " WHERE d.gemi_number=c.gemi_number AND d.display_status='unpublished'" +
  " RETURNING d.gemi_number)" +
  " SELECT count(*)::integer AS selected," +
  " (SELECT max(gemi_number) FROM candidates) AS last_gemi FROM published";
