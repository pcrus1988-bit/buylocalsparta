/**
 * Rebuild review-only proposals using a pinned CC BY 4.0 Greek municipal-centre dataset.
 * Municipality centroids are approximate and must NOT be promoted into the
 * verified location cache or used directly to publish /hubs/*/business pages.
 *
 * Dry run: POSTGRES_URL=... node --experimental-strip-types scripts/match-hub-gemi-municipalities.ts
 * Apply: KM_GEMI_MUNICIPALITY_MATCH_APPROVED=true ... --apply
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { matchMunicipalityName, normalizedMunicipalityLabel } from "./gemi-municipality-name-match.ts";

type SourceRecord = {
  id: string; name: string; region: string; latitude: number; longitude: number;
};
type SourceFile = { license: string; records: SourceRecord[] };
type RegistryRecord = { mid: string; municipality: string; n: number | string };
type Hub = {
  hub_id: string; hub_slug: string;
  latitude: number; longitude: number;
};
type Candidate = {
  registry_municipality_id: string;
  registry_municipality_name: string;
  gazetteer_source_id: string;
  candidate_hub_id: string;
  candidate_hub_slug: string;
  candidate_hub_distance_km: number;
  matching_business_count: number;
  match_method: string;
};

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2-lat1)*rad/2)**2 +
    Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;
  return 12742.0176 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const records = JSON.parse(readFileSync(
  "data/greece-municipality-centroids-ccby4.json", "utf8"
)) as SourceFile;
if (records.license !== "CC-BY-4.0") throw new Error("Unexpected source license");
const map = new Map<string, SourceRecord[]>();
for (const item of records.records) {
  const key = normalizedMunicipalityLabel(item.name);
  const items = map.get(key) ?? [];
  items.push(item);
  map.set(key, items);
}

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Private PostgreSQL connection required");
const apply = process.argv.includes("--apply");
if (apply && process.env.KM_GEMI_MUNICIPALITY_MATCH_APPROVED !== "true") {
  throw new Error("Approval flag required before writing proposals");
}
const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 8000 });
try {
  const [ms, hs] = await Promise.all([
    pool.query<RegistryRecord>(
      "SELECT d.registry_municipality_id mid, " +
      "split_part(r.sampling_attributes->>'municipality',' / ',1) municipality, " +
      "count(*)::integer n FROM research_private.hub_gemi_directory d " +
      "JOIN public.research_frame_units r ON r.id=d.source_frame_unit_id " +
      "WHERE d.registry_municipality_id IS NOT NULL " +
      "GROUP BY 1,2 ORDER BY n DESC"
    ),
    pool.query<Hub>(
      "SELECT hub_id,hub_slug,latitude,longitude FROM research_private.hub_gemi_hub_master"
    )
  ]);

  const proposed: Candidate[] = [];
  let unmatched = 0;
  let genitiveVariantProposals = 0;
  for (const m of ms.rows) {
    if (!/^[1-9][0-9]{3,5}$/.test(m.mid ?? "")) { unmatched++; continue; }
    const match = matchMunicipalityName(m.municipality ?? "", map);
    if (!match) { unmatched++; continue; }
    if (match.rule === "genitive_variant") genitiveVariantProposals++;
    // Every match is still only a proposed administrative-centre candidate,
    // never a verified business coordinate or an assignment.
    const gazetteer = match.record;
    const closest = hs.rows.map(h => ({
      hub: h, distance: haversine(
        gazetteer.latitude,gazetteer.longitude,Number(h.latitude),Number(h.longitude))
    })).sort((a,b) => a.distance-b.distance || a.hub.hub_id.localeCompare(b.hub.hub_id))[0];
    if (!closest) { unmatched++; continue; }

    proposed.push({
      registry_municipality_id: m.mid,
      registry_municipality_name: m.municipality,
      gazetteer_source_id: gazetteer.id,
      candidate_hub_id: closest.hub.hub_id,
      candidate_hub_slug: closest.hub.hub_slug,
      candidate_hub_distance_km: Number(closest.distance.toFixed(4)),
      matching_business_count: Number(m.n),
      match_method: "unique_exact_transliteration"
    });
  }

  if (apply && proposed.length) {
    await pool.query(
      "WITH data AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(" +
      "registry_municipality_id text,registry_municipality_name text,gazetteer_source_id text," +
      "candidate_hub_id text,candidate_hub_slug text,candidate_hub_distance_km numeric," +
      "matching_business_count integer,match_method text)) " +
      "INSERT INTO research_private.hub_gemi_municipality_matches " +
      "(registry_municipality_id,registry_municipality_name,gazetteer_source_id,candidate_hub_id," +
      "candidate_hub_slug,candidate_hub_distance_km,matching_business_count,match_method) " +
      "SELECT registry_municipality_id,registry_municipality_name,gazetteer_source_id," +
      "candidate_hub_id,candidate_hub_slug,candidate_hub_distance_km,matching_business_count,match_method FROM data " +
      "ON CONFLICT(registry_municipality_id) DO UPDATE SET " +
      "gazetteer_source_id=excluded.gazetteer_source_id," +
      "candidate_hub_id=excluded.candidate_hub_id,candidate_hub_slug=excluded.candidate_hub_slug," +
      "candidate_hub_distance_km=excluded.candidate_hub_distance_km," +
      "matching_business_count=excluded.matching_business_count,checked_at=now() " +
      "WHERE research_private.hub_gemi_municipality_matches.review_status='proposed'",
      [JSON.stringify(proposed)]
    );
  }
  console.info(JSON.stringify({
    mode: apply ? "applied" : "dry_run",
    referenceMunicipalities: records.records.length,
    registryMunicipalities: ms.rows.length,
    unambiguousMatches: proposed.length,
    candidateBusinesses: proposed.reduce((total, row) => total + row.matching_business_count, 0),
    administrativeCentroidOnly: true,
    verifiedBusinessLocations: 0,
    genitiveVariantProposals,
    unmatchedMunicipalities: unmatched
  }));
} finally {
  await pool.end();
}
