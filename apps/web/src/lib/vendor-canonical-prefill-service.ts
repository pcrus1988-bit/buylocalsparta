import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, normalizeGtin, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";
import { createVendorProductFromCanonical as legacyCreateVendorProductFromCanonical, findVendorCanonicalMatches } from "./vendor-canonical-match-service";

export type VendorCanonicalPrefillMatch = Readonly<{
  canonicalVariantId: string;
  title: string;
  gtin?: string;
  description?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  warrantyBasis?: string;
  categoryCode: string;
  categoryName: string;
  categoryPath: string;
  specifications: Readonly<Record<string, unknown>>;
  variantAttributes: Readonly<Record<string, unknown>>;
  score: number;
}>;

export type CreateVendorProductFromPrefillInput = Readonly<{
  canonicalVariantId: string;
  title: string;
  vendorSku?: string;
  brand?: string;
  model?: string;
  gtin?: string;
  variantNote?: string;
  supplierUnitPriceMinor: number;
  stockOnHand: number;
  safetyStock?: number;
  adviceAvailable?: boolean;
}>;

function requiredVendorId(principal: SessionPrincipal) {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function unitOfWork() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}

function vendorScope(principal: SessionPrincipal) {
  return { actorUserId: principal.userId, vendorId: requiredVendorId(principal), marketId: "sparta" } as const;
}

const optionalText = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;
const requiredText = (value: unknown, field: string): string => {
  const result = optionalText(value);
  if (!result) throw new Error(`Invalid ${field}`);
  return result;
};
const jsonObject = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
const identityText = (value: string | undefined) => (value ?? "").normalize("NFKC").toLocaleLowerCase("el").replace(/[^\p{L}\p{N}]+/gu, "");

function normalizedLookup(input: { title?: string; gtin?: string }) {
  const title = input.title?.trim().replace(/\s+/g, " ") ?? "";
  const gtin = input.gtin?.replace(/\D/g, "") ?? "";
  const exactGtin = gtin ? normalizeGtin(gtin) : undefined;
  const isCompleteGtinLength = [8, 12, 13, 14].includes(gtin.length);
  const gtinPrefix = isCompleteGtinLength && !exactGtin ? "" : gtin;
  return { title, gtin, exactGtin: exactGtin ?? "", gtinPrefix };
}

