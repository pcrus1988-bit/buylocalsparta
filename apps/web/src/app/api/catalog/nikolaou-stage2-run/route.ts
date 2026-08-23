import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOURCE_CODE = "nikolaou-tools";
const CONTROL_KEY = "nikolaou_stage2_crawl_control";
const PENDING = "supplier_title_crawled_body_pending";
const ENRICHED = "supplier_body_enriched";
const NO_SPECS = "supplier_body_enriched_no_specs";
const FAILED = "supplier_body_enrichment_failed";
const MISMATCH = "supplier_body_identity_mismatch";
const LOCK_KEY = "kontamou:nikolaou:stage2";

type Json = Record<string, unknown>;
type SourceRow = Readonly<{
  id: string;
  source_id: string;
  source_taxonomy_node_id: string | null;
  source_product_key: string;
  supplier_code: string | null;
  title: string;
  source_url: string | null;
  source_image_url: string | null;
  source_identity: Json | null;
  raw_payload: Json | null;
  normalized_payload: Json | null;
  quality_payload: Json | null;
  price_state: string;
  classification_status: string;
}>;
type ParsedSpec = Readonly<{ key: string; label: string; raw: string; value: unknown }>;
type Parsed = Readonly<{
  sourceProductId?: string;
  sourceProductKey?: string;
  model?: string;
  supplierCode?: string;
  brand?: string;
  gtin?: string;
  manualUrl?: string;
  specifications?: readonly ParsedSpec[];
  error?: string;
  status?: number;
}>;

