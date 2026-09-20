import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { resolveSymphonyaCategoryCode } from "./symphonya-category-mapping";
import { canonicalSymphonyaSlug } from "./symphonya-canonical-slug";
import { resolveSymphonyaCommercePolicy } from "./symphonya-commerce-policy";

const SUPPLIER_CODE = "symphonya";
const EXPECTED_OWNER_VENDOR = "vendor_e8cb57b3c67b469d9a9d";
const SOURCE_MARKER = "symphonya_api_v1";
const CURSOR_KEY = "symphonyaMaterializationCursor";
const FASHION_PRIORITY_CURSOR_KEY = "symphonyaFashionMaterializationCursorV1";
const PRIORITY_COMPLETE_SENTINEL = "~done";
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 250;
const DEFAULT_TAX_RATE_BPS = 2400;
const MATERIALIZATION_LEASE_SECONDS = 70;

type SupplierContext = Readonly<{
  supplierId: string;
  sourceId: string;
  vendorId: string;
  vendorPublicId: string;
  locationId: string;
  marketId: string;
  cursor: string | null;
  fashionPriorityCursor: string | null;
}>;

type SourceProduct = Readonly<{
  id: string;
  snapshotId: string;
  sourceProductKey: string;
  title: string;
  normalizedPayload: Readonly<Record<string, unknown>>;
}>;

type SourceVariant = Readonly<{
  externalVariantId: string;
  sku: string | null;
  barcode: string | null;
  buyingCostMinor: number | null;
  msrpMinor: number | null;
  available: boolean;
  quantity: number | null;
  stockStatus: string | null;
  warehouse: string | null;
  attributes: Readonly<Record<string, string>>;
}>;

export type SymphonyaMaterializationSliceResult = Readonly<{
  enabled: boolean;
  scanned: number;
  variants: number;
  canonicalsCreated: number;
  familiesCreated: number;
  offersCreated: number;
  reusedCanonicals: number;
  blockedAmbiguous: number;
  blockedUnmapped: number;
  message?: string;
}>;

export function symphonyaMaterializationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BLS_SYMPHONYA_MATERIALIZATION_ENABLED?.trim().toLowerCase() !== "false";
}

