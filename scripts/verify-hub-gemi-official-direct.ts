/**
 * Guarded, rate-limited direct verification against the official GEMI API.
 * No public listing, indexing, privacy review, human review or owner claim.
 *
 * Preview only (no API calls / no DB mutations):
 *   POSTGRES_URL=... node --experimental-strip-types scripts/verify-hub-gemi-official-direct.ts --hub=volos
 *
 * Verified identity writes (independent explicit owner authorization):
 *   KM_GEMI_OFFICIAL_IDENTITY_VERIFY_APPROVED=true POSTGRES_URL=... \
 *   node --experimental-strip-types scripts/verify-hub-gemi-official-direct.ts --hub=volos --limit=3 --apply
 *
 * The API key must be in GEMI_OPENDATA_API_KEY or existing restricted Vault.
 */
import { createHash } from "node:crypto";
import { Pool } from "pg";
import {
  GEMI_PROVIDER_SPACING_MS,
  directGemiCandidatesSql,
  directGemiUpdateSql,
  exactGemiIdentityMatch,
  parseDirectGemiOptions,
  type CandidateIdentity
} from "./hub-gemi-direct-identity-policy.ts";

const options = parseDirectGemiOptions(process.argv.slice(2));
const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("A private PostgreSQL runtime connection is required");

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8000 });
const client = await pool.connect();
let advisoryLock = false;
try {
  // Exclusive lock prevents multiple simultaneous direct-verification runs.
  const lock = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
    ["km-hub-gemi-official-direct-verify-v1"]
  );
  advisoryLock = lock.rows[0]?.locked === true;
  if (!advisoryLock) throw new Error("A direct GEMI identity verification run is already active");

  const selected = await client.query<CandidateIdentity>(directGemiCandidatesSql, [
    options.limit, options.after, options.hub
  ]);
  let checked = 0;
  let verified = 0;
  let mismatches = 0;
  let providerBlocked = false;
  let cursor: string | null = null;
  const startedAt = Date.now();

  let apiKey = "";
  if (options.apply) {
    apiKey = process.env.GEMI_OPENDATA_API_KEY?.trim() || "";
    if (!apiKey) {
      const stored = await client.query<{ secret: string | null }>(
        "SELECT bls_private.get_gemi_opendata_api_key() AS secret"
      );
      apiKey = stored.rows[0]?.secret?.trim() || "";
    }
    if (!apiKey) throw new Error("Official GEMI API credential is not available to this runner");
  }

  for (const candidate of selected.rows) {
    if (!options.apply) break;
    // 30.5s minimum spacing (~2/minute) is below the application's
    // 3/minute provider quota; 429 still halts the batch safely.
    if (checked > 0) {
      const elapsed = Date.now() - startedAt;
      const nextCallEarliest = checked * GEMI_PROVIDER_SPACING_MS;
      if (nextCallEarliest > elapsed) {
        await new Promise<void>(resolve => setTimeout(resolve, nextCallEarliest - elapsed));
      }
    }
    let response: Response;
    try {
      const url = "https://opendata-api.businessportal.gr/api/opendata/v1/companies/" +
        encodeURIComponent(candidate.gemi_number);
      response = await fetch(url, {
        headers: { Accept: "application/json", api_key: apiKey },
        signal: AbortSignal.timeout(12_000),
        redirect: "error",
        cache: "no-store"
      });
    } catch {
      providerBlocked = true;
      break;
    }
    if (response.status === 429 || response.status >= 500 || response.status === 401 ||
        response.status === 403) {
      providerBlocked = true;
      break;
    }
    let payload: unknown = undefined;
    if (response.ok) {
      try { payload = await response.json(); } catch { providerBlocked = true; break; }
    }
    checked += 1;
    cursor = candidate.gemi_number;
    if (!response.ok || !exactGemiIdentityMatch(candidate, payload)) {
      mismatches += 1;
      continue;
    }
    const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const evidenceRef = "gemi-opendata-live:sha256:" + hash;
    const updated = await client.query<{ gemi_number: string }>(directGemiUpdateSql, [
      candidate.gemi_number,
      candidate.legal_name,
      candidate.postcode,
      candidate.registry_municipality_id,
      evidenceRef,
      candidate.directory_hub_slug
    ]);
    verified += updated.rowCount ?? 0;
  }

  // No names, tax IDs, personal contacts, API key or raw responses in logs.
  console.info(JSON.stringify({
    mode: options.apply ? "private_official_identity_check" : "preview_no_network",
    hub: options.hub || "all_reviewed_hubs",
    available: selected.rows.length,
    checked,
    registryIdentitiesVerified: verified,
    mismatches,
    providerBlocked,
    lastGemi: cursor,
    ownersVerified: 0,
    privacyApprovalsCreated: 0,
    editorialApprovalsCreated: 0,
    published: 0,
    seoApproved: 0,
    physicalGeoVerified: 0
  }));
} finally {
  if (advisoryLock) {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
      "km-hub-gemi-official-direct-verify-v1"
    ]).catch(() => undefined);
  }
  client.release();
  await pool.end();
}