export async function findVendorCanonicalPrefillMatches(
  principal: SessionPrincipal,
  input: { title?: string; gtin?: string; limit?: number }
): Promise<readonly VendorCanonicalPrefillMatch[]> {
  const lookup = normalizedLookup(input);
  if (lookup.title.length < 4 && lookup.gtin.length < 6) return [];
  const limit = Math.min(8, Math.max(1, Math.floor(input.limit ?? 5)));

  if (!postgresVendorRuntimeEnabled()) {
    const matches = await findVendorCanonicalMatches(principal, {
      title: lookup.title,
      gtin: lookup.exactGtin || lookup.gtinPrefix,
      limit
    });
    return matches.map((match) => ({ ...match, specifications: {}, variantAttributes: {} }));
  }

  return unitOfWork().withTransaction(vendorScope(principal), async (tx) => {
    const vendorId = requiredVendorId(principal);
    const rows = await tx.query<SqlRow>(`
      WITH RECURSIVE category_tree AS (
        SELECT c.id,c.parent_id,c.code,ARRAY[COALESCE(ctel.name,cten.name,c.code)]::text[] AS path_names
        FROM categories c
        LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
        LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
        WHERE c.parent_id IS NULL
          AND (c.market_id IS NULL OR c.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1))
        UNION ALL
        SELECT c.id,c.parent_id,c.code,t.path_names||COALESCE(ctel.name,cten.name,c.code)
        FROM categories c JOIN category_tree t ON c.parent_id=t.id
        LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
        LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
        WHERE c.market_id IS NULL OR c.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
      ), raw_candidates AS (
        SELECT cv.public_id AS canonical_public_id,
               COALESCE(ptel.title,pten.title,cv.model,cv.mpn,cv.slug) AS title,
               COALESCE(NULLIF(ptel.description,''),NULLIF(pten.description,'')) AS description,
               CASE WHEN ptel.specifications IS NOT NULL AND ptel.specifications<>'{}'::jsonb THEN ptel.specifications
                    WHEN pten.specifications IS NOT NULL THEN pten.specifications ELSE '{}'::jsonb END AS specifications,
               COALESCE(cv.variant_attributes,'{}'::jsonb) AS variant_attributes,
               COALESCE(NULLIF(cv.gtin,''),trade_id.normalized_value) AS gtin,
               cv.model,cv.mpn,cv.warranty_basis,b.name AS brand,t.code AS category_code,t.path_names,
               CASE
                 WHEN $2<>'' AND (
                   (cv.gtin IS NOT NULL AND bls_private.catalog_gtin_is_valid(cv.gtin) AND bls_private.catalog_normalize_gtin(cv.gtin)=$2)
                   OR trade_id.normalized_value=$2
                 ) THEN 1000
                 WHEN $2='' AND $3<>'' AND (
                   regexp_replace(COALESCE(cv.gtin,''),'\\D','','g') LIKE $3||'%'
                   OR trade_id.normalized_value LIKE $3||'%'
                 ) THEN 920
                 WHEN $4<>'' AND lower(COALESCE(ptel.title,pten.title,cv.model,cv.mpn,cv.slug))=lower($4) THEN 900
                 WHEN $4<>'' AND lower(COALESCE(cv.model,''))=lower($4) THEN 880
                 WHEN $4<>'' AND lower(COALESCE(cv.mpn,''))=lower($4) THEN 870
                 WHEN $4<>'' AND COALESCE(ptel.title,pten.title,cv.model,cv.mpn,cv.slug) ILIKE $4||'%' THEN 820
                 WHEN $4<>'' AND COALESCE(ptel.title,pten.title,cv.model,cv.mpn,cv.slug) ILIKE '%'||$4||'%' THEN 760
                 WHEN $4<>'' AND (COALESCE(cv.model,'') ILIKE '%'||$4||'%' OR COALESCE(cv.mpn,'') ILIKE '%'||$4||'%') THEN 700
                 ELSE 0
               END AS identity_score,
               (CASE WHEN b.name IS NOT NULL THEN 35 ELSE 0 END
                + CASE WHEN cv.model IS NOT NULL OR cv.mpn IS NOT NULL THEN 25 ELSE 0 END
                + CASE WHEN COALESCE(NULLIF(ptel.description,''),NULLIF(pten.description,'')) IS NOT NULL THEN 25 ELSE 0 END
                + CASE WHEN (ptel.specifications IS NOT NULL AND ptel.specifications<>'{}'::jsonb) OR (pten.specifications IS NOT NULL AND pten.specifications<>'{}'::jsonb) THEN 15 ELSE 0 END
                + CASE WHEN COALESCE(cv.variant_attributes,'{}'::jsonb)<>'{}'::jsonb THEN 10 ELSE 0 END
                + CASE WHEN cv.gtin IS NOT NULL OR trade_id.normalized_value IS NOT NULL THEN 15 ELSE 0 END) AS quality_score
        FROM canonical_variants cv
        JOIN category_tree t ON t.id=cv.category_id
        LEFT JOIN brands b ON b.id=cv.brand_id
        LEFT JOIN product_translations ptel ON ptel.canonical_variant_id=cv.id AND ptel.locale='el'
        LEFT JOIN product_translations pten ON pten.canonical_variant_id=cv.id AND pten.locale='en'
        LEFT JOIN LATERAL (
          SELECT bls_private.catalog_normalize_gtin(pi.normalized_value) AS normalized_value
          FROM product_identifiers pi
          WHERE pi.canonical_variant_id=cv.id
            AND pi.active=true
            AND pi.identifier_scope='trade_item'
            AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
          ORDER BY pi.is_primary DESC,pi.created_at,pi.id
          LIMIT 1
        ) trade_id ON true
        WHERE cv.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
          AND cv.suppressed=false AND cv.recalled=false
          AND (
            ($2<>'' AND (
              (cv.gtin IS NOT NULL AND bls_private.catalog_gtin_is_valid(cv.gtin) AND bls_private.catalog_normalize_gtin(cv.gtin)=$2)
              OR trade_id.normalized_value=$2
            ))
            OR ($2='' AND $3<>'' AND (
              regexp_replace(COALESCE(cv.gtin,''),'\\D','','g') LIKE $3||'%'
              OR trade_id.normalized_value LIKE $3||'%'
            ))
            OR ($2='' AND $4<>'' AND (
              COALESCE(ptel.title,pten.title,cv.model,cv.mpn,cv.slug) ILIKE '%'||$4||'%'
              OR COALESCE(cv.model,'') ILIKE '%'||$4||'%'
              OR COALESCE(cv.mpn,'') ILIKE '%'||$4||'%'
            ))
          )
      )
      SELECT *,identity_score+quality_score AS score
      FROM raw_candidates
      WHERE identity_score>0
      ORDER BY (identity_score+quality_score) DESC,quality_score DESC,title
      LIMIT $5
    `, [vendorId, lookup.exactGtin, lookup.gtinPrefix, lookup.title, limit]);

    return rows.rows.map((row) => {
      const path = strings(row.path_names);
      return {
        canonicalVariantId: requiredText(row.canonical_public_id, "canonical product"),
        title: requiredText(row.title, "canonical title"),
        gtin: optionalText(row.gtin),
        description: optionalText(row.description),
        brand: optionalText(row.brand),
        model: optionalText(row.model),
        mpn: optionalText(row.mpn),
        warrantyBasis: optionalText(row.warranty_basis),
        categoryCode: requiredText(row.category_code, "category code"),
        categoryName: path.at(-1) ?? requiredText(row.category_code, "category code"),
        categoryPath: path.join(" › ") || requiredText(row.category_code, "category code"),
        specifications: jsonObject(row.specifications),
        variantAttributes: jsonObject(row.variant_attributes),
        score: Math.round(Number(row.score ?? 0))
      };
    });
  }, { readOnly: true });
}