export async function runSymphonyaCatalogueMaterializationSlice(): Promise<SymphonyaMaterializationSliceResult> {
  if (!symphonyaMaterializationEnabled()) return emptyResult(false, "materialization_disabled");

  const pool = getProductionPostgresRuntime().sqlPool;
  const contextResult = await pool.query<SqlRow>(`
    SELECT ds.id::text supplier_id,
           ds.catalog_source_id::text source_id,
           ds.owner_vendor_id::text vendor_id,
           vb.public_id vendor_public_id,
           ds.owner_location_id::text location_id,
           ds.market_id::text market_id,
           cs.metadata->>$2 cursor,
           cs.metadata->>$3 fashion_priority_cursor
      FROM public.dropship_suppliers ds
      JOIN public.catalog_sources cs ON cs.id=ds.catalog_source_id
      JOIN public.vendor_businesses vb ON vb.id=ds.owner_vendor_id
      JOIN public.vendor_locations vl ON vl.id=ds.owner_location_id
     WHERE ds.code=$1
       AND ds.active=true
       AND ds.catalogue_sync_enabled=true
       AND vl.active=true
     LIMIT 1
  `, [SUPPLIER_CODE, CURSOR_KEY, FASHION_PRIORITY_CURSOR_KEY]);

  const row = contextResult.rows[0];
  if (!row) return emptyResult(false, "supplier_disabled_or_missing_location");

  const context: SupplierContext = {
    supplierId: requiredText(row.supplier_id, "supplier id"),
    sourceId: requiredText(row.source_id, "source id"),
    vendorId: requiredText(row.vendor_id, "vendor id"),
    vendorPublicId: requiredText(row.vendor_public_id, "vendor public id"),
    locationId: requiredText(row.location_id, "location id"),
    marketId: requiredText(row.market_id, "market id"),
    cursor: optionalText(row.cursor),
    fashionPriorityCursor: optionalText(row.fashion_priority_cursor)
  };
  if (context.vendorPublicId !== EXPECTED_OWNER_VENDOR) {
    throw new Error(`Symphonya supplier owner mismatch: ${context.vendorPublicId}`);
  }

  const leaseClaimed = await claimMaterializationLease(context.sourceId);
  if (!leaseClaimed) return emptyResult(true, "materialization_busy");

  try {
    let priorityBatch = false;
    let candidateRows: readonly SqlRow[] = [];

    // Run the fashion/clothing catch-up before resuming the full supplier cursor.
    if (context.fashionPriorityCursor !== PRIORITY_COMPLETE_SENTINEL) {
      const priorityCandidates = await pool.query<SqlRow>(`
        SELECT p.id,p.snapshot_id,p.source_product_key,p.title,p.normalized_payload
          FROM public.catalog_source_product_latest p
         WHERE p.source_id=$1::uuid
           AND ($2::text IS NULL OR p.source_product_key>$2)
           AND lower(COALESCE(p.normalized_payload #>> '{categoryDetails,cat}','')) IN ('fashion','clothing')
         ORDER BY p.source_product_key
         LIMIT $3
      `, [context.sourceId, context.fashionPriorityCursor, batchSize()]);

      if (priorityCandidates.rows.length) {
        priorityBatch = true;
        candidateRows = priorityCandidates.rows;
      } else {
        await persistNamedCursor(context.sourceId, FASHION_PRIORITY_CURSOR_KEY, PRIORITY_COMPLETE_SENTINEL);
      }
    }

    if (!candidateRows.length) {
      const candidates = await pool.query<SqlRow>(`
        SELECT p.id,p.snapshot_id,p.source_product_key,p.title,p.normalized_payload
          FROM public.catalog_source_product_latest p
         WHERE p.source_id=$1::uuid
           AND ($2::text IS NULL OR p.source_product_key>$2)
         ORDER BY p.source_product_key
         LIMIT $3
      `, [context.sourceId, context.cursor, batchSize()]);
      candidateRows = candidates.rows;

      if (!candidateRows.length) {
        if (context.cursor) {
          await persistCursor(context.sourceId, null);
          return emptyResult(true, "materialization_cursor_wrapped");
        }
        return emptyResult(true, "materialization_source_empty");
      }
    }

    const totals = {
      enabled: true,
      scanned: candidateRows.length,
      variants: 0,
      canonicalsCreated: 0,
      familiesCreated: 0,
      offersCreated: 0,
      reusedCanonicals: 0,
      blockedAmbiguous: 0,
      blockedUnmapped: 0
    };

    for (const raw of candidateRows) {
      const source: SourceProduct = {
        id: requiredText(raw.id, "source product id"),
        snapshotId: requiredText(raw.snapshot_id, "snapshot id"),
        sourceProductKey: requiredText(raw.source_product_key, "source product key"),
        title: requiredText(raw.title, "source title"),
        normalizedPayload: record(raw.normalized_payload)
      };
      const outcome = await materializeProduct(context, source);
      totals.variants += outcome.variants;
      totals.canonicalsCreated += outcome.canonicalsCreated;
      totals.familiesCreated += outcome.familiesCreated;
      totals.offersCreated += outcome.offersCreated;
      totals.reusedCanonicals += outcome.reusedCanonicals;
      totals.blockedAmbiguous += outcome.blockedAmbiguous;
      totals.blockedUnmapped += outcome.blockedUnmapped;

      // Fashion/clothing gets a one-time priority catch-up cursor so those
      // products do not wait behind tens of thousands of beauty rows. The
      // normal full-catalogue cursor remains untouched and will still visit
      // every source product in canonical order later.
      await persistNamedCursor(
        context.sourceId,
        priorityBatch ? FASHION_PRIORITY_CURSOR_KEY : CURSOR_KEY,
        source.sourceProductKey
      );
    }

    return totals;
  } finally {
    await releaseMaterializationLease(context.sourceId).catch(() => undefined);
  }
}

