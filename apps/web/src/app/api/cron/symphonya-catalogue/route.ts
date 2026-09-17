import { createHash } from "node:crypto";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { SymphonyaHttpTransport } from "../../../../../../../integrations/dropship-suppliers/src/symphonya-http.ts";
import { normalizeSymphonyaProduct } from "../../../../../../../integrations/dropship-suppliers/src/symphonya-normalize.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });

  const tokenSha256 = createHash("sha256").update(token).digest("hex");
  const pool = getProductionPostgresRuntime().sqlPool;
  const claimed = await pool.query(`
    UPDATE public.catalog_sources
       SET metadata=COALESCE(metadata,'{}'::jsonb) - 'symphonyaManualSync',
           updated_at=now()
     WHERE code='symphonya'
       AND active=true
       AND metadata #>> '{symphonyaManualSync,tokenSha256}' = $1
    RETURNING id
  `, [tokenSha256]);

  const sourceId = claimed.rows[0]?.id ? String(claimed.rows[0].id) : "";
  if (!sourceId) return Response.json({ error: "unauthorized_or_consumed" }, { status: 401 });

  try {
    const apiKey = process.env.SYMPHONYA_API_KEY?.trim();
    if (!apiKey) throw new Error("SYMPHONYA_API_KEY is required");
    const client = new SymphonyaHttpTransport({
      apiKey,
      baseUrl: process.env.SYMPHONYA_API_BASE_URL,
      requestTimeoutMs: positiveInteger(process.env.SYMPHONYA_REQUEST_TIMEOUT_MS, 20_000)
    });

    // Controlled first import: ten currently available products only. getProducts already
    // carries the English PIM description, so this path intentionally avoids the live
    // getProductDetails parser incompatibility discovered during the first attempt.
    const page = await client.getProducts({
      page: 1,
      limit: 10,
      lang: "en",
      includeOutOfStock: false,
      includeDescription: true
    });
    const evidence = page.products.map((product) => normalizeSymphonyaProduct(product));
    const rawPayload = JSON.stringify(page.products.map((product) => product.raw));
    const sourceHash = createHash("sha256").update(rawPayload).digest("hex");

    const snapshot = await pool.query(`
      INSERT INTO public.catalog_source_snapshots(
        source_id,source_filename,source_hash,source_version,observed_at,row_count,metadata
      ) VALUES(
        $1::uuid,$2,$3,$4,now(),$5,$6::jsonb
      )
      ON CONFLICT (source_id,source_hash) DO UPDATE
        SET observed_at=EXCLUDED.observed_at,
            row_count=EXCLUDED.row_count,
            metadata=EXCLUDED.metadata
      RETURNING id
    `, [
      sourceId,
      `symphonya-controlled-sample-${new Date().toISOString()}.json`,
      sourceHash,
      "symphonya-api-v1:controlled-sample",
      evidence.length,
      JSON.stringify({
        provider: "symphonya_public_api",
        mode: "controlled_sample",
        page: 1,
        limit: 10,
        includesOutOfStock: false,
        includeDescription: true,
        language: "en"
      })
    ]);
    const snapshotId = String(snapshot.rows[0]?.id ?? "");
    if (!snapshotId) throw new Error("Symphonya controlled snapshot could not be resolved");

    if (evidence.length) {
      const rows = evidence.map((item) => ({
        source_product_key: item.sourceProductKey,
        supplier_code: item.supplierCode,
        title: item.title,
        source_image_url: item.sourceImageUrl,
        source_identity: item.sourceIdentity,
        raw_payload: item.rawPayload,
        normalized_payload: item.normalizedPayload,
        quality_payload: item.qualityPayload,
        price_state: item.priceState,
        classification_status: item.classificationStatus
      }));
      await pool.query(`
        INSERT INTO public.catalog_source_products(
          snapshot_id,source_id,source_product_key,supplier_code,title,source_image_url,
          source_identity,raw_payload,normalized_payload,quality_payload,price_state,classification_status
        )
        SELECT
          $1::uuid,$2::uuid,x.source_product_key,NULLIF(x.supplier_code,''),x.title,NULLIF(x.source_image_url,''),
          x.source_identity,x.raw_payload,x.normalized_payload,x.quality_payload,x.price_state,x.classification_status
        FROM jsonb_to_recordset($3::jsonb) AS x(
          source_product_key text,
          supplier_code text,
          title text,
          source_image_url text,
          source_identity jsonb,
          raw_payload jsonb,
          normalized_payload jsonb,
          quality_payload jsonb,
          price_state text,
          classification_status text
        )
        ON CONFLICT (snapshot_id,source_product_key) DO NOTHING
      `, [snapshotId, sourceId, JSON.stringify(rows)]);
    }

    await pool.query(`
      UPDATE public.dropship_suppliers
         SET last_healthcheck_at=now(),
             last_healthcheck_ok=true,
             configuration=COALESCE(configuration,'{}'::jsonb) - 'lastHealthcheckError',
             updated_at=now()
       WHERE code='symphonya'
    `);
    await pool.query(`
      UPDATE public.catalog_sources
         SET metadata=jsonb_set(
               COALESCE(metadata,'{}'::jsonb),
               '{symphonyaControlledSample}',
               $2::jsonb,
               true
             ),
             updated_at=now()
       WHERE id=$1::uuid
    `, [sourceId, JSON.stringify({
      importedAt: new Date().toISOString(),
      products: evidence.length,
      sourceHash,
      onlyAvailable: true,
      descriptions: "en"
    })]);

    return Response.json({
      ok: true,
      mode: "controlled_sample",
      snapshotId,
      products: evidence.length,
      hasMore: page.hasMore
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "symphonya_catalogue_sync_failed";
    await pool.query(`
      UPDATE public.dropship_suppliers
         SET last_healthcheck_at=now(),
             last_healthcheck_ok=false,
             configuration=jsonb_set(COALESCE(configuration,'{}'::jsonb),'{lastHealthcheckError}',to_jsonb($1::text),true),
             updated_at=now()
       WHERE code='symphonya'
    `, [message]).catch(() => undefined);
    console.error(JSON.stringify({ level: "error", event: "symphonya.catalogue_manual_sync_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
