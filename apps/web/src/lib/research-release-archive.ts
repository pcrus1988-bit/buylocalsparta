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
  const body = Buffer.from(canonical.canonicalJson,"utf8");
  if (body.byteLength<1 || body.byteLength>75_000_000) throw new Error("RESEARCH_ARCHIVE_SIZE_INVALID");
  const key = `research/releases/${row.id}/${row.artifact_sha256}.json`;
  const storage = serverObjectStorageFromEnv({ defaultBucket: BUCKET });
  const previous = await storage.head(key).catch(error => { if (error instanceof Error && error.message.includes("HTTP 400")) return undefined; throw error; });
  if (previous && previous.byteSize !== body.byteLength) throw new Error("RESEARCH_ARCHIVE_EXISTING_LENGTH_MISMATCH");
  if (!previous) {
    try {
      await storage.put({ objectKey:key, contentType:"application/json", body });
    } catch(error) {
      // A parallel cron may have written the same immutable object.
      if (!await storage.head(key)) throw error;
    }
  }
  const remote = await storage.read(key);
  if (remote.contentType?.split(";")[0].trim() !== "application/json") {
    throw new Error("RESEARCH_ARCHIVE_CONTENT_TYPE_MISMATCH");
  }
  const digest = createHash("sha256");
  let bytesRead = 0;
  for await (const chunk of remote.stream) {
    bytesRead += chunk.byteLength;
    if (bytesRead>body.byteLength) throw new Error("RESEARCH_ARCHIVE_READBACK_LENGTH_MISMATCH");
    digest.update(chunk);
  }
  if (bytesRead!==body.byteLength || digest.digest("hex")!==row.artifact_sha256) {
    throw new Error("RESEARCH_ARCHIVE_READBACK_SHA256_MISMATCH");
  }
  await pool.query(`
    INSERT INTO research_release_archives
      (release_snapshot_id,study_id,wave_id,storage_provider,object_key,
       artifact_sha256,byte_size,content_type,storage_etag,
       archive_contract,verification_version,archived_at,verified_at,evidence_json)
    VALUES ($1,$2,$3,'object_storage',$4,$5,$6,'application/json',$7,
       'content_addressed_no_overwrite_v1','sha256_readback_v1',now(),now(),$8::jsonb)
    ON CONFLICT (release_snapshot_id) DO NOTHING
  `,[row.id,row.study_id,row.wave_id,key,row.artifact_sha256,body.byteLength,
     remote.etag??null,JSON.stringify({bucket:BUCKET,proof:"full_sha256_readback",publicAccess:false})]);
  const audit = await pool.query<{object_key:string;artifact_sha256:string;byte_size:number}>(`
    SELECT object_key,artifact_sha256,byte_size
    FROM research_release_archives WHERE release_snapshot_id=$1
  `,[row.id]);
  if (audit.rows[0]?.object_key!==key ||
      audit.rows[0]?.artifact_sha256!==row.artifact_sha256 ||
      Number(audit.rows[0]?.byte_size)!==body.byteLength) {
    throw new Error("RESEARCH_ARCHIVE_LEDGER_READBACK_MISMATCH");
  }
  return { state:"verified",releaseSnapshotId:row.id,objectKey:key,sha256:row.artifact_sha256,byteSize:body.byteLength };
}