async function claimMaterializationLease(sourceId: string): Promise<boolean> {
  const claimed = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    UPDATE public.catalog_sources
       SET metadata=jsonb_set(
             COALESCE(metadata,'{}'::jsonb),
             '{symphonyaMaterializationLease}',
             jsonb_build_object(
               'leaseUntil',now()+make_interval(secs => $2::int),
               'claimedAt',now()
             ),
             true
           ),
           updated_at=now()
     WHERE id=$1::uuid
       AND (
         NULLIF(metadata #>> '{symphonyaMaterializationLease,leaseUntil}','') IS NULL
         OR (metadata #>> '{symphonyaMaterializationLease,leaseUntil}')::timestamptz < now()
       )
    RETURNING id
  `, [sourceId, MATERIALIZATION_LEASE_SECONDS]);
  return Boolean(claimed.rows[0]?.id);
}

async function releaseMaterializationLease(sourceId: string): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
       SET metadata=COALESCE(metadata,'{}'::jsonb)-'symphonyaMaterializationLease',
           updated_at=now()
     WHERE id=$1::uuid
  `, [sourceId]);
}

async function materializeProduct(context: SupplierContext, source: SourceProduct) {
  const pool = getProductionPostgresRuntime().sqlPool;
  const payload = source.normalizedPayload;
  const commercePolicy = resolveSymphonyaCommercePolicy(source.title, payload);
  const variants = normalizedVariants(payload);
  const brandId = await resolveOrCreateBrand(payload);
  const sourceCategoryId = await resolveSourceCategoryId(context, source);
  let canonicalsCreated = 0;
  let familiesCreated = 0;
  let offersCreated = 0;
  let reusedCanonicals = 0;
  let blockedAmbiguous = 0;
  let blockedUnmapped = 0;

  for (const variant of variants) {
    const existingSupplierOffer = await pool.query<SqlRow>(`
      SELECT dso.id::text supplier_offer_id,
             dso.vendor_offer_id::text vendor_offer_id,
             vo.canonical_variant_id::text canonical_variant_id,
             cv.commerce_channel,
             cv.condition,
             cv.bazaar_source
        FROM public.dropship_supplier_offers dso
        JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
        JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
       WHERE dso.supplier_id=$1::uuid
         AND dso.external_variant_id=$2
       LIMIT 1
    `, [context.supplierId, variant.externalVariantId]);

    let canonicalVariantId = optionalText(existingSupplierOffer.rows[0]?.canonical_variant_id);
    let matchMethod: "exact_gtin" | "enrichment" = "enrichment";

    if (canonicalVariantId) {
      const existingChannel = optionalText(existingSupplierOffer.rows[0]?.commerce_channel) ?? "normal";
      const existingCondition = optionalText(existingSupplierOffer.rows[0]?.condition) ?? "new";
      const existingBazaarSource = optionalText(existingSupplierOffer.rows[0]?.bazaar_source);
      if (
        existingChannel !== commercePolicy.commerceChannel
        || existingCondition !== commercePolicy.condition
        || existingBazaarSource !== commercePolicy.bazaarSource
      ) {
        const supplierOfferId = requiredText(existingSupplierOffer.rows[0]?.supplier_offer_id, "supplier offer id");
        const vendorOfferId = requiredText(existingSupplierOffer.rows[0]?.vendor_offer_id, "vendor offer id");

        // Fail closed on a supplier classification transition. The previous
        // offer is removed from discovery before its supplier identity is
        // retired, then this same pass is free to materialize a fresh
        // canonical strictly inside the newly classified commerce channel.
        await pool.query(`
          WITH hidden_offer AS (
            UPDATE public.vendor_offers
               SET merchant_visible=false,
                   merchant_pause_active=true,
                   updated_at=now()
             WHERE id=$1::uuid
             RETURNING id
          )
          UPDATE public.dropship_supplier_offers
             SET external_variant_id=external_variant_id
                   || '#retired-channel-'
                   || left(replace(id::text,'-',''),16),
                 active=false,
                 cached_available=false,
                 cached_quantity=0,
                 availability_expires_at=now(),
                 availability_payload=COALESCE(availability_payload,'{}'::jsonb)
                   || jsonb_build_object(
                     'channelTransitionRetired',true,
                     'previousCommerceChannel',$3::text,
                     'targetCommerceChannel',$4::text,
                     'retiredAt',now()
                   ),
                 updated_at=now()
           WHERE id=$2::uuid
             AND EXISTS (SELECT 1 FROM hidden_offer)
        `, [vendorOfferId, supplierOfferId, existingChannel, commercePolicy.commerceChannel]);

        await upsertReview(context, source, canonicalVariantId, {
          reason: "symphonya_commerce_policy_transition",
          externalVariantId: variant.externalVariantId,
          actual: {
            commerceChannel: existingChannel,
            condition: existingCondition,
            bazaarSource: existingBazaarSource
          },
          expected: commercePolicy
        }, "canonical_identity_ambiguous");

        canonicalVariantId = null;
      }
    }

    const approvedLink = await pool.query<SqlRow>(`
      SELECT l.canonical_variant_id::text canonical_variant_id,
             (array_agg(l.match_method ORDER BY l.updated_at DESC,l.id DESC))[1] match_method
        FROM public.catalog_source_product_links l
        JOIN public.catalog_source_products linked_source
          ON linked_source.id=l.source_product_id
        JOIN public.canonical_variants linked_cv
          ON linked_cv.id=l.canonical_variant_id
       WHERE linked_source.source_id=$1::uuid
         AND linked_source.source_product_key=$2
         AND linked_cv.commerce_channel=$3
         AND ($3='normal' OR linked_cv.bazaar_source=$4)
         AND l.link_status='approved'
         AND l.canonical_variant_id IS NOT NULL
       GROUP BY l.canonical_variant_id
       ORDER BY max(l.updated_at) DESC,l.canonical_variant_id::text
       LIMIT 2
    `, [context.sourceId, source.sourceProductKey, commercePolicy.commerceChannel, commercePolicy.bazaarSource]);
    if (!canonicalVariantId && approvedLink.rows.length > 1) {
      blockedAmbiguous += 1;
      await upsertReview(context, source, null, {
        reason: "historical_source_link_collision",
        externalVariantId: variant.externalVariantId
      });
      continue;
    }
    if (!canonicalVariantId && approvedLink.rows[0]) {
      canonicalVariantId = requiredText(approvedLink.rows[0].canonical_variant_id, "linked canonical id");
      matchMethod = approvedLink.rows[0].match_method === "exact_gtin" ? "exact_gtin" : "enrichment";
      reusedCanonicals += 1;
    }

    if (!canonicalVariantId) {
      // Source-scoped canonical recovery is only required after a partial prior
      // materialization. New source products have no source family yet, so use
      // the indexed family identity as a cheap guard instead of scanning the
      // entire canonical catalogue on every first-pass product.
      const recoveryFamily = await pool.query<SqlRow>(`
        SELECT id::text id
          FROM public.product_families
         WHERE source_supplier_id=$1::uuid
           AND source_external_product_id=$2
         LIMIT 1
      `, [context.supplierId, source.sourceProductKey]);

      if (recoveryFamily.rows[0]) {
        const scoped = await pool.query<SqlRow>(`
          SELECT id::text id
            FROM public.canonical_variants
           WHERE family_id=$1::uuid
             AND commerce_channel=$2
             AND ($2='normal' OR bazaar_source=$3)
             AND variant_attributes->>'source'=$4
             AND variant_attributes->>'externalVariantId'=$5
           ORDER BY created_at,id
           LIMIT 2
        `, [
          requiredText(recoveryFamily.rows[0].id, "recovery family id"),
          commercePolicy.commerceChannel,
          commercePolicy.bazaarSource,
          SOURCE_MARKER,
          variant.externalVariantId
        ]);
        if (scoped.rows.length > 1) {
          blockedAmbiguous += 1;
          await upsertReview(context, source, null, {
            reason: "source_scoped_collision",
            externalVariantId: variant.externalVariantId
          });
          continue;
        }
        if (scoped.rows[0]) {
          canonicalVariantId = requiredText(scoped.rows[0].id, "source canonical id");
          reusedCanonicals += 1;
        }
      }
    }

    const gtin = normalizeGlobalIdentifier(variant.barcode);
    if (!canonicalVariantId && gtin) {
      const matches = await pool.query<SqlRow>(`
        SELECT DISTINCT q.id::text id
          FROM (
            SELECT cv.id
              FROM public.canonical_variants cv
             WHERE cv.market_id=$1::uuid
               AND cv.commerce_channel=$4
               AND ($4='normal' OR cv.bazaar_source=$5)
               AND cv.recalled=false
               AND cv.gtin=$2
            UNION ALL
            SELECT cv.id
              FROM public.product_identifiers pi
              JOIN public.canonical_variants cv ON cv.id=pi.canonical_variant_id
             WHERE pi.active=true
               AND pi.identifier_scope='trade_item'
               AND pi.identifier_type=$3
               AND pi.normalized_value=$2
               AND cv.market_id=$1::uuid
               AND cv.commerce_channel=$4
               AND ($4='normal' OR cv.bazaar_source=$5)
               AND cv.recalled=false
          ) q
         ORDER BY q.id::text
         LIMIT 2
      `, [context.marketId, gtin.value, gtin.type, commercePolicy.commerceChannel, commercePolicy.bazaarSource]);

      if (matches.rows.length > 1) {
        blockedAmbiguous += 1;
        await upsertReview(context, source, null, {
          reason: "global_identifier_ambiguous",
          externalVariantId: variant.externalVariantId,
          gtin: gtin.value
        });
        continue;
      }
      if (matches.rows[0]) {
        canonicalVariantId = requiredText(matches.rows[0].id, "matched canonical id");
        matchMethod = "exact_gtin";
        reusedCanonicals += 1;
      }
    }

    let familyId: string | null = null;
    if (canonicalVariantId) {
      const canonical = await pool.query<SqlRow>(
        `SELECT family_id::text family_id FROM public.canonical_variants WHERE id=$1::uuid`,
        [canonicalVariantId]
      );
      familyId = optionalText(canonical.rows[0]?.family_id);
    }
    if (!familyId) {
      if (!sourceCategoryId) {
        blockedUnmapped += 1;
        await upsertReview(context, source, null, {
          reason: "symphonya_taxonomy_unmapped",
          externalVariantId: variant.externalVariantId,
          categoryDetails: record(payload.categoryDetails)
        }, "taxonomy_missing");
        continue;
      }
      const family = await ensureSourceFamily(context, source, brandId, sourceCategoryId);
      familyId = family.id;
      familiesCreated += family.created ? 1 : 0;
    }

    if (!canonicalVariantId) {
      const slug = canonicalSymphonyaSlug(source.title, source.sourceProductKey, variant.externalVariantId);
      const created = await pool.query<SqlRow>(`
        INSERT INTO public.canonical_variants(
          market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,
          commerce_channel,bazaar_source,variant_attributes,platform_price_minor,
          currency,tax_rate_bps,active,suppressed,recalled
        ) VALUES(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,NULL,$7,$8,
          $9,$10,$11::jsonb,NULL,'EUR',$12,false,false,false
        )
        RETURNING id::text id
      `, [
        context.marketId,
        familyId,
        brandId,
        sourceCategoryId,
        slug,
        gtin?.value ?? null,
        productModel(payload),
        commercePolicy.condition,
        commercePolicy.commerceChannel,
        commercePolicy.bazaarSource,
        JSON.stringify({
          ...variant.attributes,
          source: SOURCE_MARKER,
          externalProductId: source.sourceProductKey,
          externalVariantId: variant.externalVariantId,
          supplierTester: commercePolicy.supplierTester,
          commerceChannel: commercePolicy.commerceChannel,
          ...(commercePolicy.bazaarSource ? { bazaarSource: commercePolicy.bazaarSource } : {})
        }),
        DEFAULT_TAX_RATE_BPS
      ]);
      canonicalVariantId = requiredText(created.rows[0]?.id, "created canonical id");
      canonicalsCreated += 1;
    } else {
      await pool.query(`
        UPDATE public.canonical_variants
           SET family_id=COALESCE(family_id,$2::uuid),
               brand_id=COALESCE(brand_id,$3::uuid),
               category_id=COALESCE(category_id,$4::uuid),
               updated_at=CASE
                 WHEN family_id IS NULL
                   OR (brand_id IS NULL AND $3::uuid IS NOT NULL)
                   OR (category_id IS NULL AND $4::uuid IS NOT NULL)
                 THEN now() ELSE updated_at END
         WHERE id=$1::uuid
      `, [canonicalVariantId, familyId, brandId, sourceCategoryId]);
    }

    await pool.query(`
      INSERT INTO public.product_translations(
        canonical_variant_id,locale,title,description,specifications,seo_title,seo_description
      ) VALUES($1::uuid,'en',$2,$3,$4::jsonb,NULL,NULL)
      ON CONFLICT (canonical_variant_id,locale) DO NOTHING
    `, [
      canonicalVariantId,
      source.title,
      optionalText(payload.description),
      JSON.stringify({ source: SOURCE_MARKER, supplierContent: true })
    ]);

    if (gtin) {
      await pool.query(`
        INSERT INTO public.product_identifiers(
          canonical_variant_id,identifier_type,issuer_brand_id,normalized_value,display_value,
          active,is_primary,verification_status,source,source_reference,confidence,identifier_scope
        ) VALUES($1::uuid,$2,NULL,$3,$3,true,true,'format_valid','import',$4,1,'trade_item')
        ON CONFLICT DO NOTHING
      `, [
        canonicalVariantId,
        gtin.type,
        gtin.value,
        `symphonya:${source.sourceProductKey}:${variant.externalVariantId}`
      ]);
    }

    await pool.query(`
      INSERT INTO public.catalog_source_product_links(
        source_product_id,canonical_variant_id,link_status,match_method,confidence,reasons,reviewed_at
      ) VALUES($1::uuid,$2::uuid,'approved',$3,1,$4::jsonb,now())
      ON CONFLICT (source_product_id,canonical_variant_id)
      DO UPDATE SET link_status='approved',match_method=EXCLUDED.match_method,
                    confidence=EXCLUDED.confidence,reasons=EXCLUDED.reasons,updated_at=now()
    `, [
      source.id,
      canonicalVariantId,
      matchMethod,
      JSON.stringify([{
        source: SOURCE_MARKER,
        externalProductId: source.sourceProductKey,
        externalVariantId: variant.externalVariantId,
        gtin: gtin?.value ?? null,
        rule: matchMethod === "exact_gtin" ? "global_identifier" : "supplier_scoped"
      }])
    ]);

    const vendorSku = `symphonya:${variant.externalVariantId}`;
    const vendorOffer = await pool.query<SqlRow>(`
      INSERT INTO public.vendor_offers(
        market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,source_gtin,status,
        supplier_unit_price_minor,currency,supplier_tax_rate_bps,lead_time_minutes,fulfilment_modes,
        advice_capabilities,source_payload,customer_price_minor,merchant_visible,merchant_pause_active,
        msrp_minor,show_msrp
      ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,'draft',
        $7,'EUR',$8,NULL,ARRAY['shipping'::fulfilment_mode],
        '{}'::jsonb,$9::jsonb,$10,false,false,$11,false
      )
      ON CONFLICT (vendor_id,location_id,canonical_variant_id,vendor_sku)
      DO UPDATE SET
        source_gtin=COALESCE(EXCLUDED.source_gtin,public.vendor_offers.source_gtin),
        supplier_unit_price_minor=EXCLUDED.supplier_unit_price_minor,
        source_payload=public.vendor_offers.source_payload || EXCLUDED.source_payload,
        msrp_minor=COALESCE(EXCLUDED.msrp_minor,public.vendor_offers.msrp_minor),
        updated_at=now()
      RETURNING id::text id,(xmax=0) AS inserted
    `, [
      context.marketId,
      context.vendorId,
      context.locationId,
      canonicalVariantId,
      vendorSku,
      gtin?.value ?? variant.barcode,
      variant.buyingCostMinor ?? 0,
      DEFAULT_TAX_RATE_BPS,
      JSON.stringify({
        dropship: true,
        supplierCode: SUPPLIER_CODE,
        externalProductId: source.sourceProductKey,
        externalVariantId: variant.externalVariantId,
        externalSku: variant.sku,
        publicationState: "STAGED",
        pricingPending: true,
        supplierContentSource: "catalog_source_products",
        schemaPolicy: "catalog_identity_v3_simplified",
        supplierTester: commercePolicy.supplierTester,
        commerceChannel: commercePolicy.commerceChannel,
        bazaarSource: commercePolicy.bazaarSource,
        catalogueRouting: commercePolicy.supplierTester ? "symphonya_tester_bazaar_v1" : "symphonya_normal_v1"
      }),
      Math.max(0, variant.buyingCostMinor ?? 0),
      variant.msrpMinor
    ]);
    const vendorOfferId = requiredText(vendorOffer.rows[0]?.id, "vendor offer id");

    await pool.query(`
      INSERT INTO public.vendor_offer_pricing_private(
        offer_id,vendor_id,buying_price_minor,pricing_mode,markup_type,markup_value,
        discount_type,discount_value
      ) VALUES($1::uuid,$2::uuid,$3,'manual',NULL,NULL,NULL,NULL)
      ON CONFLICT(offer_id) DO UPDATE SET
        buying_price_minor=EXCLUDED.buying_price_minor,
        updated_at=now()
    `, [vendorOfferId, context.vendorId, variant.buyingCostMinor]);

    const supplierOffer = await pool.query<SqlRow>(`
      INSERT INTO public.dropship_supplier_offers(
        supplier_id,vendor_offer_id,source_product_id,external_product_id,external_variant_id,
        external_sku,ean,mpn,warehouse_code,supplier_cost_minor,supplier_currency,
        cached_available,cached_quantity,availability_checked_at,availability_expires_at,
        availability_payload,last_catalogue_sync_at,active
      ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,NULL,$8,$9,'EUR',
        $10,$11,now(),now()+interval '10 minutes',$12::jsonb,now(),false
      )
      ON CONFLICT (supplier_id,external_variant_id)
      DO UPDATE SET
        vendor_offer_id=EXCLUDED.vendor_offer_id,
        source_product_id=EXCLUDED.source_product_id,
        external_product_id=EXCLUDED.external_product_id,
        external_sku=COALESCE(EXCLUDED.external_sku,public.dropship_supplier_offers.external_sku),
        ean=COALESCE(EXCLUDED.ean,public.dropship_supplier_offers.ean),
        warehouse_code=COALESCE(EXCLUDED.warehouse_code,public.dropship_supplier_offers.warehouse_code),
        supplier_cost_minor=EXCLUDED.supplier_cost_minor,
        supplier_currency=EXCLUDED.supplier_currency,
        cached_available=CASE
          WHEN COALESCE(public.dropship_supplier_offers.availability_payload->>'priceHeld','false')='true'
          THEN false ELSE EXCLUDED.cached_available END,
        cached_quantity=CASE
          WHEN COALESCE(public.dropship_supplier_offers.availability_payload->>'priceHeld','false')='true'
          THEN 0 ELSE EXCLUDED.cached_quantity END,
        availability_checked_at=EXCLUDED.availability_checked_at,
        availability_expires_at=EXCLUDED.availability_expires_at,
        availability_payload=public.dropship_supplier_offers.availability_payload || EXCLUDED.availability_payload,
        last_catalogue_sync_at=now(),
        updated_at=now()
      RETURNING (xmax=0) AS inserted
    `, [
      context.supplierId,
      vendorOfferId,
      source.id,
      source.sourceProductKey,
      variant.externalVariantId,
      variant.sku,
      gtin?.value ?? variant.barcode,
      variant.warehouse,
      variant.buyingCostMinor,
      variant.available,
      variant.quantity,
      JSON.stringify({
        source: "symphonya_catalogue_materializer",
        stockStatus: variant.stockStatus,
        backordersAllowed: false,
        staged: true
      })
    ]);
    if (supplierOffer.rows[0]?.inserted === true || vendorOffer.rows[0]?.inserted === true) offersCreated += 1;
  }

  return {
    variants: variants.length,
    canonicalsCreated,
    familiesCreated,
    offersCreated,
    reusedCanonicals,
    blockedAmbiguous,
    blockedUnmapped
  };
}

async function ensureSourceFamily(
  context: SupplierContext,
  source: SourceProduct,
  brandId: string | null,
  categoryId: string
): Promise<Readonly<{ id: string; created: boolean }>> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const existing = await pool.query<SqlRow>(`
    SELECT id::text id
      FROM public.product_families
     WHERE source_supplier_id=$1::uuid
       AND source_external_product_id=$2
     LIMIT 1
  `, [context.supplierId, source.sourceProductKey]);
  if (existing.rows[0]) return { id: requiredText(existing.rows[0].id, "family id"), created: false };

  const inserted = await pool.query<SqlRow>(`
    INSERT INTO public.product_families(
      market_id,brand_id,category_id,model,active,source_supplier_id,source_external_product_id
    ) VALUES($1::uuid,$2::uuid,$3::uuid,$4,false,$5::uuid,$6)
    ON CONFLICT (source_supplier_id,source_external_product_id)
      WHERE source_supplier_id IS NOT NULL AND source_external_product_id IS NOT NULL
    DO UPDATE SET
      brand_id=COALESCE(public.product_families.brand_id,EXCLUDED.brand_id),
      updated_at=now()
    RETURNING id::text id,(xmax=0) AS inserted
  `, [
    context.marketId,
    brandId,
    categoryId,
    productModel(source.normalizedPayload) ?? source.title,
    context.supplierId,
    source.sourceProductKey
  ]);
  return {
    id: requiredText(inserted.rows[0]?.id, "family id"),
    created: inserted.rows[0]?.inserted === true
  };
}

