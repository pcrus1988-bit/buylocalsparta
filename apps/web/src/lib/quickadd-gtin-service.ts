import { randomUUID } from "node:crypto";
import type { SqlExecutor, SqlRow } from "@buy-local-sparta/core";

export type QuickAddGtinSource = "catalog_admin" | "vendor_submission";

export function normalizeQuickAddGtin(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function identifierType(gtin: string): "gtin8" | "gtin12" | "gtin13" | "gtin14" {
  if (gtin.length === 8) return "gtin8";
  if (gtin.length === 12) return "gtin12";
  if (gtin.length === 13) return "gtin13";
  if (gtin.length === 14) return "gtin14";
  throw new Error("EAN / GTIN must contain 8, 12, 13 or 14 digits");
}

export async function attachMissingQuickAddGtin(
  tx: SqlExecutor,
  input: { canonicalUuid: string; canonicalPublicId: string; gtin: string; source: QuickAddGtinSource }
): Promise<{ gtin: string; added: boolean }> {
  const gtin = normalizeQuickAddGtin(input.gtin);
  const type = identifierType(gtin);
  const valid = await tx.query<SqlRow>(`SELECT bls_private.catalog_gtin_is_valid($1) ok`, [gtin]);
  if (!valid.rows[0]?.ok) throw new Error("EAN / GTIN checksum is invalid");

  const current = await tx.query<SqlRow>(`
    SELECT COALESCE(NULLIF(gtin,''),'') current_gtin
    FROM public.canonical_variants
    WHERE id=$1::uuid
    FOR UPDATE
  `, [input.canonicalUuid]);
  if (!current.rowCount) throw new Error("Canonical product no longer exists");
  const currentGtin = String(current.rows[0].current_gtin ?? "").replace(/\D/g, "");
  if (currentGtin && currentGtin !== gtin) throw new Error("This product already has a different EAN / GTIN and Quick Add will not replace it");

  const duplicate = await tx.query<SqlRow>(`
    SELECT cv.public_id
    FROM public.canonical_variants cv
    LEFT JOIN public.product_identifiers pi
      ON pi.canonical_variant_id=cv.id
     AND pi.active=true
     AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14')
    WHERE cv.id<>$1::uuid
      AND (
        regexp_replace(COALESCE(cv.gtin,''),'\\D','','g')=$2
        OR regexp_replace(COALESCE(pi.normalized_value,''),'\\D','','g')=$2
      )
    LIMIT 1
  `, [input.canonicalUuid, gtin]);
  if (duplicate.rowCount) throw new Error(`This EAN / GTIN is already attached to ${String(duplicate.rows[0].public_id)}`);

  await tx.query(`
    UPDATE public.canonical_variants
    SET gtin=CASE WHEN COALESCE(NULLIF(gtin,''),'')='' THEN $2 ELSE gtin END,
        updated_at=now()
    WHERE id=$1::uuid
  `, [input.canonicalUuid, gtin]);

  const existing = await tx.query<SqlRow>(`
    SELECT id::text id
    FROM public.product_identifiers
    WHERE canonical_variant_id=$1::uuid
      AND active=true
      AND identifier_type IN ('gtin8','gtin12','gtin13','gtin14')
      AND normalized_value=$2
    LIMIT 1
  `, [input.canonicalUuid, gtin]);

  if (!existing.rowCount) {
    const primary = await tx.query<SqlRow>(`
      SELECT NOT EXISTS(
        SELECT 1 FROM public.product_identifiers
        WHERE canonical_variant_id=$1::uuid AND active=true AND identifier_scope='trade_item'
      ) AS is_primary
    `, [input.canonicalUuid]);
    await tx.query(`
      INSERT INTO public.product_identifiers(
        id,public_id,canonical_variant_id,identifier_type,normalized_value,display_value,
        active,is_primary,verification_status,source,source_reference,confidence,identifier_scope,created_at,updated_at
      ) VALUES(
        $1,$2,$3::uuid,$4,$5,$5,true,$6::boolean,'format_valid',$7,$8,1.0,'trade_item',now(),now()
      )
    `, [
      randomUUID(),
      `pi_${randomUUID()}`,
      input.canonicalUuid,
      type,
      gtin,
      Boolean(primary.rows[0]?.is_primary),
      input.source,
      `quickadd:${input.canonicalPublicId}`
    ]);
  }

  return { gtin, added: !currentGtin && !existing.rowCount };
}
