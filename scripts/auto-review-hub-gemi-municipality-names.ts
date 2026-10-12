/**
 * Owner-authorized, deterministic review of GEMI administrative municipality
 * NAME correspondence only. NEVER a geocoding or publication operation.
 *
 * Dry run: POSTGRES_URL=... node --experimental-strip-types scripts/auto-review-hub-gemi-municipality-names.ts
 * Apply:   KM_GEMI_NAME_AUTO_REVIEW_OWNER_APPROVED=true ... --apply
 *
 * Writes are bounded, stale-check protected, atomic with audit events, and
 * clearly identified as automation (not a fabricated human reviewer).
 */
import { Pool } from "pg";
import {
  GEMI_AUTO_REVIEW_ACTOR, municipalityAutoReviewReason,
  type MunicipalityAutoReviewCandidate
} from "../apps/web/src/lib/hub-gemi-municipality-auto-review.ts";

const args = process.argv.slice(2);
if (args.some((arg) => !/^--apply$|^--limit=[0-9]{1,4}$/.test(arg))) {
  throw new Error("Only --apply and --limit=N are supported");
}
const apply = args.includes("--apply");
const rawLimit = args.find((arg) => arg.startsWith("--limit="))?.slice(8) ?? "200";
const limit = Number(rawLimit);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
  throw new Error("Review limit must be 1..500");
}
if (apply && process.env.KM_GEMI_NAME_AUTO_REVIEW_OWNER_APPROVED !== "true") {
  throw new Error("Owner-authorized automation flag required for --apply");
}
const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Private PostgreSQL URL required");

type InputRow = Readonly<{
  registry_municipality_id: string;
  gazetteer_source_id: string;
  municipality_name: string;
  review_status: string;
  match_method: string;
  source_region: string | null;
  hub_region_code: string | null;
  candidate_hub_distance_km: string | number | null;
  source_match_count: number | string;
  candidate_hub_id: string | null;
  candidate_hub_slug: string | null;
  matching_business_count: number;
  checked_at: string | Date;
}>;