async function resolveSourceCategoryId(context: SupplierContext, source: SourceProduct): Promise<string | null> {
  const code = resolveSymphonyaCategoryCode(source.normalizedPayload, source.title);
  if (!code) return null;
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT id::text id
      FROM public.categories
     WHERE market_id=$1::uuid
       AND code=$2
       AND active=true
       AND assignable=true
       AND taxonomy_role='product_class'
     LIMIT 1
  `, [context.marketId, code]);
  return optionalText(result.rows[0]?.id);
}

async function resolveOrCreateBrand(payload: Readonly<Record<string, unknown>>): Promise<string | null> {
  const brandName = nestedName(payload.brand);
  if (!brandName) return null;
  const normalized = brandName.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized) return null;
  const pool = getProductionPostgresRuntime().sqlPool;
  const existing = await pool.query<SqlRow>(`
    SELECT id::text id FROM (
      SELECT b.id,0 priority FROM public.brands b WHERE b.normalized_name=$1
      UNION ALL
      SELECT b.id,1 FROM public.brand_aliases a
        JOIN public.brands b ON b.id=a.brand_id
       WHERE a.active=true AND a.normalized_alias=$1 AND b.status='active'
    ) q
    ORDER BY priority,id
    LIMIT 2
  `, [normalized]);
  const ids = [...new Set(existing.rows.map((row) => String(row.id)))];
  if (ids.length === 1) return ids[0];
  if (ids.length > 1) return null;
  const created = await pool.query<SqlRow>(`
    INSERT INTO public.brands(name,normalized_name,status)
    VALUES($1,$2,'active')
    ON CONFLICT(normalized_name) DO UPDATE SET updated_at=now()
    RETURNING id::text id
  `, [brandName, normalized]);
  return optionalText(created.rows[0]?.id);
}

async function upsertReview(
  context: SupplierContext,
  source: SourceProduct,
  candidateVariantId: string | null,
  details: Readonly<Record<string, unknown>>,
  reasonCode = "canonical_identity_ambiguous"
): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    INSERT INTO public.catalog_canonicalization_reviews(
      source_product_id,source_id,market_id,snapshot_id,candidate_category_id,candidate_variant_id,
      reason_code,status,details
    ) VALUES(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,NULL,$5::uuid,
      $6,'open',$7::jsonb
    )
    ON CONFLICT(source_product_id) DO UPDATE SET
      candidate_variant_id=EXCLUDED.candidate_variant_id,
      reason_code=EXCLUDED.reason_code,
      status='open',
      details=public.catalog_canonicalization_reviews.details || EXCLUDED.details,
      resolved_at=NULL,
      updated_at=now()
  `, [
    source.id,
    context.sourceId,
    context.marketId,
    source.snapshotId,
    candidateVariantId,
    reasonCode,
    JSON.stringify(details)
  ]);
}

