import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";
import { getVendorOperationsRuntime } from "./vendor-operations-runtime";

export type VendorCanonicalMatch = Readonly<{
  canonicalVariantId: string;
  title: string;
  gtin?: string;
  description?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  categoryCode: string;
  categoryName: string;
  categoryPath: string;
  score: number;
}>;

export type CreateLinkedVendorProductInput = Readonly<{
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
const number = (value: unknown): number => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];

function normalizedLookup(input: { title?: string; gtin?: string }) {
  const title = input.title?.trim().replace(/\s+/g, " ") ?? "";
  const gtin = input.gtin?.replace(/\D/g, "") ?? "";
  return { title, gtin };
}

export async function findVendorCanonicalMatches(
  principal: SessionPrincipal,
  input: { title?: string; gtin?: string; limit?: number }
): Promise<readonly VendorCanonicalMatch[]> {
  const lookup = normalizedLookup(input);
  if (lookup.title.length < 4 && lookup.gtin.length < 6) return [];
  const limit = Math.min(8, Math.max(1, Math.floor(input.limit ?? 5)));

  if (!postgresVendorRuntimeEnabled()) {
    const canonicals = getVendorOperationsRuntime().catalog.canonicals({ marketId: "sparta", activeOnly: true });
    const titleNeedle = lookup.title.toLocaleLowerCase("el");
    return canonicals.map((product) => {
      const title = product.titleEl || product.titleEn || product.identity.title;
      const lowerTitle = title.toLocaleLowerCase("el");
      const gtin = product.identity.gtin?.replace(/\D/g, "") ?? "";
      const model = product.identity.model?.toLocaleLowerCase("el") ?? "";
      const mpn = product.identity.mpn?.toLocaleLowerCase("el") ?? "";
      let score = 0;
      if (lookup.gtin && gtin === lookup.gtin) score = 1000;
      else if (lookup.gtin && gtin.startsWith(lookup.gtin)) score = 920;
      if (titleNeedle && lowerTitle === titleNeedle) score = Math.max(score, 900);
      else if (titleNeedle && lowerTitle.startsWith(titleNeedle)) score = Math.max(score, 820);
      else if (titleNeedle && lowerTitle.includes(titleNeedle)) score = Math.max(score, 760);
      else if (titleNeedle && (model.includes(titleNeedle) || mpn.includes(titleNeedle))) score = Math.max(score, 700);
      return { product, title, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(({ product, title, score }) => ({
      canonicalVariantId: product.id,
      title,
      gtin: product.identity.gtin,
      description: product.descriptionEl,
      brand: product.identity.brand,
      model: product.identity.model,
      mpn: product.identity.mpn,
      categoryCode: product.categoryCode,
      categoryName: product.categoryCode,
      categoryPath: product.categoryCode,
      score
    }));
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
      ), candidates AS (
        SELECT cv.public_id AS canonical_public_id,
               COALESCE(ptel.title,pten.title,cv.model,cv.mpn,cv.slug) AS title,
               COALESCE(ptel.description,pten.description) AS description,
               cv.gtin,cv.model,cv.mpn,b.name AS brand,t.code AS category_code,t.path_names,
               CASE
                 WHEN $2<>'' AND regexp_replace(COALESCE(cv.gtin,''),'\\D','','g')=$2 THEN 1000
                 WHEN $2<>'' AND regexp_replace(COALESCE(cv.gtin,''),'\\D','','g') LIKE $2||'%' THEN 920
                 WHEN $3<>'' AND lower(COALESCE(ptel.title,pten.title,cv.model,cv.mpn,cv.slug))=lower($3) THEN 900
                 WHEN $3<>'' AND lower(COALESCE(cv.model,''))=lower($3) THEN 880
                 WHEN $3<>'' AND lower(COALESCE(cv.mpn,''))=lower($3) THEN 870
                 WHEN $3<>'' AND COALESCE(ptel.title,pten.title,cv.model,cv.mpn,cv.slug) ILIKE $3||'%' THEN 820
                 WHEN $3<>'' AND COALESCE(ptel.title,pten.title,cv.model,cv.mpn,cv.slug) ILIKE '%'||$3||'%' THEN 760
                 WHEN $3<>'' AND (COALESCE(cv.model,'') ILIKE '%'||$3||'%' OR COALESCE(cv.mpn,'') ILIKE '%'||$3||'%') THEN 700
                 ELSE 0
               END AS score
        FROM canonical_variants cv
        JOIN category_tree t ON t.id=cv.category_id
        LEFT JOIN brands b ON b.id=cv.brand_id
        LEFT JOIN product_translations ptel ON ptel.canonical_variant_id=cv.id AND ptel.locale='el'
        LEFT JOIN product_translations pten ON pten.canonical_variant_id=cv.id AND pten.locale='en'
        WHERE cv.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
          AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
          AND (
            ($2<>'' AND regexp_replace(COALESCE(cv.gtin,''),'\\D','','g') LIKE $2||'%')
            OR ($3<>'' AND (
              COALESCE(ptel.title,pten.title,cv.model,cv.mpn,cv.slug) ILIKE '%'||$3||'%'
              OR COALESCE(cv.model,'') ILIKE '%'||$3||'%'
              OR COALESCE(cv.mpn,'') ILIKE '%'||$3||'%'
            ))
          )
      )
      SELECT * FROM candidates WHERE score>0 ORDER BY score DESC,title LIMIT $4
    `, [vendorId, lookup.gtin, lookup.title, limit]);

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
        categoryCode: requiredText(row.category_code, "category code"),
        categoryName: path.at(-1) ?? requiredText(row.category_code, "category code"),
        categoryPath: path.join(" › ") || requiredText(row.category_code, "category code"),
        score: Math.round(number(row.score))
      };
    });
  }, { readOnly: true });
}

export async function createVendorProductFromCanonical(principal: SessionPrincipal, input: CreateLinkedVendorProductInput) {
  const safetyStock = input.safetyStock ?? 0;
  if (!input.title.trim()) throw new Error("Title is required");
  if (!Number.isSafeInteger(input.supplierUnitPriceMinor) || input.supplierUnitPriceMinor < 0) throw new Error("Price must use non-negative integer minor units");
  if (!Number.isSafeInteger(input.stockOnHand) || input.stockOnHand < 0 || !Number.isSafeInteger(safetyStock) || safetyStock < 0 || safetyStock > input.stockOnHand) throw new Error("Invalid stock/safety stock");

  if (!postgresVendorRuntimeEnabled()) {
    const vendorId = requiredVendorId(principal);
    const catalog = getVendorOperationsRuntime().catalog;
    const canonical = catalog.canonical(input.canonicalVariantId);
    if (!canonical || canonical.marketId !== "sparta" || !canonical.active || canonical.suppressed || canonical.recalled) throw new Error("Canonical product is not available");
    const draft = catalog.createDraft({
      marketId: canonical.marketId,
      vendorId,
      locationId: `loc-${vendorId}`,
      vendorSku: input.vendorSku,
      categoryCode: canonical.categoryCode,
      title: input.title,
      brand: input.brand,
      model: input.model,
      gtin: input.gtin,
      condition: "new",
      supplierUnitPriceMinor: input.supplierUnitPriceMinor,
      stockOnHand: input.stockOnHand,
      safetyStock,
      fulfilmentModes: ["pickup"],
      adviceAvailable: input.adviceAvailable ?? true,
      source: "manual",
      sourcePayload: { canonicalSelectedByVendor: true, canonicalVariantId: canonical.id, vendorVariantNote: input.variantNote?.trim() || undefined },
      now: Date.now()
    });
    const submitted = catalog.submit({ submissionId: draft.id, vendorId, now: Date.now() });
    if (submitted.canonicalVariantId === canonical.id) return submitted;
    const candidate = catalog.candidates({ submissionId: draft.id }).find((item) => item.candidateCanonicalVariantId === canonical.id && (item.status === "pending" || item.status === "auto_linked"));
    if (!candidate) throw new Error("The selected canonical product no longer matches this entry");
    return catalog.approveMatch({ candidateId: candidate.id, actorId: principal.userId, reason: "Vendor selected existing canonical product", now: Date.now() });
  }

  return unitOfWork().withTransaction(vendorScope(principal), async (tx) => {
    const vendorId = requiredVendorId(principal);
    const refs = await tx.query<SqlRow>(`
      SELECT vb.id::text AS vendor_uuid,vb.market_id::text AS market_uuid,
             (SELECT id::text FROM vendor_locations WHERE vendor_id=vb.id AND active ORDER BY created_at LIMIT 1) AS location_uuid,
             (SELECT id::text FROM users WHERE public_id=$3 OR id::text=$3 LIMIT 1) AS user_uuid,
             cv.id::text AS canonical_uuid,cv.category_id::text AS category_uuid,cv.public_id AS canonical_public_id,
             c.code AS category_code
      FROM vendor_businesses vb
      JOIN canonical_variants cv ON cv.market_id=vb.market_id AND cv.public_id=$2
      JOIN categories c ON c.id=cv.category_id
      WHERE (vb.public_id=$1 OR vb.id::text=$1)
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      LIMIT 1
    `, [vendorId, input.canonicalVariantId.trim(), principal.userId]);
    if (!refs.rowCount) throw new Error("The selected canonical product is no longer available");
    const row = refs.rows[0];
    if (!row.location_uuid) throw new Error("Vendor location is not configured");
    if (!row.user_uuid) throw new Error("Vendor user is not configured");

    const submissionUuid = randomUUID();
    const publicId = `vps_${randomUUID()}`;
    const identity = {
      title: input.title.trim(),
      brand: input.brand?.trim() || undefined,
      model: input.model?.trim() || undefined,
      gtin: input.gtin?.trim() || undefined
    };
    const sourcePayload = {
      canonicalSelectedByVendor: true,
      canonicalVariantId: input.canonicalVariantId.trim(),
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
      JSON.stringify({ source: "vendor_catalog_smart_entry", canonicalPublicId: input.canonicalVariantId.trim(), categoryCode: requiredText(row.category_code, "category code") })
    ]);

    return { id: publicId, status: "linked" as const, canonicalVariantId: requiredText(row.canonical_public_id, "canonical product") };
  }, { isolation: "serializable" });
}
