import { createHash } from "node:crypto";
import { serverObjectStorageFromEnv } from "@buy-local-sparta/object-storage";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { researchReleaseArtifactIntegrity } from "./research-survey-release";

const BUCKET = "greek-retail-2026-backups";

/** Archive only a sealed, hash-verified release; never move its public cutoff. */
export async function archiveGreekRetailSealedRelease() {
  if (!productionDatabaseConfigured()) return { state: "not_ready" };
  const pool = getProductionPostgresRuntime().sqlPool;
  const result = await pool.query<{id:string;study_id:string;wave_id:string;artifact_sha256:string}>(`
    SELECT rs.id,rs.study_id,rs.wave_id,rs.artifact_sha256
    FROM research_release_snapshots rs
    JOIN research_studies s ON s.id=rs.study_id
    JOIN research_analysis_runs ar ON ar.id=rs.analysis_run_id
    WHERE s.slug='greek-retail-2026' AND s.status='published'
      AND ar.status='succeeded'
    ORDER BY rs.created_at DESC LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) return { state: "not_ready" };
  const found = await pool.query<{artifact_sha256:string}>(`
    SELECT artifact_sha256 FROM research_release_archives
    WHERE release_snapshot_id=$1
  `,[row.id]);
  if (found.rows[0]) {
    if (found.rows[0].artifact_sha256 !== row.artifact_sha256) throw new Error("RESEARCH_ARCHIVE_LEDGER_MISMATCH");
    return { state: "already_verified", releaseSnapshotId: row.id };
  }
  const canonical = await researchReleaseArtifactIntegrity(pool,row.id);
  if (!canonical?.integrityOk || canonical.storedSha256 !== row.artifact_sha256) {
    throw new Error("RESEARCH_ARCHIVE_SOURCE_HASH_MISMATCH");
  }
