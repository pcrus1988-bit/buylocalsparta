import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";
import { findVendorCanonicalMatches } from "./vendor-canonical-match-service";

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

function normalizedLookup(input: { title?: string; gtin?: string }) {
  const title = input.title?.trim().replace(/\s+/g, " ") ?? "";
  const gtin = input.gtin?.replace(/\D/g, "") ?? "";
  return { title, gtin };
}

export async function findVendorCanonicalPrefillMatches(
  principal: SessionPrincipal,
  input: { title?: string; gtin?: string; limit?: number }
): Promise<readonly VendorCanonicalPrefillMatch[]> {
  const lookup = normalizedLookup(input);
  if (lookup.title.length < 4 && lookup.gtin.length < 6) return [];
  const limit = Math.min(8, Math.max(1, Math.floor(input.limit ?? 5)));

  if (!postgresVendorRuntimeEnabled()) {
    const matches = await findVendorCanonicalMatches(principal, input);
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
               cv.gtin,cv.model,cv.mpn,cv.warranty_basis,b.name AS brand,t.code AS category_code,t.path_names,
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
               END AS identity_score,
               (CASE WHEN b.name IS NOT NULL THEN 35 ELSE 0 END
                + CASE WHEN cv.model IS NOT NULL OR cv.mpn IS NOT NULL THEN 25 ELSE 0 END
                + CASE WHEN COALESCE(NULLIF(ptel.description,''),NULLIF(pten.description,'')) IS NOT NULL THEN 25 ELSE 0 END
                + CASE WHEN (ptel.specifications IS NOT NULL AND ptel.specifications<>'{}'::jsonb) OR (pten.specifications IS NOT NULL AND pten.specifications<>'{}'::jsonb) THEN 15 ELSE 0 END
                + CASE WHEN COALESCE(cv.variant_attributes,'{}'::jsonb)<>'{}'::jsonb THEN 10 ELSE 0 END
                + CASE WHEN cv.gtin IS NOT NULL THEN 15 ELSE 0 END
                - CASE WHEN b.name IS NULL AND cv.model IS NULL AND cv.mpn IS NULL AND cv.gtin IS NULL
                         AND COALESCE(NULLIF(ptel.description,''),NULLIF(pten.description,'')) IS NULL
                         AND COALESCE(ptel.specifications,'{}'::jsonb)='{}'::jsonb
                         AND COALESCE(pten.specifications,'{}'::jsonb)='{}'::jsonb
                         AND COALESCE(cv.variant_attributes,'{}'::jsonb)='{}'::jsonb THEN 140 ELSE 0 END) AS quality_score
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
      SELECT *, identity_score + quality_score AS score
      FROM raw_candidates
      WHERE identity_score>0
      ORDER BY (identity_score + quality_score) DESC, quality_score DESC, title
      LIMIT $4
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