function normalizedVariants(payload: Readonly<Record<string, unknown>>): SourceVariant[] {
  const variants = Array.isArray(payload.variants) ? payload.variants : [];
  return variants.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const externalVariantId = optionalText(row.externalVariantId);
    if (!externalVariantId) return [];
    const attrs = record(row.attributes);
    return [{
      externalVariantId,
      sku: optionalText(row.sku),
      barcode: optionalText(row.barcode),
      buyingCostMinor: nullableMinor(row.buyingCostMinor),
      msrpMinor: nullableMinor(row.msrpMinor) ?? nullableMinor(record(payload.prices).msrpMinor),
      available: row.available === true,
      quantity: nullableQuantity(row.stockQuantity),
      stockStatus: optionalText(row.stockStatus),
      warehouse: optionalText(attrs.warehouse) ?? optionalText(record(payload.stock).warehouse),
      attributes: Object.fromEntries(
        Object.entries(attrs).flatMap(([key, item]) => {
          if (key === "warehouse") return [];
          const valueText = optionalText(item);
          return valueText ? [[key, valueText] as const] : [];
        })
      )
    }];
  });
}

export function normalizeSymphonyaGlobalIdentifier(value: string | null): { type: string; value: string } | null {
  return normalizeGlobalIdentifier(value);
}