const source = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8000 });
try {
  const rows = await source.query<InputRow>(
    "SELECT m.registry_municipality_id,m.gazetteer_source_id,g.municipality_name," +
    "m.review_status,m.match_method,g.source_region,h.region_code AS hub_region_code," +
    "m.candidate_hub_distance_km,m.candidate_hub_id,m.candidate_hub_slug," +
    "m.matching_business_count,m.checked_at," +
    "(SELECT count(*)::integer FROM research_private.hub_gemi_municipality_matches peer " +
    "WHERE peer.gazetteer_source_id=m.gazetteer_source_id) AS source_match_count " +
    "FROM research_private.hub_gemi_municipality_matches m " +
    "JOIN research_private.hub_gemi_municipality_centroids g ON g.source_id=m.gazetteer_source_id " +
    "LEFT JOIN research_private.hub_gemi_hub_master h ON h.hub_id=m.candidate_hub_id " +
    "AND h.hub_slug=m.candidate_hub_slug " +
    "WHERE m.review_status='proposed' " +
    "ORDER BY m.matching_business_count DESC,m.registry_municipality_id LIMIT $1",
    [limit]
  );
  const eligible = rows.rows.flatMap((row) => {
    const candidate: MunicipalityAutoReviewCandidate = {
      municipalityId: row.registry_municipality_id,
      sourceId: row.gazetteer_source_id,
      sourceName: row.municipality_name,
      reviewStatus: row.review_status,
      matchMethod: row.match_method,
      sourceRegion: row.source_region,
      hubRegionCode: row.hub_region_code,
      centroidDistanceKm: row.candidate_hub_distance_km,
      sourceMatchCount: Number(row.source_match_count),
      hubId: row.candidate_hub_id,
      hubSlug: row.candidate_hub_slug
    };
    const reason = municipalityAutoReviewReason(candidate);
    return reason ? [{
      municipality_id: candidate.municipalityId, source_id: candidate.sourceId,
      hub_id: candidate.hubId, hub_slug: candidate.hubSlug,
      name_method: candidate.matchMethod,
      source_region: candidate.sourceRegion, hub_region: candidate.hubRegionCode,
      source_name: candidate.sourceName, checked_at: row.checked_at,
      reason, businesses: Number(row.matching_business_count)
    }] : [];
  });

  let changed = 0;
  let journalEvents = 0;
  let records = 0;
  if (apply && eligible.length) {
    const result = await source.query<{
      reviews: string | number; events: string | number; represented: string | number;
    }>(
      "WITH data AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(" +
      "municipality_id text,source_id text,hub_id text,hub_slug text,name_method text," +
      "source_region text,hub_region text,source_name text,checked_at timestamptz," +
      "reason text,businesses integer)), " +
      "verified AS (SELECT x.* FROM data x " +
      "JOIN research_private.hub_gemi_municipality_matches m " +
      "ON m.registry_municipality_id=x.municipality_id AND m.gazetteer_source_id=x.source_id " +
      "JOIN research_private.hub_gemi_municipality_centroids g " +
      "ON g.source_id=m.gazetteer_source_id " +
      "JOIN research_private.hub_gemi_hub_master h ON h.hub_id=m.candidate_hub_id " +
      "AND h.hub_slug=m.candidate_hub_slug " +
      "WHERE m.review_status='proposed' AND m.checked_at=x.checked_at " +
      "AND m.match_method=x.name_method " +
      "AND m.candidate_hub_distance_km BETWEEN 0 AND 25 " +
      "AND m.candidate_hub_id=x.hub_id AND m.candidate_hub_slug=x.hub_slug " +
      "AND g.municipality_name=x.source_name AND g.source_region=x.source_region " +
      "AND h.region_code=x.hub_region " +
      "AND x.hub_region=CASE g.source_region " +
      "WHEN 'Αττικής' THEN 'ATT' WHEN 'Κεντρικής Μακεδονίας' THEN 'CMC' " +
      "WHEN 'Κρήτης' THEN 'CRE' WHEN 'Πελοποννήσου' THEN 'PEL' " +
      "WHEN 'Ανατολικής Μακεδονίας και Θράκης' THEN 'EMT' " +
      "WHEN 'Ηπείρου' THEN 'EPI' WHEN 'Θεσσαλίας' THEN 'THS' " +
      "WHEN 'Δυτικής Μακεδονίας' THEN 'WMC' WHEN 'Στερεάς Ελλάδας' THEN 'CGR' " +
      "WHEN 'Δυτικής Ελλάδας' THEN 'WGR' WHEN 'Νοτίου Αιγαίου' THEN 'SAE' " +
      "WHEN 'Βορείου Αιγαίου' THEN 'NAE' WHEN 'Ιονίων Νήσων' THEN 'ION' ELSE NULL END " +
      "AND g.municipality_name NOT IN ('Spetses','Agkistri','Agathonisi') " +
      "AND (SELECT count(*) FROM research_private.hub_gemi_municipality_matches peer " +
      "WHERE peer.gazetteer_source_id=x.source_id)=1), " +
      "updated AS (UPDATE research_private.hub_gemi_municipality_matches m " +
      "SET review_status='reviewed',checked_at=now() FROM verified v " +
      "WHERE m.registry_municipality_id=v.municipality_id " +
      "AND m.gazetteer_source_id=v.source_id AND m.review_status='proposed' " +
      "RETURNING m.registry_municipality_id,m.gazetteer_source_id), " +
      "journal AS (INSERT INTO research_private.hub_gemi_municipality_review_events " +
      "(registry_municipality_id,gazetteer_source_id,actor_user_id,previous_status,decision,reason) " +
      "SELECT u.registry_municipality_id,u.gazetteer_source_id,$2,'proposed','reviewed',v.reason " +
      "FROM updated u JOIN verified v ON v.municipality_id=u.registry_municipality_id " +
      "AND v.source_id=u.gazetteer_source_id RETURNING registry_municipality_id) " +
      "SELECT (SELECT count(*) FROM updated) AS reviews," +
      "(SELECT count(*) FROM journal) AS events," +
      "(SELECT coalesce(sum(v.businesses),0) FROM verified v " +
      "JOIN journal j ON j.registry_municipality_id=v.municipality_id) AS represented",
      [JSON.stringify(eligible), GEMI_AUTO_REVIEW_ACTOR]
    );
    changed = Number(result.rows[0]?.reviews ?? 0);
    journalEvents = Number(result.rows[0]?.events ?? 0);
    records = Number(result.rows[0]?.represented ?? 0);
    if (changed !== journalEvents) throw new Error("AUDIT_EVENT_COUNT_MISMATCH");
  }
  console.info(JSON.stringify({
    mode: apply ? "owner_authorized_apply" : "dry_run",
    actor: GEMI_AUTO_REVIEW_ACTOR,
    examined: rows.rows.length,
    eligibleNames: eligible.length,
    eligibleResearchRecords: eligible.reduce((total, row) => total + row.businesses, 0),
    reviewedNames: changed, auditEvents: journalEvents,
    representedRecords: records,
    businessGeocodesApproved: 0, claimsApproved: 0, published: 0
  }));
} finally {
  await source.end();
}
