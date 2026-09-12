import { cache } from "react";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {
  parseDropshipPresentationConfig,
  resolveDropshipPublicFields,
  type DropshipPublicFields
} from "./dropship-presentation-policy";

export type PublicDropshipPresentation = Readonly<{
  offerId: string;
  supplierCode: string;
  supplierSku?: string;
  fields: DropshipPublicFields;
  overridden: boolean;
}>;

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function readPublicDropshipPresentation(
  canonicalVariantId: string,
  vendorPublicId?: string | null
): Promise<PublicDropshipPresentation | null> {
  if (!productionDatabaseConfigured()) return null;
  const canonicalId = canonicalVariantId.trim();
  const vendorId = vendorPublicId?.trim() || null;
  if (!canonicalId) return null;

  const result = await getProductionPostgresRuntime().nativePool.query(`
    SELECT vo.public_id offer_id,
           ds.code supplier_code,
           dso.external_sku,
           ds.configuration->'vendorPresentation' vendor_presentation
      FROM dropship_supplier_offers dso
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
     WHERE cv.public_id=$1
       AND ds.active=true
       AND ($2::text IS NULL OR v.public_id=$2)
     ORDER BY
       CASE WHEN $2::text IS NOT NULL AND v.public_id=$2 THEN 0 ELSE 1 END,
       (vo.status='approved' AND dso.active) DESC,
       dso.updated_at DESC,
       vo.public_id
     LIMIT 1
  `, [canonicalId, vendorId]);
  if (result.rowCount !== 1) return null;

  const row = result.rows[0];
  const offerId = String(row.offer_id);
  const config = parseDropshipPresentationConfig(row.vendor_presentation);
  const resolved = resolveDropshipPublicFields(config, offerId);
  return {
    offerId,
    supplierCode: String(row.supplier_code),
    supplierSku: optionalText(row.external_sku),
    fields: resolved.fields,
    overridden: resolved.overridden
  };
}

export const getPublicDropshipPresentation = cache(readPublicDropshipPresentation);
