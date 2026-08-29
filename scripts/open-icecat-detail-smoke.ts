import { randomUUID } from "node:crypto";
import {
  OPEN_ICECAT_DETAIL_PROCESSING_VERSION,
  type OpenIcecatProductDraft
} from "../packages/core/src/index.ts";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";

const runtime = createPostgresRuntimeFromEnv({ applicationName: "open-icecat-detail-smoke" });
try {
  const readiness = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
  assert(readiness.ok && readiness.appliedSchemaVersion === 161, `schema 161 is required: ${readiness.message}`);

  const source = await runtime.nativePool.query<{ source_id: string }>(`
    SELECT s.id::text AS source_id
    FROM public.catalog_sources s
    JOIN public.markets m ON m.id=s.market_id
    WHERE s.code='open_icecat' AND s.active=true AND m.code='sparta'
    LIMIT 1
  `);
  const sourceId = source.rows[0]?.source_id;
  assert(sourceId, "Open Icecat Sparta source must exist");

  const workerId = `ci-detail-smoke:${process.pid}`;
  const productId = `ci-icecat-detail-${randomUUID()}`;
  const gtin = "4006381333931";

  // A detail job may be queued while the parent full-index run is still running,
  // but it must not be leased until that run is atomically completed.
  const fullRun1 = await insertRun(sourceId, "full", "running", 1, 1, 1);
  await runtime.nativePool.query(`
    INSERT INTO public.open_icecat_index_products (
      source_id,product_id,path,source_updated,quality,supplier_id,product_code,
      category_id,mapped_product_code,gtins,on_market,country_markets,model_name,
      product_views,high_pic,gtins_approved,limited,record_state,
      last_source_fingerprint,last_run_id
    ) VALUES (
      $1::uuid,$2,'export/freexml/EL/ci.xml','2026-08-29T00:00:00Z','ICECAT','ci-supplier','CI-PART',
      'ci-category',NULL,ARRAY[$3]::text[],true,ARRAY['GR']::text[],'CI Greek Product',
      100,NULL,true,false,'active',$4,$5::uuid
    )
  `, [sourceId, productId, gtin, fullRun1.fingerprint, fullRun1.runId]);

  const initialSync = await runtime.persistence.openIcecatDetail.sync(sourceId, OPEN_ICECAT_DETAIL_PROCESSING_VERSION);
  assert(initialSync.queuedOrRefreshed >= 1, "detail sync must queue the staged active index product");
  const blocked = await runtime.persistence.openIcecatDetail.claim({
    sourceId, workerId, leaseSeconds: 300, limit: 10
  });
  assert(blocked.length === 0, "detail jobs must not be claimed before their parent bulk run completes");

  await runtime.persistence.openIcecatBulk.complete(fullRun1.runId, 1);
  const claimed = await runtime.persistence.openIcecatDetail.claim({
    sourceId, workerId, leaseSeconds: 300, limit: 10
  });
  assert(claimed.length === 1 && claimed[0]?.productId === productId, "completed bulk evidence must become claimable exactly once");

  const draft = greekReadyDraft(gtin);
  const persisted = await runtime.persistence.openIcecatDetail.persist(claimed[0]!, workerId, draft);
  assert(!persisted.stale, "stable detail evidence must persist");
  assert(persisted.status === "ready", "complete native Greek evidence must finish ready");
  assert(persisted.sourceProductId, "detail persistence must return source product evidence id");

  const evidence = await runtime.nativePool.query<{
    title: string;
    publish_eligible: boolean;
    content_origin: string;
    mapping_status: string;
    link_count: string;
  }>(`
    SELECT sp.title,
           l.publish_eligible,
           l.content_origin,
           a.mapping_status,
           (SELECT count(*)::text FROM public.catalog_source_product_links spl WHERE spl.source_product_id=sp.id) AS link_count
    FROM public.catalog_source_products sp
    JOIN public.catalog_source_product_localizations l
      ON l.source_product_id=sp.id AND l.locale='EL'
    JOIN public.catalog_source_attribute_observations a
      ON a.source_product_id=sp.id AND a.source_attribute_key='color'
    WHERE sp.id=$1::uuid
  `, [persisted.sourceProductId]);
  const evidenceRow = evidence.rows[0];
  assert(evidenceRow?.title === "Δοκιμαστικό ελληνικό προϊόν", "source-product title must be persisted from normalized Icecat evidence");
  assert(evidenceRow.publish_eligible === true, "ready Greek localization must satisfy only the source-level 0158 publication quality gate");
  assert(evidenceRow.content_origin === "icecat_native", "native Greek provenance must remain explicit");
  assert(evidenceRow.mapping_status === "unmapped", "Icecat specifications must enter normal unmapped-attribute governance");
  assert(Number(evidenceRow.link_count) === 0, "detail enrichment must not create a source-to-canonical link automatically");

  // A later provider version arriving while a detail request is in flight must make
  // the old lease stale and refresh the queue identity instead of persisting old data.
  const dailyRun2 = await insertRun(sourceId, "daily", "completed", 1, 1, 1);
  await runtime.nativePool.query(`
    UPDATE public.open_icecat_index_products
    SET source_updated='2026-08-29T01:00:00Z',
        last_source_fingerprint=$3,
        last_run_id=$4::uuid,
        record_state='active', removed_at=NULL
    WHERE source_id=$1::uuid AND product_id=$2
  `, [sourceId, productId, dailyRun2.fingerprint, dailyRun2.runId]);
  await runtime.persistence.openIcecatDetail.sync(sourceId, OPEN_ICECAT_DETAIL_PROCESSING_VERSION);
  const staleClaim = await runtime.persistence.openIcecatDetail.claim({
    sourceId, workerId, leaseSeconds: 300, limit: 10
  });
  assert(staleClaim.length === 1, "changed provider version must requeue detail enrichment");

  const dailyRun3 = await insertRun(sourceId, "daily", "completed", 1, 1, 1);
  await runtime.nativePool.query(`
    UPDATE public.open_icecat_index_products
    SET source_updated='2026-08-29T02:00:00Z',
        last_source_fingerprint=$3,
        last_run_id=$4::uuid
    WHERE source_id=$1::uuid AND product_id=$2
  `, [sourceId, productId, dailyRun3.fingerprint, dailyRun3.runId]);

  const staleResult = await runtime.persistence.openIcecatDetail.persist(staleClaim[0]!, workerId, draft);
  assert(staleResult.stale === true, "detail persistence must reject an index version that changed in flight");
  const refreshed = await runtime.persistence.openIcecatDetail.claim({
    sourceId, workerId, leaseSeconds: 300, limit: 10
  });
  assert(refreshed.length === 1, "stale detail job must refresh to the current provider identity and be reclaimable");
  assert(refreshed[0]?.lastRunId === dailyRun3.runId, "stale refresh must advance the detail job to the latest bulk run");
  assert(refreshed[0]?.sourceUpdated === "2026-08-29T02:00:00Z", "stale refresh must advance the provider update marker");
  await runtime.persistence.openIcecatDetail.skip(refreshed[0]!, workerId, "CI stale-version lifecycle completed");

  // A completed full snapshot is authoritative for provider-index presence. An empty
  // later full snapshot therefore retires the previously active row and its detail job.
  const fullRun4 = await insertRun(sourceId, "full", "running", 0, 0, 0);
  await runtime.persistence.openIcecatBulk.complete(fullRun4.runId, 0);
  const retired = await runtime.nativePool.query<{ record_state: string; job_status: string; job_run_id: string }>(`
    SELECT i.record_state, j.status AS job_status, j.last_run_id::text AS job_run_id
    FROM public.open_icecat_index_products i
    JOIN public.open_icecat_detail_enrichment_jobs j
      ON j.source_id=i.source_id AND j.product_id=i.product_id
    WHERE i.source_id=$1::uuid AND i.product_id=$2
  `, [sourceId, productId]);
  assert(retired.rows[0]?.record_state === "removed", "full reconciliation must retire an index row absent from the completed full snapshot");
  assert(retired.rows[0]?.job_status === "skipped", "full reconciliation must stop detail work for a retired row");
  assert(retired.rows[0]?.job_run_id === fullRun4.runId, "retired detail state must point at the authoritative full run");

  const stats = await runtime.persistence.openIcecatDetail.stats(sourceId);
  assert(stats.skipped >= 1, "detail queue stats must expose retired/skipped rows");

  console.log(JSON.stringify({
    ok: true,
    sourceId,
    sourceProductId: persisted.sourceProductId,
    schema: readiness.appliedSchemaVersion,
    processingVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION,
    stats
  }));
} finally {
  await runtime.close();
}

