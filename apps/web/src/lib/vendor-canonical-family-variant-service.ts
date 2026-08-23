import { randomUUID } from "node:crypto";
import type { SqlExecutor, SqlRow } from "@buy-local-sparta/core";
import type { CreateVendorStructuredLinkedProductInput, VendorVariantAttributes } from "./vendor-structured-product-identity-service";

const optionalText = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;
const requiredText = (value: unknown, field: string): string => {
  const result = optionalText(value);
  if (!result) throw new Error(`Invalid ${field}`);
  return result;
};
const normalizeIdentity = (value: string) => value.toLocaleLowerCase("el").replace(/[^\p{L}\p{N}]+/gu, "");

type DivergentCanonicalContext = Readonly<{
  marketUuid: string;
  vendorUuid: string;
  locationUuid: string;
  userUuid: string;
  categoryUuid: string;
  categoryCode: string;
  canonicalUuid: string;
  canonicalPublicId: string;
  canonicalActive: boolean;
  canonicalTitle: string;
  canonicalDescription?: string;
  canonicalSpecifications: unknown;
  canonicalVariantAttributes: unknown;
  canonicalWarrantyBasis?: string;
  canonicalBrand?: string;
  canonicalModel?: string;
  canonicalMpn?: string;
  productTypeCode: string;
}>;

export async function resolveDivergentVendorFamilyVariant(
  tx: SqlExecutor,
  input: CreateVendorStructuredLinkedProductInput,
  context: DivergentCanonicalContext,
  variantAttributes: VendorVariantAttributes,
  conflict: string
) {
  const submittedBrand = input.brand?.trim();
  if (submittedBrand && context.canonicalBrand && normalizeIdentity(submittedBrand) !== normalizeIdentity(context.canonicalBrand)) {
    throw new Error("The selected canonical family does not match the submitted brand");
  }
  const submittedPart = input.mpn?.trim() || input.model?.trim();
  const canonicalPart = context.canonicalMpn || context.canonicalModel;
  if (submittedPart && canonicalPart && normalizeIdentity(submittedPart) !== normalizeIdentity(canonicalPart)) {
    throw new Error("The selected canonical family does not match the submitted model/MPN");
  }

  const submittedGtin = input.gtin?.trim() || undefined;
  const submissionUuid = randomUUID();
  const publicId = `vps_${randomUUID()}`;
  const identity = {
    title: context.canonicalTitle,
    brand: context.canonicalBrand,
    model: context.canonicalModel,
    mpn: context.canonicalMpn,
    gtin: submittedGtin
  };
  const sourcePayload = {
    canonicalSelectedByVendor: true,
    variantFamilyAnchorCanonicalId: context.canonicalPublicId,
    canonicalWasInactive: !context.canonicalActive,
    canonicalDescription: context.canonicalDescription,
    canonicalSpecifications: context.canonicalSpecifications ?? {},
    canonicalVariantAttributes: context.canonicalVariantAttributes ?? {},
    canonicalWarrantyBasis: context.canonicalWarrantyBasis,
    productTypeCode: context.productTypeCode,
    variantAttributes,
    vendorVariantNote: input.variantNote?.trim() || undefined,
    structuredVariantIdentity: true,
    structuredVariantDivergence: true,
    materialVariantConflict: conflict
  };

  await tx.query(`
    INSERT INTO public.vendor_product_submissions(
      id,public_id,market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
      supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
      advice_available,source,source_payload,status,created_by,created_at,updated_at
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'EUR',$10,$11,ARRAY['pickup']::fulfilment_mode[],
      $12,'manual',$13::jsonb,'draft',$14,now(),now()
    )
  `, [
    submissionUuid,publicId,context.marketUuid,context.vendorUuid,context.locationUuid,input.vendorSku?.trim() || null,
    context.categoryUuid,JSON.stringify(identity),input.supplierUnitPriceMinor,input.stockOnHand,input.safetyStock ?? 0,
    input.adviceAvailable !== false,JSON.stringify(sourcePayload),context.userUuid
  ]);

  const resolved = await tx.query<SqlRow>(`
    SELECT canonical_variant_id::text,canonical_public_id,product_family_id::text,disposition,reason
    FROM bls_private.ensure_vendor_family_variant($1::uuid,$2::uuid,$3,$4::jsonb,$5)
  `, [context.canonicalUuid,submissionUuid,context.productTypeCode,JSON.stringify(variantAttributes),submittedGtin ?? null]);
  if (resolved.rowCount !== 1) throw new Error("Canonical family variant resolver returned an invalid result");
  const outcome = resolved.rows[0];
  const disposition = requiredText(outcome.disposition, "variant resolution disposition");
  const reason = requiredText(outcome.reason, "variant resolution reason");
  const canonicalUuid = optionalText(outcome.canonical_variant_id);
  const canonicalPublicId = optionalText(outcome.canonical_public_id);

  if (disposition === "review") {
    await tx.query(`
      UPDATE public.vendor_product_submissions
      SET status='needs_review',updated_at=now()
      WHERE id=$1
    `, [submissionUuid]);
    await tx.query(`
      INSERT INTO public.catalog_workflow_events(
        id,public_id,submission_id,actor_id,action,from_status,to_status,canonical_variant_id,reason,metadata,created_at
      ) VALUES(
        $1,$2,$3,$4,'vendor_family_variant_review','draft','needs_review',NULL,$5,$6::jsonb,now()
      )
    `, [
      randomUUID(),`cwe_${randomUUID()}`,submissionUuid,context.userUuid,
      `Anchored variant requires review: ${reason}`,
      JSON.stringify({ source: "vendor_catalog_structured_entry", anchorCanonicalPublicId: context.canonicalPublicId, categoryCode: context.categoryCode, productTypeCode: context.productTypeCode, materialConflict: conflict, resolutionReason: reason, canonicalActivationChanged: false })
    ]);
    return { id: publicId, status: "needs_review" as const, reviewReason: reason };
  }

  if (!canonicalUuid || !canonicalPublicId || !["linked_existing","created_sibling"].includes(disposition)) {
    throw new Error("Canonical family variant resolver returned an unsupported outcome");
  }

  await tx.query(`
    UPDATE public.vendor_product_submissions
    SET status='linked',canonical_variant_id=$2::uuid,updated_at=now()
    WHERE id=$1
  `, [submissionUuid,canonicalUuid]);
  await tx.query(`
    INSERT INTO public.catalog_workflow_events(
      id,public_id,submission_id,actor_id,action,from_status,to_status,canonical_variant_id,reason,metadata,created_at
    ) VALUES(
      $1,$2,$3,$4,$5,'draft','linked',$6::uuid,$7,$8::jsonb,now()
    )
  `, [
    randomUUID(),`cwe_${randomUUID()}`,submissionUuid,context.userUuid,
    disposition === "created_sibling" ? "vendor_family_variant_created" : "vendor_family_variant_linked",
    canonicalUuid,
    disposition === "created_sibling" ? "Created inactive canonical sibling from governed vendor variant identity" : "Linked vendor submission to existing canonical sibling",
    JSON.stringify({ source: "vendor_catalog_structured_entry", anchorCanonicalPublicId: context.canonicalPublicId, resolvedCanonicalPublicId: canonicalPublicId, categoryCode: context.categoryCode, productTypeCode: context.productTypeCode, materialConflict: conflict, resolutionReason: reason, canonicalCreated: disposition === "created_sibling", canonicalActivationChanged: false })
  ]);

  return { id: publicId, status: "linked" as const, canonicalVariantId: canonicalPublicId, canonicalCreated: disposition === "created_sibling" };
}
