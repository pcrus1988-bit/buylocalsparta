import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";
import { resolveDivergentVendorFamilyVariant } from "./vendor-canonical-family-variant-service";

export type VendorVariantScalar = string | number | boolean;
export type VendorVariantValue = VendorVariantScalar | readonly VendorVariantScalar[];
export type VendorVariantAttributes = Readonly<Record<string, VendorVariantValue>>;

export type VendorVariantValueOption = Readonly<{ code: string; label: string }>;
export type VendorVariantAttributeSchema = Readonly<{
  code: string;
  label: string;
  helpText?: string;
  dataType: "text" | "number" | "boolean" | "enum" | "dimension";
  valueMode: "free" | "controlled" | "mixed";
  unit?: string;
  requirementLevel: "required" | "recommended" | "optional";
  allowMultiple: boolean;
  variantAxisOrder: number;
  options: readonly VendorVariantValueOption[];
}>;
export type VendorProductTypeIdentitySchema = Readonly<{
  code: string;
  name: string;
  isDefault: boolean;
  variantAttributes: readonly VendorVariantAttributeSchema[];
}>;
export type VendorProductIdentitySchema = Readonly<{
  categoryCode: string;
  categoryName: string;
  productTypes: readonly VendorProductTypeIdentitySchema[];
  selectedProductTypeCode?: string;
}>;

export type CreateVendorStructuredProductInput = Readonly<{
  title: string;
  categoryCode: string;
  productTypeCode?: string;
  vendorSku?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  gtin?: string;
  variantAttributes?: VendorVariantAttributes;
  variantNote?: string;
  supplierUnitPriceMinor: number;
  stockOnHand: number;
  safetyStock?: number;
  adviceAvailable?: boolean;
}>;

export type CreateVendorStructuredLinkedProductInput = CreateVendorStructuredProductInput & Readonly<{
  canonicalVariantId: string;
}>;

type ProductTypeRow = Readonly<{
  productTypeId: string;
  code: string;
  name: string;
  isDefault: boolean;
}>;

type ValidatedVariantIdentity = Readonly<{
  productTypeCode?: string;
  variantAttributes: VendorVariantAttributes;
}>;