async function insertRun(
  sourceId: string,
  importKind: "full" | "daily",
  status: "running" | "completed",
  checkpoint: number,
  sourceRows: number,
  persisted: number
): Promise<{ runId: string; fingerprint: string }> {
  const fingerprint = `ci:${importKind}:${randomUUID()}`;
  const result = await runtime.nativePool.query<{ run_id: string }>(`
    INSERT INTO public.open_icecat_bulk_ingestion_runs (
      source_id,import_kind,source_url,source_fingerprint,processing_version,status,
      checkpoint,source_rows,persisted,removed,rejected,filtered,completed_at
    ) VALUES (
      $1::uuid,$2,'https://data.icecat.biz/export/freexml/EL/ci.index.csv.gz',$3,
      'ci-detail-smoke-bulk-v1',$4,$5,$6,$7,0,0,0,
      CASE WHEN $4='completed' THEN now() ELSE NULL END
    )
    RETURNING id::text AS run_id
  `, [sourceId, importKind, fingerprint, status, checkpoint, sourceRows, persisted]);
  const runId = result.rows[0]?.run_id;
  assert(runId, "bulk smoke fixture run insert must return an id");
  return { runId, fingerprint };
}

function greekReadyDraft(gtin: string): OpenIcecatProductDraft {
  const native = (value: string) => ({ value, locale: "EL", origin: "ICECAT_NATIVE_EL" as const });
  return {
    icecatId: "ci-icecat-id",
    gtins: [gtin],
    primaryGtin: gtin,
    brand: "CI Brand",
    brandPartCode: "CI-PART",
    productName: native("Δοκιμαστικό προϊόν"),
    title: native("Δοκιμαστικό ελληνικό προϊόν"),
    description: native("Πλήρης ελληνική περιγραφή προϊόντος για έλεγχο της ροής Open Icecat."),
    category: native("Ηλεκτρονικά"),
    specifications: [{
      key: "color",
      name: native("Χρώμα"),
      value: native("Μαύρο"),
      rawValue: "Black",
      searchable: true
    }],
    images: [{ url: "https://images.icecat.biz/img/gallery/ci.jpg", kind: "primary" }],
    variants: [{ id: "ci-variant", identifiers: [{ type: "GTIN", value: gtin, approved: true }] }],
    sourceLocale: "EL",
    sourcePayload: { data: { GeneralInfo: { IcecatId: "ci-icecat-id", Title: "Δοκιμαστικό ελληνικό προϊόν" } } },
    greekQuality: {
      score: 1,
      status: "READY",
      required: { title: true, description: true, category: true, specifications: true },
      missing: []
    }
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