const objectValue = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function authorized(supplied: string | null, expectedHex: string): boolean {
  if (!supplied || !/^[0-9a-f]{64}$/i.test(expectedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = sha256(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function removePendingFlag(quality: Json): Json {
  const flags = Array.isArray(quality.dataQualityFlags)
    ? quality.dataQualityFlags.filter((entry) => text(entry) && text(entry) !== "body_description_not_individually_verified")
    : [];
  return { ...quality, dataQualityFlags: flags };
}

function enrichedDescription(title: string, specs: readonly ParsedSpec[]): string {
  const facts = specs.slice(0, 8).map((spec) => `${spec.label}: ${String(spec.value)}`);
  return facts.length ? `${title}. Βασικά χαρακτηριστικά: ${facts.join("; ")}.` : title;
}

function nextEvidence(row: SourceRow, parsed: Parsed, responseStatus: number) {
  const raw = objectValue(row.raw_payload);
  const normalized = objectValue(row.normalized_payload);
  const quality = objectValue(row.quality_payload);
  const identity = objectValue(row.source_identity);
  const specs = parsed.specifications ?? [];
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const expectedCode = (row.supplier_code ?? "").replace(/^0+/, "");
  const observedCode = (parsed.supplierCode ?? "").replace(/^0+/, "");
  const identityMismatch = responseStatus === 409 || Boolean(expectedCode && observedCode && expectedCode !== observedCode);
  const status = identityMismatch ? MISMATCH : responseStatus === 200 ? (specs.length ? ENRICHED : NO_SPECS) : FAILED;
  const specificationValues = Object.fromEntries(specs.map((spec) => [spec.key, spec.value]));
  const specificationLabels = Object.fromEntries(specs.map((spec) => [spec.key, spec.label]));
  const cleanQuality = status === ENRICHED ? removePendingFlag(quality) : quality;

  const nextRaw: Json = {
    ...raw,
    ...(parsed.model ? { model: parsed.model } : {}),
    ...(parsed.supplierCode ? { supplier_code: parsed.supplierCode } : {}),
    ...(parsed.gtin ? { gtin13: parsed.gtin } : {}),
    ...(parsed.brand ? { brand: parsed.brand } : {}),
    ...(parsed.manualUrl ? { manual_url: parsed.manualUrl } : {}),
    specifications_json: JSON.stringify(specificationValues),
    specification_labels_json: JSON.stringify(specificationLabels),
    crawl_status: status,
    description_quality: status === ENRICHED ? "supplier_body_structured_specs" : status === NO_SPECS ? "supplier_body_no_structured_specs" : "supplier_body_enrichment_failed",
    description_basis: status === ENRICHED ? "supplier product page + structured specifications" : text(raw.description_basis),
    specification_evidence_urls: row.source_url ?? "",
    last_researched_date: today,
    stage2_enriched_at: now
  };
  const nextNormalized: Json = {
    ...normalized,
    crawlStatus: status,
    ...(status === ENRICHED ? { descriptionEl: enrichedDescription(row.title, specs) } : {}),
    descriptionQuality: status === ENRICHED ? "supplier_body_structured_specs" : status === NO_SPECS ? "supplier_body_no_structured_specs" : "supplier_body_enrichment_failed",
    ...(status === ENRICHED ? { descriptionBasis: "supplier product page + structured specifications" } : {}),
    specificationEvidenceUrls: row.source_url ? [row.source_url] : [],
    specificationLabels,
    ...(parsed.manualUrl ? { manualUrl: parsed.manualUrl } : {}),
    lastResearchedDate: today,
    stage2EnrichedAt: now
  };
  const nextQuality: Json = {
    ...cleanQuality,
    researchPriority: status === ENRICHED ? "complete" : "P1",
    researchPriorityReason: status === ENRICHED ? "supplier_body_enriched" : status,
    enrichmentAttemptedAt: now,
    enrichmentSpecCount: specs.length,
    enrichmentSourceUrl: row.source_url,
    ...(parsed.error ? { enrichmentError: parsed.error } : {}),
    ...(identityMismatch ? { enrichmentIdentityMismatch: { expectedSupplierCode: row.supplier_code, observedSupplierCode: parsed.supplierCode } } : {})
  };
  const nextIdentity: Json = {
    ...identity,
    ...(parsed.model ? { model: parsed.model } : {}),
    ...(parsed.supplierCode ? { supplierCode: parsed.supplierCode } : {}),
    ...(parsed.brand ? { brand: parsed.brand } : {}),
    ...(parsed.gtin ? { gtinCandidate: parsed.gtin, gtinStatus: "verified_supplier_page" } : {})
  };
  return { status, specs: specs.length, raw: nextRaw, normalized: nextNormalized, quality: nextQuality, identity: nextIdentity, manual: Boolean(parsed.manualUrl), gtin: Boolean(parsed.gtin) };
}

async function fetchParsed(origin: string, sourceProductId: string, cookie: string | null): Promise<{ status: number; parsed: Parsed }> {
  try {
    const response = await fetch(`${origin}/api/catalog/nikolaou-stage2/${encodeURIComponent(sourceProductId)}`, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000)
    });
    const parsed = await response.json().catch(() => ({ error: `non_json_${response.status}` })) as Parsed;
    return { status: response.status, parsed };
  } catch (error) {
    return { status: 599, parsed: { error: error instanceof Error ? error.message : String(error) } };
  }
}

export async function GET(request: Request) {
  if (!productionDatabaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const pool = getProductionPostgresRuntime().sqlPool;
  const controlResult = await pool.query<{ market_id: string; value: Json }>(`
    SELECT cs.market_id::text,ss.value
    FROM catalog_sources cs
    JOIN system_settings ss ON ss.market_id=cs.market_id AND ss.key=$2
    WHERE cs.code=$1 AND cs.active=true
    ORDER BY cs.created_at DESC,cs.id DESC
    LIMIT 1
  `, [SOURCE_CODE, CONTROL_KEY]);
  const control = controlResult.rows[0];
  const controlValue = objectValue(control?.value);
  if (!control || controlValue.enabled !== true || !authorized(request.headers.get("x-crawl-token"), text(controlValue.tokenSha256))) {
    return new NextResponse(null, { status: 404 });
  }
  const parentSnapshotId = text(controlValue.parentSnapshotId);
  const stage2SnapshotId = text(controlValue.stage2SnapshotId);
  if (!parentSnapshotId || !stage2SnapshotId) return NextResponse.json({ error: "crawl_control_invalid" }, { status: 500 });

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 12);
  const limit = Math.max(1, Math.min(20, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 12));
  const client = await pool.connect();
  let locked = false;
  try {
    const lockResult = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [LOCK_KEY]);
    locked = lockResult.rows[0]?.locked === true;
    if (!locked) return NextResponse.json({ ok: false, busy: true }, { status: 409 });

    const countResult = await client.query<{ total: string }>("SELECT count(*)::text AS total FROM catalog_source_products WHERE snapshot_id=$1::uuid", [stage2SnapshotId]);
    const offset = Number(countResult.rows[0]?.total ?? 0);
    const rowsResult = await client.query<SourceRow>(`
      SELECT id::text,source_id::text,source_taxonomy_node_id::text,source_product_key,supplier_code,title,
             source_url,source_image_url,source_identity,raw_payload,normalized_payload,quality_payload,
             price_state,classification_status
      FROM catalog_source_products
      WHERE snapshot_id=$1::uuid AND normalized_payload->>'crawlStatus'=$2
      ORDER BY supplier_code NULLS LAST,source_product_key,id
      OFFSET $3 LIMIT $4
    `, [parentSnapshotId, PENDING, offset, limit]);
    const rows = rowsResult.rows;
    const origin = new URL(request.url).origin;
    const cookie = request.headers.get("cookie");
    const fetched: Array<{ row: SourceRow; status: number; parsed: Parsed }> = [];
    for (let index = 0; index < rows.length; index += 5) {
      const chunk = rows.slice(index, index + 5);
      const results = await Promise.all(chunk.map(async (row) => ({ row, ...(await fetchParsed(origin, row.id, cookie)) })));
      fetched.push(...results);
    }

    const summary = { enriched: 0, noSpecs: 0, failed: 0, mismatch: 0, specs: 0, manuals: 0, gtins: 0 };
    const sample: Array<Record<string, unknown>> = [];
    for (const item of fetched) {
      const evidence = nextEvidence(item.row, item.parsed, item.status);
      await client.query(`
        INSERT INTO catalog_source_products(
          snapshot_id,source_id,source_taxonomy_node_id,source_product_key,supplier_code,title,source_url,source_image_url,
          source_identity,raw_payload,normalized_payload,quality_payload,price_state,classification_status
        ) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14)
        ON CONFLICT (snapshot_id,source_product_key) DO NOTHING
      `, [stage2SnapshotId, item.row.source_id, item.row.source_taxonomy_node_id, item.row.source_product_key, item.row.supplier_code, item.row.title, item.row.source_url, item.row.source_image_url, JSON.stringify(evidence.identity), JSON.stringify(evidence.raw), JSON.stringify(evidence.normalized), JSON.stringify(evidence.quality), item.row.price_state, item.row.classification_status]);
      if (evidence.status === ENRICHED) summary.enriched += 1;
      else if (evidence.status === NO_SPECS) summary.noSpecs += 1;
      else if (evidence.status === MISMATCH) summary.mismatch += 1;
      else summary.failed += 1;
      summary.specs += evidence.specs;
      if (evidence.manual) summary.manuals += 1;
      if (evidence.gtin) summary.gtins += 1;
      if (sample.length < 8) sample.push({ code: item.row.supplier_code, status: evidence.status, specs: evidence.specs, supplierHttpStatus: item.status });
    }
    const totalResult = await client.query<{ total: string }>("SELECT count(*)::text AS total FROM catalog_source_products WHERE snapshot_id=$1::uuid", [stage2SnapshotId]);
    const totalStage2 = Number(totalResult.rows[0]?.total ?? offset);
    return NextResponse.json({ ok: true, offset, attempted: rows.length, totalStage2, remaining: Math.max(0, 3151 - totalStage2), batch: summary, sample }, { headers: { "cache-control": "private, no-store" } });
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