export async function createVendorProductFromCanonicalPrefill(principal: SessionPrincipal, input: CreateVendorProductFromPrefillInput) {
  const safetyStock = input.safetyStock ?? 0;
  if (!input.title.trim()) throw new Error("Title is required");
  if (!Number.isSafeInteger(input.supplierUnitPriceMinor) || input.supplierUnitPriceMinor < 0) throw new Error("Price must use non-negative integer minor units");
  if (!Number.isSafeInteger(input.stockOnHand) || input.stockOnHand < 0 || !Number.isSafeInteger(safetyStock) || safetyStock < 0 || safetyStock > input.stockOnHand) throw new Error("Invalid stock/safety stock");

  if (!postgresVendorRuntimeEnabled()) return legacyCreateVendorProductFromCanonical(principal, input);

  return unitOfWork().withTransaction(vendorScope(principal), async (tx) => {
    const vendorId = requiredVendorId(principal);
    const refs = await tx.query<SqlRow>(`
      SELECT vb.id::text AS vendor_uuid,vb.market_id::text AS market_uuid,
             (SELECT id::text FROM vendor_locations WHERE vendor_id=vb.id AND active ORDER BY created_at LIMIT 1) AS location_uuid,
             (SELECT id::text FROM users WHERE public_id=$3 OR id::text=$3 LIMIT 1) AS user_uuid,
             cv.id::text AS canonical_uuid,cv.category_id::text AS category_uuid,cv.public_id AS canonical_public_id,
             COALESCE(NULLIF(cv.gtin,''),trade_id.normalized_value) AS gtin,
             cv.model,cv.mpn,cv.variant_attributes,cv.warranty_basis,cv.active AS canonical_active,
             c.code AS category_code,b.name AS brand,
             COALESCE(ptel.title,pten.title,cv.model,cv.mpn,cv.slug) AS canonical_title,
             COALESCE(NULLIF(ptel.description,''),NULLIF(pten.description,'')) AS canonical_description,
             CASE WHEN ptel.specifications IS NOT NULL AND ptel.specifications<>'{}'::jsonb THEN ptel.specifications
                  WHEN pten.specifications IS NOT NULL THEN pten.specifications ELSE '{}'::jsonb END AS canonical_specifications
      FROM vendor_businesses vb
      JOIN canonical_variants cv ON cv.market_id=vb.market_id AND cv.public_id=$2
      JOIN categories c ON c.id=cv.category_id
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN product_translations ptel ON ptel.canonical_variant_id=cv.id AND ptel.locale='el'
      LEFT JOIN product_translations pten ON pten.canonical_variant_id=cv.id AND pten.locale='en'
      LEFT JOIN LATERAL (
        SELECT bls_private.catalog_normalize_gtin(pi.normalized_value) AS normalized_value
        FROM product_identifiers pi
        WHERE pi.canonical_variant_id=cv.id
          AND pi.active=true
          AND pi.identifier_scope='trade_item'
          AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
        ORDER BY pi.is_primary DESC,pi.created_at,pi.id
        LIMIT 1
      ) trade_id ON true
      WHERE (vb.public_id=$1 OR vb.id::text=$1)
        AND cv.suppressed=false AND cv.recalled=false
      LIMIT 1
    `, [vendorId, input.canonicalVariantId.trim(), principal.userId]);
    if (!refs.rowCount) throw new Error("The selected canonical product is no longer available");
    const row = refs.rows[0];
    if (!row.location_uuid) throw new Error("Vendor location is not configured");
    if (!row.user_uuid) throw new Error("Vendor user is not configured");

    const canonicalTitle = requiredText(row.canonical_title, "canonical title");
    const canonicalBrand = optionalText(row.brand);
    const canonicalModel = optionalText(row.model);
    const canonicalMpn = optionalText(row.mpn);
    const canonicalGtin = optionalText(row.gtin);
    const suppliedGtinRaw = input.gtin?.replace(/\D/g, "") ?? "";
    const suppliedGtin = suppliedGtinRaw ? normalizeGtin(suppliedGtinRaw) : undefined;

    if (suppliedGtinRaw && !suppliedGtin) throw new Error("The supplied GTIN is invalid and cannot confirm the selected product");
    if (suppliedGtin && suppliedGtin !== canonicalGtin) throw new Error("The supplied GTIN does not match the selected canonical product");
    if (!suppliedGtin && identityText(input.title) !== identityText(canonicalTitle)) {
      const suppliedModel = identityText(input.model);
      const canonicalPart = new Set([identityText(canonicalModel), identityText(canonicalMpn)].filter(Boolean));
      if (!suppliedModel || !canonicalPart.has(suppliedModel)) throw new Error("The selected canonical product no longer matches this entry");
    }

    const submissionUuid = randomUUID();
    const publicId = `vps_${randomUUID()}`;
    const identity = {
      title: canonicalTitle,
      brand: canonicalBrand,
      model: canonicalModel,
      mpn: canonicalMpn,
      gtin: canonicalGtin
    };
    const sourcePayload = {
      canonicalSelectedByVendor: true,
      canonicalVariantId: input.canonicalVariantId.trim(),
      canonicalWasInactive: !Boolean(row.canonical_active),
      canonicalActivationChanged: false,
      canonicalDescription: optionalText(row.canonical_description),
      canonicalSpecifications: jsonObject(row.canonical_specifications),
      canonicalVariantAttributes: jsonObject(row.variant_attributes),
      canonicalWarrantyBasis: optionalText(row.warranty_basis),
      vendorVariantNote: input.variantNote?.trim() || undefined
    };

    await tx.query(`
      INSERT INTO vendor_product_submissions(
        id,public_id,market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
        supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
        advice_available,source,source_payload,status,canonical_variant_id,created_by,created_at,updated_at
      ) VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'EUR',$10,$11,ARRAY['pickup']::fulfilment_mode[],
        $12,'manual',$13::jsonb,'linked',$14,$15,now(),now()
      )
    `, [
      submissionUuid,
      publicId,
      requiredText(row.market_uuid, "market"),
      requiredText(row.vendor_uuid, "vendor"),
      requiredText(row.location_uuid, "location"),
      input.vendorSku?.trim() || null,
      requiredText(row.category_uuid, "category"),
      JSON.stringify(identity),
      input.supplierUnitPriceMinor,
      input.stockOnHand,
      safetyStock,
      input.adviceAvailable !== false,
      JSON.stringify(sourcePayload),
      requiredText(row.canonical_uuid, "canonical product"),
      requiredText(row.user_uuid, "user")
    ]);

    await tx.query(`
      INSERT INTO catalog_workflow_events(
        id,public_id,submission_id,actor_id,action,from_status,to_status,canonical_variant_id,reason,metadata,created_at
      ) VALUES(
        $1,$2,$3,$4,'vendor_selected_canonical','draft','linked',$5,
        'Vendor selected an existing canonical product during product entry',$6::jsonb,now()
      )
    `, [
      randomUUID(),
      `cwe_${randomUUID()}`,
      submissionUuid,
      requiredText(row.user_uuid, "user"),
      requiredText(row.canonical_uuid, "canonical product"),
      JSON.stringify({
        source: "vendor_catalog_smart_entry",
        identityPolicy: "catalog_identity_v2",
        canonicalPublicId: input.canonicalVariantId.trim(),
        categoryCode: requiredText(row.category_code, "category code"),
        canonicalWasInactive: !Boolean(row.canonical_active),
        canonicalActivationChanged: false
      })
    ]);

    return { id: publicId, status: "linked" as const, canonicalVariantId: requiredText(row.canonical_public_id, "canonical product") };
  }, { isolation: "serializable" });
}