const MAX_VARIANT_FIELDS = 24;
const MAX_MULTIPLE_VALUES = 8;
const MAX_TEXT_VALUE = 180;

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
const integer = (value: unknown, field: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid integer ${field}`);
  return parsed;
};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];

function assertCommercialInput(input: { supplierUnitPriceMinor: number; stockOnHand: number; safetyStock?: number }) {
  const safetyStock = input.safetyStock ?? 0;
  if (!Number.isSafeInteger(input.supplierUnitPriceMinor) || input.supplierUnitPriceMinor < 0) throw new Error("Price must use non-negative integer minor units");
  if (!Number.isSafeInteger(input.stockOnHand) || input.stockOnHand < 0 || !Number.isSafeInteger(safetyStock) || safetyStock < 0 || safetyStock > input.stockOnHand) throw new Error("Invalid stock/safety stock");
}

async function categoryContext(tx: SqlExecutor, vendorId: string, categoryCode: string) {
  const result = await tx.query<SqlRow>(`
    SELECT c.id::text AS category_id,c.code,
           COALESCE(el.name,en.name,c.code) AS category_name
    FROM public.vendor_businesses vb
    JOIN public.categories c ON c.code=$2 AND c.active=true AND c.assignable=true
      AND (c.market_id IS NULL OR c.market_id=vb.market_id)
    LEFT JOIN public.category_translations el ON el.category_id=c.id AND el.locale='el'
    LEFT JOIN public.category_translations en ON en.category_id=c.id AND en.locale='en'
    WHERE vb.public_id=$1 OR vb.id::text=$1
    ORDER BY CASE WHEN c.market_id=vb.market_id THEN 0 ELSE 1 END,c.created_at
    LIMIT 1
  `, [vendorId, categoryCode.trim()]);
  if (!result.rowCount) throw new Error("Unknown or non-assignable category");
  return {
    id: requiredText(result.rows[0].category_id, "category"),
    code: requiredText(result.rows[0].code, "category code"),
    name: requiredText(result.rows[0].category_name, "category name")
  };
}

async function productTypeSchemas(tx: SqlExecutor, categoryId: string): Promise<readonly VendorProductTypeIdentitySchema[]> {
  const productTypes = await tx.query<SqlRow>(`
    SELECT pt.id::text AS product_type_id,pt.code,
           COALESCE(el.name,en.name,pt.code) AS product_type_name,
           cpt.is_default
    FROM public.category_product_types cpt
    JOIN public.product_types pt ON pt.id=cpt.product_type_id AND pt.status='active'
    LEFT JOIN public.product_type_translations el ON el.product_type_id=pt.id AND el.locale='el'
    LEFT JOIN public.product_type_translations en ON en.product_type_id=pt.id AND en.locale='en'
    WHERE cpt.category_id=$1::uuid
    ORDER BY cpt.is_default DESC,cpt.sort_order,pt.code
  `, [categoryId]);
  if (!productTypes.rowCount) return [];

  const types: ProductTypeRow[] = productTypes.rows.map((row) => ({
    productTypeId: requiredText(row.product_type_id, "product type"),
    code: requiredText(row.code, "product type code"),
    name: requiredText(row.product_type_name, "product type name"),
    isDefault: Boolean(row.is_default)
  }));
  const ids = types.map((type) => type.productTypeId);

  const attributes = await tx.query<SqlRow>(`
    SELECT pta.product_type_id::text AS product_type_id,ad.id::text AS attribute_id,ad.code,
           ad.data_type,ad.value_mode,COALESCE(pta.unit_override,ad.unit) AS unit,
           pta.requirement_level,pta.allow_multiple,pta.variant_axis_order,
           COALESCE(el.label,en.label,ad.code) AS label,
           COALESCE(NULLIF(el.help_text,''),NULLIF(en.help_text,'')) AS help_text
    FROM public.product_type_attributes pta
    JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
    LEFT JOIN public.attribute_translations el ON el.attribute_id=ad.id AND el.locale='el'
    LEFT JOIN public.attribute_translations en ON en.attribute_id=ad.id AND en.locale='en'
    WHERE pta.product_type_id=ANY($1::uuid[])
      AND pta.variant_defining=true
      AND pta.value_level='variant'
    ORDER BY pta.product_type_id,pta.variant_axis_order,pta.sort_order,ad.code
  `, [ids]);

  const attributeIds = [...new Set(attributes.rows.map((row) => requiredText(row.attribute_id, "attribute")))];
  const values = attributeIds.length ? await tx.query<SqlRow>(`
    SELECT pta.product_type_id::text AS product_type_id,ad.code AS attribute_code,
           av.code AS value_code,COALESCE(el.label,en.label,av.code) AS value_label
    FROM public.product_type_attributes pta
    JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id
    JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.active=true
    LEFT JOIN public.attribute_value_translations el ON el.attribute_value_id=av.id AND el.locale='el'
    LEFT JOIN public.attribute_value_translations en ON en.attribute_value_id=av.id AND en.locale='en'
    WHERE pta.product_type_id=ANY($1::uuid[])
      AND pta.variant_defining=true
      AND (
        NOT EXISTS(
          SELECT 1 FROM public.product_type_attribute_allowed_values pav
          WHERE pav.product_type_id=pta.product_type_id AND pav.attribute_id=pta.attribute_id
        )
        OR EXISTS(
          SELECT 1 FROM public.product_type_attribute_allowed_values pav
          WHERE pav.product_type_id=pta.product_type_id AND pav.attribute_id=pta.attribute_id
            AND pav.attribute_value_id=av.id
        )
      )
    ORDER BY pta.product_type_id,ad.code,av.sort_order,av.code
  `, [ids]) : { rows: [], rowCount: 0 };

  const options = new Map<string, VendorVariantValueOption[]>();
  for (const row of values.rows) {
    const key = `${requiredText(row.product_type_id, "product type")}:${requiredText(row.attribute_code, "attribute code")}`;
    const list = options.get(key) ?? [];
    list.push({ code: requiredText(row.value_code, "value code"), label: requiredText(row.value_label, "value label") });
    options.set(key, list);
  }

  const attributesByType = new Map<string, VendorVariantAttributeSchema[]>();
  for (const row of attributes.rows) {
    const typeId = requiredText(row.product_type_id, "product type");
    const code = requiredText(row.code, "attribute code");
    const dataType = requiredText(row.data_type, "attribute type") as VendorVariantAttributeSchema["dataType"];
    const valueMode = requiredText(row.value_mode, "value mode") as VendorVariantAttributeSchema["valueMode"];
    if (!(["text","number","boolean","enum","dimension"] as const).includes(dataType)) throw new Error(`Unsupported attribute data type ${dataType}`);
    if (!(["free","controlled","mixed"] as const).includes(valueMode)) throw new Error(`Unsupported attribute value mode ${valueMode}`);
    const list = attributesByType.get(typeId) ?? [];
    list.push({
      code,
      label: requiredText(row.label, "attribute label"),
      helpText: optionalText(row.help_text),
      dataType,
      valueMode,
      unit: optionalText(row.unit),
      requirementLevel: requiredText(row.requirement_level, "requirement level") as VendorVariantAttributeSchema["requirementLevel"],
      allowMultiple: Boolean(row.allow_multiple),
      variantAxisOrder: integer(row.variant_axis_order, "variant axis order"),
      options: options.get(`${typeId}:${code}`) ?? []
    });
    attributesByType.set(typeId, list);
  }

  return types.map((type) => ({
    code: type.code,
    name: type.name,
    isDefault: type.isDefault,
    variantAttributes: attributesByType.get(type.productTypeId) ?? []
  }));
}

function chosenType(types: readonly VendorProductTypeIdentitySchema[], requested?: string, preferred?: string) {
  const preferredCode = preferred?.trim();
  const requestedCode = requested?.trim();
  if (preferredCode) {
    const preferredType = types.find((type) => type.code === preferredCode);
    if (!preferredType) throw new Error("Canonical Product Type is not valid for this category");
    if (requestedCode && requestedCode !== preferredCode) throw new Error("Selected Product Type does not match the canonical product");
    return preferredType;
  }
  if (requestedCode) {
    const requestedType = types.find((type) => type.code === requestedCode);
    if (!requestedType) throw new Error("Selected Product Type is not valid for this category");
    return requestedType;
  }
  const defaultType = types.find((type) => type.isDefault);
  if (defaultType) return defaultType;
  if (types.length === 1) return types[0];
  if (types.length > 1) throw new Error("Select a Product Type for this category");
  return undefined;
}

function normalizeScalar(attribute: VendorVariantAttributeSchema, value: unknown): VendorVariantScalar {
  if (attribute.dataType === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`${attribute.label}: expected yes/no value`);
  }
  if (attribute.dataType === "number") {
    const number = typeof value === "number" ? value : Number(typeof value === "string" ? value.trim() : Number.NaN);
    if (!Number.isFinite(number)) throw new Error(`${attribute.label}: expected numeric value`);
    return number;
  }
  if (typeof value !== "string") throw new Error(`${attribute.label}: expected text value`);
  const cleaned = value.trim();
  if (!cleaned) throw new Error(`${attribute.label}: value cannot be empty`);
  if (cleaned.length > MAX_TEXT_VALUE) throw new Error(`${attribute.label}: value is too long`);
  if (attribute.dataType === "enum" || attribute.valueMode === "controlled") {
    if (!attribute.options.some((option) => option.code === cleaned)) throw new Error(`${attribute.label}: select one of the governed values`);
  }
  return cleaned;
}

function validateVariantAttributes(
  type: VendorProductTypeIdentitySchema | undefined,
  raw: VendorVariantAttributes | undefined,
  enforceRequired: boolean
): VendorVariantAttributes {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const entries = Object.entries(input);
  if (entries.length > MAX_VARIANT_FIELDS) throw new Error("Too many structured variant fields");
  if (!type) {
    if (entries.length) throw new Error("This category has no governed Product Type for structured variant fields");
    return {};
  }
  const allowed = new Map(type.variantAttributes.map((attribute) => [attribute.code, attribute]));
  const normalized: Record<string, VendorVariantValue> = {};
  for (const [code, value] of entries) {
    const attribute = allowed.get(code);
    if (!attribute) throw new Error(`Variant field ${code} is not governed for Product Type ${type.code}`);
    if (value == null || value === "") continue;
    if (attribute.allowMultiple) {
      const values = Array.isArray(value) ? value : [value];
      if (!values.length || values.length > MAX_MULTIPLE_VALUES) throw new Error(`${attribute.label}: invalid number of values`);
      normalized[code] = values.map((item) => normalizeScalar(attribute, item));
    } else {
      if (Array.isArray(value)) throw new Error(`${attribute.label}: only one value is allowed`);
      normalized[code] = normalizeScalar(attribute, value);
    }
  }
  if (enforceRequired) {
    for (const attribute of type.variantAttributes) {
      if (attribute.requirementLevel === "required" && normalized[attribute.code] == null) throw new Error(`${attribute.label}: required variant identity is missing`);
    }
  }
  return normalized;
}

async function validateStructuredIdentity(
  tx: SqlExecutor,
  vendorId: string,
  input: { categoryCode: string; productTypeCode?: string; variantAttributes?: VendorVariantAttributes; preferredProductTypeCode?: string; enforceRequired: boolean }
): Promise<ValidatedVariantIdentity> {
  const category = await categoryContext(tx, vendorId, input.categoryCode);
  const types = await productTypeSchemas(tx, category.id);
  const type = chosenType(types, input.productTypeCode, input.preferredProductTypeCode);
  return { productTypeCode: type?.code, variantAttributes: validateVariantAttributes(type, input.variantAttributes, input.enforceRequired) };
}

export async function vendorProductIdentitySchema(
  principal: SessionPrincipal,
  input: { categoryCode: string; canonicalVariantId?: string }
): Promise<VendorProductIdentitySchema> {
  if (!postgresVendorRuntimeEnabled()) return { categoryCode: input.categoryCode.trim(), categoryName: input.categoryCode.trim(), productTypes: [] };
  return unitOfWork().withTransaction(vendorScope(principal), async (tx) => {
    const vendorId = requiredVendorId(principal);
    const category = await categoryContext(tx, vendorId, input.categoryCode);
    const types = await productTypeSchemas(tx, category.id);
    let preferred: string | undefined;
    if (input.canonicalVariantId?.trim()) {
      const canonical = await tx.query<SqlRow>(`
        SELECT pt.code AS product_type_code
        FROM public.vendor_businesses vb
        JOIN public.canonical_variants cv ON cv.market_id=vb.market_id AND cv.public_id=$2
        LEFT JOIN public.product_families pf ON pf.id=cv.family_id
        LEFT JOIN public.product_types pt ON pt.id=pf.product_type_id AND pt.status='active'
        WHERE (vb.public_id=$1 OR vb.id::text=$1) AND cv.category_id=$3::uuid
          AND cv.suppressed=false AND cv.recalled=false
        LIMIT 1
      `, [vendorId, input.canonicalVariantId.trim(), category.id]);
      preferred = canonical.rowCount ? optionalText(canonical.rows[0].product_type_code) : undefined;
    }
    const selected = preferred
      ?? types.find((type) => type.isDefault)?.code
      ?? (types.length === 1 ? types[0].code : undefined);
    return { categoryCode: category.code, categoryName: category.name, productTypes: types, selectedProductTypeCode: selected };
  }, { readOnly: true });
}

export async function createVendorStructuredProductDraft(principal: SessionPrincipal, input: CreateVendorStructuredProductInput) {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Structured vendor product identity requires the PostgreSQL runtime");
  if (!input.title.trim() || !input.categoryCode.trim()) throw new Error("Title and category are required");
  assertCommercialInput(input);
  return unitOfWork().withTransaction(vendorScope(principal), async (tx) => {
    const vendorId = requiredVendorId(principal);
    const validated = await validateStructuredIdentity(tx, vendorId, { ...input, enforceRequired: true });
    const refs = await tx.query<SqlRow>(`
      SELECT vb.id::text AS vendor_uuid,vb.market_id::text AS market_uuid,
             (SELECT id::text FROM public.vendor_locations WHERE vendor_id=vb.id AND active ORDER BY created_at LIMIT 1) AS location_uuid,
             (SELECT id::text FROM public.categories WHERE code=$2 AND active=true AND assignable=true AND (market_id IS NULL OR market_id=vb.market_id) ORDER BY CASE WHEN market_id=vb.market_id THEN 0 ELSE 1 END LIMIT 1) AS category_uuid,
             (SELECT id::text FROM public.users WHERE public_id=$3 OR id::text=$3 LIMIT 1) AS user_uuid
      FROM public.vendor_businesses vb WHERE vb.public_id=$1 OR vb.id::text=$1 LIMIT 1
    `, [vendorId, input.categoryCode.trim(), principal.userId]);
    if (!refs.rowCount || !refs.rows[0].location_uuid) throw new Error("Vendor location is not configured");
    if (!refs.rows[0].category_uuid) throw new Error("Unknown category");
    if (!refs.rows[0].user_uuid) throw new Error("Vendor user is not configured");

    const submissionUuid = randomUUID();
    const publicId = `vps_${randomUUID()}`;
    const identity = {
      title: input.title.trim(),
      brand: input.brand?.trim() || undefined,
      model: input.model?.trim() || undefined,
      mpn: input.mpn?.trim() || undefined,
      gtin: input.gtin?.trim() || undefined
    };
    const sourcePayload = {
      productTypeCode: validated.productTypeCode,
      variantAttributes: validated.variantAttributes,
      vendorVariantNote: input.variantNote?.trim() || undefined,
      structuredVariantIdentity: true
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
      submissionUuid,publicId,requiredText(refs.rows[0].market_uuid,"market"),requiredText(refs.rows[0].vendor_uuid,"vendor"),
      requiredText(refs.rows[0].location_uuid,"location"),input.vendorSku?.trim() || null,requiredText(refs.rows[0].category_uuid,"category"),
      JSON.stringify(identity),input.supplierUnitPriceMinor,input.stockOnHand,input.safetyStock ?? 0,input.adviceAvailable !== false,
      JSON.stringify(sourcePayload),requiredText(refs.rows[0].user_uuid,"user")
    ]);
    return { id: publicId, status: "draft" as const };
  }, { isolation: "serializable" });
}

export async function createVendorStructuredProductFromCanonical(principal: SessionPrincipal, input: CreateVendorStructuredLinkedProductInput) {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Structured vendor product identity requires the PostgreSQL runtime");
  assertCommercialInput(input);
  return unitOfWork().withTransaction(vendorScope(principal), async (tx) => {
    const vendorId = requiredVendorId(principal);
    const refs = await tx.query<SqlRow>(`
      SELECT vb.id::text AS vendor_uuid,vb.market_id::text AS market_uuid,
             (SELECT id::text FROM public.vendor_locations WHERE vendor_id=vb.id AND active ORDER BY created_at LIMIT 1) AS location_uuid,
             (SELECT id::text FROM public.users WHERE public_id=$3 OR id::text=$3 LIMIT 1) AS user_uuid,
             cv.id::text AS canonical_uuid,cv.public_id AS canonical_public_id,cv.category_id::text AS category_uuid,
             cv.gtin,cv.model,cv.mpn,cv.variant_attributes,cv.warranty_basis,cv.active AS canonical_active,
             c.code AS category_code,b.name AS brand,pt.code AS product_type_code,
             COALESCE(el.title,en.title,cv.model,cv.mpn,cv.slug) AS canonical_title,
             COALESCE(NULLIF(el.description,''),NULLIF(en.description,'')) AS canonical_description,
             CASE WHEN el.specifications IS NOT NULL AND el.specifications<>'{}'::jsonb THEN el.specifications
                  WHEN en.specifications IS NOT NULL THEN en.specifications ELSE '{}'::jsonb END AS canonical_specifications
      FROM public.vendor_businesses vb
      JOIN public.canonical_variants cv ON cv.market_id=vb.market_id AND cv.public_id=$2
      JOIN public.categories c ON c.id=cv.category_id
      LEFT JOIN public.product_families pf ON pf.id=cv.family_id
      LEFT JOIN public.product_types pt ON pt.id=pf.product_type_id AND pt.status='active'
      LEFT JOIN public.brands b ON b.id=cv.brand_id
      LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE (vb.public_id=$1 OR vb.id::text=$1)
        AND cv.suppressed=false AND cv.recalled=false
      LIMIT 1
    `, [vendorId, input.canonicalVariantId.trim(), principal.userId]);
    if (!refs.rowCount) throw new Error("The selected canonical product is no longer available");
    const row = refs.rows[0];
    if (!row.location_uuid) throw new Error("Vendor location is not configured");
    if (!row.user_uuid) throw new Error("Vendor user is not configured");
    const canonicalCategoryCode = requiredText(row.category_code, "category code");
    if (input.categoryCode.trim() && input.categoryCode.trim() !== canonicalCategoryCode) throw new Error("Selected category does not match the canonical product");

    const validated = await validateStructuredIdentity(tx, vendorId, {
      categoryCode: canonicalCategoryCode,
      productTypeCode: input.productTypeCode,
      preferredProductTypeCode: optionalText(row.product_type_code),
      variantAttributes: input.variantAttributes,
      enforceRequired: false
    });
    const conflict = await tx.query<SqlRow>(`
      SELECT bls_private.catalog_material_variant_conflict($1::jsonb,COALESCE($2::jsonb,'{}'::jsonb)) AS conflict
    `, [JSON.stringify(validated.variantAttributes), JSON.stringify(row.variant_attributes ?? {})]);
    const conflictText = optionalText(conflict.rows[0]?.conflict);
    if (conflictText) {
      return resolveDivergentVendorFamilyVariant(tx, input, {
        marketUuid: requiredText(row.market_uuid,"market"),
        vendorUuid: requiredText(row.vendor_uuid,"vendor"),
        locationUuid: requiredText(row.location_uuid,"location"),
        userUuid: requiredText(row.user_uuid,"user"),
        categoryUuid: requiredText(row.category_uuid,"category"),
        categoryCode: canonicalCategoryCode,
        canonicalUuid: requiredText(row.canonical_uuid,"canonical product"),
        canonicalPublicId: requiredText(row.canonical_public_id,"canonical product"),
        canonicalActive: Boolean(row.canonical_active),
        canonicalTitle: requiredText(row.canonical_title,"canonical title"),
        canonicalDescription: optionalText(row.canonical_description),
        canonicalSpecifications: row.canonical_specifications ?? {},
        canonicalVariantAttributes: row.variant_attributes ?? {},
        canonicalWarrantyBasis: optionalText(row.warranty_basis),
        canonicalBrand: optionalText(row.brand),
        canonicalModel: optionalText(row.model),
        canonicalMpn: optionalText(row.mpn),
        productTypeCode: requiredText(validated.productTypeCode,"product type")
      }, validated.variantAttributes, conflictText);
    }

    const canonicalGtin = optionalText(row.gtin);
    const submittedGtin = input.gtin?.replace(/\D/g, "") || undefined;
    if (canonicalGtin && submittedGtin && canonicalGtin.replace(/\D/g, "") !== submittedGtin) throw new Error("The selected canonical product does not match the submitted GTIN");
    const canonicalMpn = optionalText(row.mpn);
    const canonicalModel = optionalText(row.model);
    const submittedPart = input.mpn?.trim() || input.model?.trim();
    const canonicalPart = canonicalMpn || canonicalModel;
    const normalizePart = (value: string) => value.toLocaleLowerCase("el").replace(/[^\p{L}\p{N}]+/gu, "");
    if (!submittedGtin && submittedPart && canonicalPart && normalizePart(submittedPart) !== normalizePart(canonicalPart)) throw new Error("The selected canonical product does not match the submitted model/MPN");

    const submissionUuid = randomUUID();
    const publicId = `vps_${randomUUID()}`;
    const identity = {
      title: requiredText(row.canonical_title, "canonical title"),
      brand: optionalText(row.brand),
      model: canonicalModel,
      mpn: canonicalMpn,
      gtin: canonicalGtin
    };
    const sourcePayload = {
      canonicalSelectedByVendor: true,
      canonicalVariantId: input.canonicalVariantId.trim(),
      canonicalWasInactive: !Boolean(row.canonical_active),
      canonicalDescription: optionalText(row.canonical_description),
      canonicalSpecifications: row.canonical_specifications ?? {},
      canonicalVariantAttributes: row.variant_attributes ?? {},
      canonicalWarrantyBasis: optionalText(row.warranty_basis),
      productTypeCode: validated.productTypeCode,
      variantAttributes: validated.variantAttributes,
      vendorVariantNote: input.variantNote?.trim() || undefined,
      structuredVariantIdentity: true
    };

    await tx.query(`
      INSERT INTO public.vendor_product_submissions(
        id,public_id,market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
        supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
        advice_available,source,source_payload,status,canonical_variant_id,created_by,created_at,updated_at
      ) VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'EUR',$10,$11,ARRAY['pickup']::fulfilment_mode[],
        $12,'manual',$13::jsonb,'linked',$14,$15,now(),now()
      )
    `, [
      submissionUuid,publicId,requiredText(row.market_uuid,"market"),requiredText(row.vendor_uuid,"vendor"),requiredText(row.location_uuid,"location"),
      input.vendorSku?.trim() || null,requiredText(row.category_uuid,"category"),JSON.stringify(identity),input.supplierUnitPriceMinor,input.stockOnHand,
      input.safetyStock ?? 0,input.adviceAvailable !== false,JSON.stringify(sourcePayload),requiredText(row.canonical_uuid,"canonical product"),requiredText(row.user_uuid,"user")
    ]);
    await tx.query(`
      INSERT INTO public.catalog_workflow_events(
        id,public_id,submission_id,actor_id,action,from_status,to_status,canonical_variant_id,reason,metadata,created_at
      ) VALUES(
        $1,$2,$3,$4,'vendor_selected_canonical','draft','linked',$5,
        'Vendor selected an existing canonical product with governed structured variant identity',$6::jsonb,now()
      )
    `, [
      randomUUID(),`cwe_${randomUUID()}`,submissionUuid,requiredText(row.user_uuid,"user"),requiredText(row.canonical_uuid,"canonical product"),
      JSON.stringify({ source: "vendor_catalog_structured_entry", canonicalPublicId: input.canonicalVariantId.trim(), categoryCode: canonicalCategoryCode, productTypeCode: validated.productTypeCode, canonicalActivationChanged: false })
    ]);
    return { id: publicId, status: "linked" as const, canonicalVariantId: requiredText(row.canonical_public_id,"canonical product") };
  }, { isolation: "serializable" });
}