function normalizeGlobalIdentifier(value: string | null): { type: string; value: string } | null {
  if (!value) return null;
  const normalized = value.replace(/[^0-9]/g, "");
  if (![8, 12, 13, 14].includes(normalized.length) || !validGtin(normalized)) return null;
  return { type: `gtin${normalized.length}`, value: normalized };
}

function validGtin(value: string): boolean {
  const digits = [...value].map(Number);
  const check = digits.pop();
  if (check === undefined) return false;
  let sum = 0;
  for (let offset = 0; offset < digits.length; offset += 1) {
    const digit = digits[digits.length - 1 - offset]!;
    sum += digit * (offset % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

function productModel(payload: Readonly<Record<string, unknown>>): string | null {
  return optionalText(payload.sku) ?? optionalText(payload.type);
}

function nestedName(value: unknown): string | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? optionalText((value as Record<string, unknown>).name)
    : null;
}

function nullableMinor(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nullableQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function optionalText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function requiredText(value: unknown, label: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function batchSize(): number {
  const value = Number(process.env.BLS_SYMPHONYA_MATERIALIZATION_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(MAX_BATCH_SIZE, value) : DEFAULT_BATCH_SIZE;
}

async function persistCursor(sourceId: string, cursor: string | null): Promise<void> {
  return persistNamedCursor(sourceId, CURSOR_KEY, cursor);
}

async function persistNamedCursor(sourceId: string, key: string, cursor: string | null): Promise<void> {
  const pool = getProductionPostgresRuntime().sqlPool;
  if (cursor === null) {
    await pool.query(`
      UPDATE public.catalog_sources
         SET metadata=COALESCE(metadata,'{}'::jsonb)-$2,
             updated_at=now()
       WHERE id=$1::uuid
    `, [sourceId, key]);
  } else {
    await pool.query(`
      UPDATE public.catalog_sources
         SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),ARRAY[$2]::text[],to_jsonb($3::text),true),
             updated_at=now()
       WHERE id=$1::uuid
    `, [sourceId, key, cursor]);
  }
}

function emptyResult(enabled: boolean, message?: string): SymphonyaMaterializationSliceResult {
  return {
    enabled,
    scanned: 0,
    variants: 0,
    canonicalsCreated: 0,
    familiesCreated: 0,
    offersCreated: 0,
    reusedCanonicals: 0,
    blockedAmbiguous: 0,
    blockedUnmapped: 0,
    message
  };
}
