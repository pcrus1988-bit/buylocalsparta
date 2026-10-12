import { Pool } from "pg";
import { resolveCensusHubFromPoint } from "../apps/web/src/lib/hub-gemi-assignment.ts";
import { businessHasPremiseLevelGeoEvidence } from "../apps/web/src/lib/hub-gemi-assignment-evidence.ts";

type GeoRow = {
  gemi_number: string;
  latitude: number;
  longitude: number;
  island_group: string | null;
  geo_source: string;
  source_reference: string;
  precision_kind: string | null;
  source_postcode: string | null;
  registry_postcode: string | null;
  business_geo_evidence_ref: string | null;
  business_geo_evidence_kind: string | null;
  has_verified_physical_address: boolean;
  business_geo_verified: boolean;
  business_geo_reviewed: boolean;
  has_business_geo_reviewer: boolean;
  location_key_unique_to_business: boolean;
};

type UpdateRow = {
  gemi_number: string;
  hub_id: string;
  hub_slug: string;
  distance_km: number;
  assignment_status: string;
  assignment_method: string;
  latitude: number;
  longitude: number;
  source_reference: string;
};

const write = process.argv.includes("--apply");
const limitFlag = process.argv.find((arg) => arg.startsWith("--limit="));
const maxRecords = limitFlag ? Math.max(1, Math.min(400000, Number(limitFlag.slice(8)) || 0)) : 400000;
const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("A private production PostgreSQL connection string is required");
if (write && process.env.KM_GEMI_HUB_ASSIGNMENT_APPROVED !== "true") {
  throw new Error("Set KM_GEMI_HUB_ASSIGNMENT_APPROVED=true to allow the explicit --apply write");
}

const pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 8000 });
let cursor = "";
let examined = 0;
let matched = 0;
let outside = 0;
let withheld = 0;
const counts = new Map<string, number>();
try {
  while (examined < maxRecords) {
    const fetchSize = Math.min(1000, maxRecords - examined);
    const page = await pool.query<GeoRow>(
      "SELECT d.gemi_number,g.latitude,g.longitude,g.island_group,g.geo_source,g.source_reference," +
      "g.precision_kind,g.postcode AS source_postcode,d.postcode AS registry_postcode," +
      "d.business_geo_evidence_ref,d.business_geo_evidence_kind," +
      "(nullif(btrim(d.verified_address_text),'') IS NOT NULL) AS has_verified_physical_address," +
      "(d.business_geo_verified_at IS NOT NULL) AS business_geo_verified," +
      "(d.business_geo_reviewed_at IS NOT NULL) AS business_geo_reviewed," +
      "(nullif(btrim(d.business_geo_reviewer_id),'') IS NOT NULL) AS has_business_geo_reviewer," +
      "NOT EXISTS (SELECT 1 FROM research_private.hub_gemi_directory peer " +
      "WHERE peer.location_key=d.location_key AND peer.gemi_number<>d.gemi_number) " +
      "AS location_key_unique_to_business " +
      " FROM research_private.hub_gemi_directory d " +
      " JOIN research_private.hub_gemi_geo_keys g ON g.location_key=d.location_key " +
      " WHERE d.gemi_number>$1 AND g.latitude IS NOT NULL AND g.longitude IS NOT NULL " +
      " AND g.geo_source IS NOT NULL AND g.precision_kind IS NOT NULL " +
      " AND g.source_reference IS NOT NULL AND d.display_status='unpublished' " +
      " AND g.precision_kind='address' AND d.business_geo_verified_at IS NOT NULL " +
      " AND d.assignment_method IS DISTINCT FROM 'manual_geo_review' " +
      " ORDER BY d.gemi_number ASC LIMIT $2",
      [cursor, fetchSize]
    );
    if (!page.rows.length) break;
    const updates: UpdateRow[] = [];
    for (const row of page.rows) {
      examined += 1;
      if (!businessHasPremiseLevelGeoEvidence({
        precisionKind: row.precision_kind, geoSource: row.geo_source,
        sourceReference: row.source_reference,
        businessEvidenceReference: row.business_geo_evidence_ref,
        businessEvidenceKind: row.business_geo_evidence_kind,
        hasVerifiedPhysicalAddress: row.has_verified_physical_address,
        businessGeoVerified: row.business_geo_verified,
        businessGeoReviewed: row.business_geo_reviewed,
        hasBusinessGeoReviewer: row.has_business_geo_reviewer,
        sourcePostcode: row.source_postcode,
        registryPostcode: row.registry_postcode,
        locationKeyUniqueToBusiness: row.location_key_unique_to_business
      })) {
        withheld += 1;
        continue;
      }
      const islandHubId = row.island_group?.startsWith("hub:") ? row.island_group.slice(4) : undefined;
      const landmass = row.island_group === "mainland" ? "mainland" : "island";
      const assignment = resolveCensusHubFromPoint({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        landmass,
        islandHubId
      });
      if (!assignment) {
        withheld += 1;
        continue;
      }
      if (assignment.status === "assigned") matched += 1;
      else outside += 1;
      counts.set(assignment.hub.slug, (counts.get(assignment.hub.slug) ?? 0) + 1);
      updates.push({
        gemi_number: row.gemi_number,
        hub_id: assignment.hub.id,
        hub_slug: assignment.hub.slug,
        distance_km: Number(assignment.distanceKm.toFixed(4)),
        assignment_status: assignment.status,
        assignment_method: assignment.method,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        source_reference: row.source_reference
      });
    }
    if (write && updates.length) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "WITH assignments AS (" +
            "SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(" +
            "gemi_number text,hub_id text,hub_slug text,distance_km numeric," +
            "assignment_status text,assignment_method text,latitude double precision,longitude double precision,source_reference text))" +
          " UPDATE research_private.hub_gemi_directory d SET " +
            "assigned_hub_id=a.hub_id,assigned_hub_slug=a.hub_slug,hub_distance_km=a.distance_km," +
            "assignment_status=a.assignment_status,assignment_method=a.assignment_method," +
            "latitude=a.latitude,longitude=a.longitude,updated_at=now() " +
          "FROM assignments a WHERE d.gemi_number=a.gemi_number " +
          "AND d.display_status='unpublished' " +
          "AND d.assignment_method IS DISTINCT FROM 'manual_geo_review' " +
          "AND d.business_geo_verified_at IS NOT NULL AND d.business_geo_reviewed_at IS NOT NULL " +
          "AND nullif(btrim(d.business_geo_reviewer_id),'') IS NOT NULL " +
          "AND d.business_geo_evidence_ref=a.source_reference " +
          "AND d.business_geo_evidence_kind IN ('verified_premise_address','verified_registry_address') " +
          "AND nullif(btrim(d.verified_address_text),'') IS NOT NULL " +
          "AND d.postcode ~ '^[0-9]{5}$' " +
          "AND EXISTS (SELECT 1 FROM research_private.hub_gemi_geo_keys g " +
          "WHERE g.location_key=d.location_key AND g.precision_kind='address' " +
          "AND g.source_reference=a.source_reference AND g.postcode=d.postcode) " +
          "AND NOT EXISTS (SELECT 1 FROM research_private.hub_gemi_directory peer " +
          "WHERE peer.location_key=d.location_key AND peer.gemi_number<>d.gemi_number)"
          [JSON.stringify(updates)]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    cursor = page.rows[page.rows.length - 1]!.gemi_number;
    if (page.rows.length < fetchSize) break;
  }
  console.info(JSON.stringify({
    mode: write ? "applied" : "dry_run",
    examined, matched, outsideCoverage: outside, withheldForGeoReview: withheld,
    byHub: [...counts].sort(([a], [b]) => a.localeCompare(b))
  }));
} finally {
  await pool.end();
}
