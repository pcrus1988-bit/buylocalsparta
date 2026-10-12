/**
 * Validate and import licensed location evidence into the private GEMI geo-key cache.
 *
 * Expected newline-delimited JSON (NDJSON):
 * {"location_key":"32 lowercase hex","latitude":39.36,"longitude":22.94,
 *  "geo_source":"licensed_gazetteer","precision_kind":"postcode",
 *  "source_reference":"provider:dataset-version:item-id","island_group":"mainland"}
 *
 * For islands use island_group="hub:KM-HUB-005" from verified geographic
 * evidence. Unverified islands and vague national centroids must not be
 * labelled "mainland" to bypass the radius/landmass safeguard.
 *
 * Dry-run: POSTGRES_URL=... node --experimental-strip-types scripts/import-hub-gemi-geocodes.ts evidence.ndjson
 * Write:   KM_GEMI_GEOCODE_IMPORT_APPROVED=true ... --apply
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Pool } from "pg";

type GeoEvidence = {
  location_key: string;
  latitude: number;
  longitude: number;
  geo_source: "verified_geocode" | "licensed_gazetteer" | "verified_manual";
  precision_kind: "address" | "postcode" | "locality";
  source_reference: string;
  island_group: string;
};

const filePath = process.argv.find((arg, index) => index >= 2 && !arg.startsWith("--"));
const write = process.argv.includes("--apply");
const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!filePath) throw new Error("Supply a vetted evidence.ndjson file");
if (!url) throw new Error("Private platform PostgreSQL access is required");
if (write && process.env.KM_GEMI_GEOCODE_IMPORT_APPROVED !== "true") {
  throw new Error("KM_GEMI_GEOCODE_IMPORT_APPROVED=true is required for --apply");
}

function validate(raw: unknown): GeoEvidence {
  if (!raw || typeof raw !== "object") throw new Error("Expected JSON object");
  const candidate = raw as Record<string, unknown>;
  const location_key = String(candidate.location_key ?? "");
  const latitude = Number(candidate.latitude);
  const longitude = Number(candidate.longitude);
  const geo_source = String(candidate.geo_source ?? "");
  const precision_kind = String(candidate.precision_kind ?? "");
  const source_reference = String(candidate.source_reference ?? "").trim();
  const island_group = String(candidate.island_group ?? "");
  if (!/^[a-f0-9]{32}$/.test(location_key)) throw new Error("Invalid location_key");
  if (!Number.isFinite(latitude) || latitude < 34 || latitude > 43 ||
      !Number.isFinite(longitude) || longitude < 19 || longitude > 30) {
    throw new Error("Coordinates must be finite and within Greece bounding box");
  }
  if (!["verified_geocode", "licensed_gazetteer", "verified_manual"].includes(geo_source)) {
    throw new Error("Invalid geo_source");
  }
  if (!["address", "postcode", "locality"].includes(precision_kind)) {
    throw new Error("Invalid precision_kind");
  }
  if (source_reference.length < 12 || source_reference.length > 300) {
    throw new Error("Missing or invalid source_reference");
  }
  if (island_group !== "mainland" && !/^hub:KM-HUB-[0-9]{3}$/.test(island_group)) {
    throw new Error("Verified mainland or island hub is required");
  }
  return { location_key, latitude, longitude,
    geo_source: geo_source as GeoEvidence["geo_source"],
    precision_kind: precision_kind as GeoEvidence["precision_kind"],
    source_reference, island_group };
}

const pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 8000 });
let read = 0;
let matched = 0;
let missing = 0;
let duplicates = 0;
const seen = new Set<string>();
const batch: GeoEvidence[] = [];
async function flush() {
  if (!batch.length) return;
  const copy = batch.splice(0);
  const client = await pool.connect();
  try {
    if (write) await client.query("BEGIN");
    const result = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM research_private.hub_gemi_geo_keys " +
      "WHERE location_key = ANY($1::text[])",
      [copy.map((r) => r.location_key)]
    );
    matched += Number(result.rows[0]?.count ?? 0);
    missing += copy.length - Number(result.rows[0]?.count ?? 0);
    if (write) {
      await client.query(
        "WITH evidence AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS e(" +
          "location_key text,latitude double precision,longitude double precision," +
          "geo_source text,precision_kind text,source_reference text,island_group text)) " +
        "UPDATE research_private.hub_gemi_geo_keys g SET " +
          "latitude=e.latitude,longitude=e.longitude,geo_source=e.geo_source," +
          "precision_kind=e.precision_kind,source_reference=e.source_reference," +
          "island_group=e.island_group,checked_at=now() " +
        "FROM evidence e WHERE g.location_key=e.location_key",
        [JSON.stringify(copy)]
      );
      await client.query("COMMIT");
    }
  } catch (error) {
    if (write) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
try {
  const lines = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    read += 1;
    const value = validate(JSON.parse(line));
    if (seen.has(value.location_key)) { duplicates += 1; continue; }
    seen.add(value.location_key);
    batch.push(value);
    if (batch.length >= 500) await flush();
  }
  await flush();
  console.log(JSON.stringify({ mode: write ? "applied" : "dry_run",
    rows: read, unique: seen.size, matched, missing, duplicates }));
} finally {
  await pool.end();
}
