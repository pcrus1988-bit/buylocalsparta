import { formatMoney, money, type SqlRow } from "@buy-local-sparta/core";
import type { CatalogCard } from "./catalog-view";
import { approvedCatalogImages } from "./public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type DemoStorefrontVendor = Readonly<{
  uuid: string;
  id: string;
  name: string;
  legalName: string;
  status: string;
  shortDescription?: string;
  story?: string;
  location?: Readonly<{
    name?: string;
    addressLine1?: string;
    addressLine2?: string;
    locality?: string;
    postcode?: string;
    phone?: string;
    publicEmail?: string;
    coordinates?: Readonly<{ latitude: number; longitude: number }>;
  }>;
}>;

export type DemoTechnicalAttribute = Readonly<{
  key: string;
  label: string;
  value: string;
}>;

export type DemoCatalogProduct = CatalogCard & Readonly<{
  offerStatus: string;
  vendorSku?: string;
  model?: string;
  supplierCode?: string;
  sourceGtin?: string;
  sourceProductId?: string;
  sourceUrl?: string;
  previewImageSrc?: string;
  priceBasis: "vendor_offer" | "supplier_recommended" | "pending";
  priceNote?: string;
  technicalAttributes: readonly DemoTechnicalAttribute[];
  variantFamilyId?: string;
  variantGroupSize: number;
  sourceQuality?: string;
  sourceLastResearched?: string;
}>;

type VendorRow = SqlRow & {
  vendor_uuid: string;
  public_id: string;
  trading_name: string;
  legal_name: string;
  status: string;
  short_description: string | null;
  story: string | null;
  location_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  locality: string | null;
  postcode: string | null;
  phone: string | null;
  public_email: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type ProductRow = SqlRow & {
  id: string;
  slug: string;
  model: string | null;
  title: string;
  category_code: string;
  category_label: string | null;
  gtin: string | null;
  mpn: string | null;
  description: string | null;
  brand: string | null;
  variant_attributes: unknown;
  specifications: unknown;
  customer_price_minor: number | string;
  offer_status: string;
  vendor_sku: string | null;
  available_to_sell: number | string;
  source_product_id: string | null;
  source_supplier_code: string | null;
  source_image_url: string | null;
  source_url: string | null;
  source_normalized_payload: unknown;
  source_raw_payload: unknown;
  total_count?: number | string;
};

export type DemoCatalogSort = "recommended" | "price_asc" | "price_desc" | "name_asc";

export type DemoCatalogQuery = Readonly<{
  query?: string;
  categories?: readonly string[];
  brand?: string;
  sort?: DemoCatalogSort;
  offset?: number;
  limit?: number;
}>;

export type DemoCatalogFacetOption = Readonly<{
  value: string;
  label: string;
  count: number;
  groupValue?: string;
  groupLabel?: string;
}>;

export type DemoCatalogFacets = Readonly<{
  total: number;
  categories: readonly DemoCatalogFacetOption[];
  brands: readonly DemoCatalogFacetOption[];
  colors: readonly DemoCatalogFacetOption[];
  sizes: readonly DemoCatalogFacetOption[];
  fits: readonly DemoCatalogFacetOption[];
  materials: readonly DemoCatalogFacetOption[];
}>;

export type DemoCatalogPage = Readonly<{
  products: readonly DemoCatalogProduct[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
}>;

const ATTRIBUTE_LABELS: Readonly<Record<string, string>> = {
  power_w: "Ισχύς",
  flow_l_h: "Παροχή",
  capacity_l: "Χωρητικότητα",
  voltage_v: "Τάση",
  voltage_family: "Οικογένεια τάσης",
  battery_capacity_ah: "Χωρητικότητα μπαταρίας",
  battery_requirement_qty: "Αριθμός μπαταριών",
  pressure_bar: "Πίεση",
  pressure_psi: "Πίεση",
  speed_rpm: "Στροφές",
  rpm: "Στροφές",
  diameter: "Διάμετρος",
  diameter_mm: "Διάμετρος",
  dimensions: "Διαστάσεις",
  dimensions_mm: "Διαστάσεις",
  dimensions_cm: "Διαστάσεις",
  length_m: "Μήκος",
  length_cm: "Μήκος",
  length_mm: "Μήκος",
  width_mm: "Πλάτος",
  height_mm: "Ύψος",
  weight_kg: "Βάρος",
  net_weight_kg: "Καθαρό βάρος",
  engine_cc: "Κυβισμός",
  engine_type: "Τύπος κινητήρα",
  horsepower_hp: "Ιπποδύναμη",
  apparent_power_kva: "Φαινόμενη ισχύς",
  nominal_output_kva: "Ονομαστική ισχύς",
  maximum_output_kva: "Μέγιστη ισχύς",
  luminous_flux_lm: "Φωτεινή ροή",
  color_temperature_k: "Θερμοκρασία χρώματος",
  chain_pitch: "Βήμα αλυσίδας",
  chain_gauge: "Πάχος οδηγού",
  drive_links: "Οδηγοί αλυσίδας",
  pack_qty: "Ποσότητα συσκευασίας",
  material: "Υλικό",
  color: "Χρώμα",
  size: "Μέγεθος",
  features: "Χαρακτηριστικά",
  platform: "Πλατφόρμα",
  included_items: "Περιλαμβάνονται",
  compatible_models: "Συμβατά μοντέλα",
  compatible_brands: "Συμβατές μάρκες",
  compatible_platforms: "Συμβατές πλατφόρμες",
  compatibility_type: "Τύπος συμβατότητας",
  load_ton: "Μέγιστο φορτίο"
};

const text = (value: unknown): string => typeof value === "string" ? value : String(value ?? "");
const optionalText = (value: unknown): string | undefined => {
  const result = text(value).trim();
  return result || undefined;
};
const objectValue = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const jsonObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};
const stringArray = (value: unknown): readonly string[] => Array.isArray(value) ? value.map(optionalText).filter((entry): entry is string => Boolean(entry)) : [];
const numeric = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const positiveInteger = (value: unknown): number | undefined => {
  const parsed = numeric(value);
  return parsed !== undefined && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

function approvedDemoSourceImage(value: unknown): string | undefined {
  const raw = optionalText(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return undefined;
    const hostname = url.hostname.toLowerCase();
    if (!["nikolaoutools.gr", "www.nikolaoutools.gr", "assets.fournarakis.gr"].includes(hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function humanizeKey(key: string): string {
  return ATTRIBUTE_LABELS[key] ?? key
    .replaceAll("_", " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("el"));
}

function attributeValue(key: string, value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value ? "Ναι" : "Όχι";
  if (Array.isArray(value)) {
    const parts = value.map((entry) => attributeValue(key, entry)).filter((entry): entry is string => Boolean(entry));
    return parts.length ? [...new Set(parts)].join(", ") : undefined;
  }
  if (typeof value === "object") return undefined;
  const raw = text(value).trim();
  if (!raw) return undefined;
  if (/\p{L}|%|°|\/|×|x/iu.test(raw)) return raw;
  if (key === "power_w") return `${raw} W`;
  if (key === "capacity_l") return `${raw} L`;
  if (key === "voltage_v") return `${raw} V`;
  if (key === "battery_capacity_ah") return `${raw} Ah`;
  if (key === "pressure_bar") return `${raw} bar`;
  if (key === "pressure_psi") return `${raw} psi`;
  if (key === "speed_rpm" || key === "rpm") return `${raw} rpm`;
  if (key.endsWith("_mm")) return `${raw} mm`;
  if (key.endsWith("_cm")) return `${raw} cm`;
  if (key.endsWith("_m")) return `${raw} m`;
  if (key.endsWith("_kg")) return `${raw} kg`;
  if (key.endsWith("_cc")) return `${raw} cc`;
  if (key.endsWith("_hp")) return `${raw} HP`;
  if (key.endsWith("_kva")) return `${raw} kVA`;
  if (key.endsWith("_lm")) return `${raw} lm`;
  if (key.endsWith("_k")) return `${raw} K`;
  return raw;
}

function numberToken(value: unknown): string | undefined {
  const match = text(value).match(/\d+(?:[.,]\d+)?/);
  return match?.[0]?.replace(",", ".");
}

function technicalAttributes(specifications: Record<string, unknown>, canonicalAttributes: Record<string, unknown>, sourceNormalized: Record<string, unknown>): readonly DemoTechnicalAttribute[] {
  const sourceVariants = objectValue(sourceNormalized.variantAttributes);
  const sourcePriceDrivers = objectValue(sourceNormalized.priceDrivers);
  const combined = new Map<string, unknown>();
  for (const source of [sourcePriceDrivers, sourceVariants, canonicalAttributes, specifications]) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== null && value !== undefined && value !== "") combined.set(key, value);
    }
  }

  // Some title parsers historically emitted the flow number as both capacity_l and
  // flow_l_h. Do not turn that duplicate parser artefact into a customer claim.
  if (combined.has("capacity_l") && combined.has("flow_l_h") && numberToken(combined.get("capacity_l")) === numberToken(combined.get("flow_l_h"))) {
    combined.delete("capacity_l");
  }

  const hidden = new Set(["sizes", "sizes_observed", "brand", "made_in", "fit", "composition"]);
  return [...combined.entries()]
    .filter(([key]) => !hidden.has(key))
    .map(([key, value]) => ({ key, label: humanizeKey(key), value: attributeValue(key, value) }))
    .filter((entry): entry is DemoTechnicalAttribute => Boolean(entry.value))
    .slice(0, 30);
}

function sourcePrice(raw: Record<string, unknown>): number | undefined {
  if (text(raw.price_status).toLowerCase() !== "matched") return undefined;
  if (text(raw.price_match_confidence).toLowerCase() !== "high") return undefined;
  if (text(raw.price_review_required).toLowerCase() !== "no") return undefined;
  return positiveInteger(raw.recommended_price_minor);
}

function productFromRow(row: ProductRow, vendor: DemoStorefrontVendor, image?: Readonly<{ mediaId: string; altText?: string }>): DemoCatalogProduct {
  const sourceNormalized = objectValue(row.source_normalized_payload);
  const sourceRaw = objectValue(row.source_raw_payload);
  const attributes = {
    ...jsonObject(sourceRaw.variant_attributes_json),
    ...objectValue(row.variant_attributes)
  };
  const specifications: Record<string, unknown> = {
    ...jsonObject(sourceRaw.specifications_json),
    ...objectValue(row.specifications)
  };
  for (const key of ["included_items", "platform", "voltage_family", "battery_requirement_qty", "compatibility_type", "compatible_models", "compatible_brands", "compatible_platforms"] as const) {
    const value = sourceRaw[key];
    if (value !== null && value !== undefined && value !== "") specifications[key] = value;
  }

  const vendorPriceMinor = positiveInteger(row.customer_price_minor);
  const sourcePriceMinor = sourcePrice(sourceRaw);
  const priceMinor = vendorPriceMinor ?? sourcePriceMinor ?? 0;
  const priceBasis: DemoCatalogProduct["priceBasis"] = vendorPriceMinor ? "vendor_offer" : sourcePriceMinor ? "supplier_recommended" : "pending";
  const sizes = stringArray(specifications.sizes).length ? stringArray(specifications.sizes) : stringArray(attributes.sizes_observed);
  const availableToSell = Math.max(0, Number(row.available_to_sell ?? 0));
  const sourceProductId = optionalText(row.source_product_id);
  const sourceImage = approvedDemoSourceImage(row.source_image_url);
  const sourceDescription = optionalText(sourceNormalized.descriptionEl) ?? optionalText(sourceRaw.master_description_el);
  const variantGroupSize = Math.max(1, Math.trunc(numeric(sourceNormalized.variantGroupSize) ?? numeric(sourceRaw.variant_group_size) ?? 1));

  return {
    id: text(row.id),
    slug: text(row.slug),
    title: text(row.title),
    priceMinor,
    price: priceMinor > 0 ? formatMoney(money(priceMinor)) : "Τιμή προς επιβεβαίωση",
    categoryCode: text(row.category_code),
    categoryLabel: optionalText(row.category_label),
    gtin: optionalText(row.gtin),
    mpn: optionalText(row.mpn),
    description: optionalText(row.description) ?? sourceDescription,
    brand: optionalText(row.brand) ?? optionalText(specifications.brand) ?? optionalText(sourceRaw.brand),
    color: optionalText(specifications.color) ?? optionalText(attributes.color),
    sizes,
    fit: optionalText(specifications.fit),
    composition: optionalText(specifications.composition),
    madeIn: optionalText(specifications.made_in) ?? optionalText(attributes.made_in),
    vendorId: vendor.id,
    vendorName: vendor.name,
    mediaId: image?.mediaId,
    mediaAlt: image?.altText ?? optionalText(sourceRaw.image_alt) ?? text(row.title),
    availableToSell,
    // On DEMO this flag drives the "price present" filter only. Commerce remains
    // hard-disabled by the vendor DEMO invariant and the dedicated demo routes.
    available: priceMinor > 0,
    offerStatus: text(row.offer_status),
    vendorSku: optionalText(row.vendor_sku),
    model: optionalText(row.model) ?? optionalText(sourceRaw.model),
    supplierCode: optionalText(row.source_supplier_code) ?? optionalText(sourceRaw.supplier_code),
    sourceGtin: optionalText(sourceRaw.gtin13),
    sourceProductId,
    sourceUrl: optionalText(row.source_url) ?? optionalText(sourceRaw.source_url),
    previewImageSrc: !image?.mediaId ? sourceImage : undefined,
    priceBasis,
    priceNote: priceBasis === "supplier_recommended"
      ? `Προτεινόμενη λιανική τιμή καταλόγου${optionalText(sourceRaw.price_source_page) ? ` · σελ. ${optionalText(sourceRaw.price_source_page)}` : ""}. Απαιτείται επιβεβαίωση από το κατάστημα πριν τη δημοσίευση.`
      : priceBasis === "vendor_offer"
        ? "Τιμή που έχει καταχωριστεί στο draft offer του καταστήματος. Το DEMO δεν επιτρέπει αγορά."
        : "Δεν έχει επιβεβαιωθεί ακόμη τιμή για την προεπισκόπηση.",
    technicalAttributes: technicalAttributes(specifications, attributes, sourceNormalized),
    variantFamilyId: optionalText(sourceNormalized.variantFamilyId) ?? optionalText(sourceRaw.variant_family_id),
    variantGroupSize,
    sourceQuality: optionalText(sourceNormalized.descriptionQuality) ?? optionalText(sourceRaw.description_quality),
    sourceLastResearched: optionalText(sourceNormalized.lastResearchedDate) ?? optionalText(sourceRaw.last_researched_date)
  };
}

export async function getDemoStorefrontVendor(vendorKey: string): Promise<DemoStorefrontVendor | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<VendorRow>(`
    SELECT v.id::text AS vendor_uuid,v.public_id,v.trading_name,v.legal_name,v.status::text AS status,
           pt.short_description,pt.story,
           l.name AS location_name,l.address_line1,l.address_line2,l.locality,l.postcode,l.phone,l.public_email::text AS public_email,
           CASE WHEN l.coordinates IS NULL THEN NULL ELSE ST_Y(l.coordinates::geometry) END AS latitude,
           CASE WHEN l.coordinates IS NULL THEN NULL ELSE ST_X(l.coordinates::geometry) END AS longitude
    FROM vendor_businesses v
    LEFT JOIN vendor_profile_translations pt ON pt.vendor_id=v.id AND pt.locale='el'
    LEFT JOIN LATERAL (
      SELECT name,address_line1,address_line2,locality,postcode,phone,public_email,coordinates
      FROM vendor_locations
      WHERE vendor_id=v.id
      ORDER BY is_primary DESC NULLS LAST,active DESC,created_at,public_id
      LIMIT 1
    ) l ON true
    WHERE (v.public_id=$1 OR v.id::text=$1)
      AND v.demo_mode=true
      AND v.status NOT IN ('active','restricted','suspended','closed')
    LIMIT 1
  `, [vendorKey]);
  const row = result.rows[0];
  if (!row) return undefined;
  const latitude = numeric(row.latitude);
  const longitude = numeric(row.longitude);
  const hasLocation = Boolean(row.location_name || row.address_line1 || row.locality || row.postcode || row.phone || row.public_email || (latitude !== undefined && longitude !== undefined));
  return {
    uuid: text(row.vendor_uuid),
    id: text(row.public_id),
    name: text(row.trading_name),
    legalName: text(row.legal_name),
    status: text(row.status),
    shortDescription: optionalText(row.short_description),
    story: optionalText(row.story),
    location: hasLocation ? {
      name: optionalText(row.location_name),
      addressLine1: optionalText(row.address_line1),
      addressLine2: optionalText(row.address_line2),
      locality: optionalText(row.locality),
      postcode: optionalText(row.postcode),
      phone: optionalText(row.phone),
      publicEmail: optionalText(row.public_email),
      coordinates: latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined
    } : undefined
  };
}

async function productRows(
  vendorUuid: string,
  routeKey?: string,
  variantFamilyId?: string,
  options: DemoCatalogQuery = {}
): Promise<readonly ProductRow[]> {
  const values: unknown[] = [vendorUuid];
  const predicates: string[] = [];
  const sort = options.sort ?? "recommended";
  const query = options.query?.trim() ?? "";
  const brand = options.brand?.trim() ?? "";
  const needsPreTranslations = Boolean(query) || sort === "name_asc";
  const needsPreBrand = Boolean(query) || Boolean(brand);
  const preTitle = needsPreTranslations
    ? "COALESCE(el_pre.title,en_pre.title,cv.model,cv.slug)"
    : "COALESCE(cv.model,cv.slug)";

  if (routeKey) {
    values.push(routeKey);
    predicates.push(`(cv.public_id=$${values.length} OR cv.slug=$${values.length})`);
  }

  if (variantFamilyId) {
    values.push(variantFamilyId);
    const familyParam = values.length;
    predicates.push(`EXISTS (
      SELECT 1
      FROM catalog_source_products direct_source
      WHERE best.source_product_id IS NOT NULL
        AND direct_source.id=best.source_product_id
        AND direct_source.normalized_payload->>'variantFamilyId'=$${familyParam}
      UNION ALL
      SELECT 1
      FROM catalog_source_product_links family_link
      JOIN catalog_source_products linked_source ON linked_source.id=family_link.source_product_id
      WHERE best.source_product_id IS NULL
        AND family_link.canonical_variant_id=cv.id
        AND family_link.link_status='approved'
        AND linked_source.normalized_payload->>'variantFamilyId'=$${familyParam}
      LIMIT 1
    )`);
  }

  if (query) {
    values.push(query);
    const queryParam = values.length;
    predicates.push(`(
      ${preTitle} ILIKE '%'||$${queryParam}||'%'
      OR COALESCE(b_pre.name,'') ILIKE '%'||$${queryParam}||'%'
      OR COALESCE(cv.model,'') ILIKE '%'||$${queryParam}||'%'
      OR COALESCE(cv.gtin,'') ILIKE '%'||$${queryParam}||'%'
      OR COALESCE(cv.mpn,'') ILIKE '%'||$${queryParam}||'%'
    )`);
  }

  const categories = [...new Set((options.categories ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 64);
  if (categories.length) {
    values.push(categories);
    predicates.push(`c.code = ANY($${values.length}::text[])`);
  }

  if (brand) {
    values.push(brand);
    predicates.push(`lower(COALESCE(b_pre.name,'')) = lower($${values.length})`);
  }

  const sortSql = sort === "price_asc"
    ? "CASE WHEN searchable.customer_price_minor>0 THEN 0 ELSE 1 END,searchable.customer_price_minor ASC,searchable.id"
    : sort === "price_desc"
      ? "CASE WHEN searchable.customer_price_minor>0 THEN 0 ELSE 1 END,searchable.customer_price_minor DESC,searchable.id"
      : sort === "name_asc"
        ? "searchable.sort_title,searchable.id"
        : "searchable.assignment_priority,searchable.assignment_updated_at DESC,searchable.id";

  let pageSql = "";
  if (options.limit !== undefined) {
    const limit = Math.max(1, Math.min(60, Math.trunc(options.limit)));
    const offset = Math.max(0, Math.trunc(options.offset ?? 0));
    values.push(limit);
    const limitParam = values.length;
    values.push(offset);
    const offsetParam = values.length;
    pageSql = `LIMIT $${limitParam} OFFSET $${offsetParam}`;
  }

  const result = await getProductionPostgresRuntime().sqlPool.query<ProductRow>(`
    WITH RECURSIVE raw_assignment AS (
      SELECT
        vo.canonical_variant_id,
        NULL::uuid AS source_product_id,
        vo.customer_price_minor,
        vo.status::text AS offer_status,
        vo.vendor_sku,
        GREATEST(
          COALESCE(ib.on_hand,0)
          - COALESCE(ib.active_reservations,0)
          - COALESCE(ib.safety_stock,0)
          - COALESCE(ib.blocked,0),
          0
        )::int AS available_to_sell,
        CASE vo.status WHEN 'approved' THEN 1 WHEN 'pending_review' THEN 2 ELSE 3 END AS assignment_priority,
        vo.updated_at AS assignment_updated_at
      FROM vendor_offers vo
      LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE vo.vendor_id=$1::uuid
        AND vo.status IN ('draft','pending_review','approved')

      UNION ALL

      SELECT
        vca.canonical_variant_id,
        vca.source_product_id,
        0::bigint AS customer_price_minor,
        ('assortment_' || vca.assortment_status) AS offer_status,
        vca.vendor_sku,
        0::int AS available_to_sell,
        4 AS assignment_priority,
        vca.updated_at AS assignment_updated_at
      FROM vendor_catalog_assortments vca
      WHERE vca.vendor_id=$1::uuid
        AND vca.canonical_variant_id IS NOT NULL
        AND vca.assortment_status NOT IN ('rejected','discontinued')
    ),
    best_assignment AS (
      SELECT DISTINCT ON (raw.canonical_variant_id)
        raw.canonical_variant_id,
        raw.source_product_id,
        raw.customer_price_minor,
        raw.offer_status,
        raw.vendor_sku,
        raw.available_to_sell,
        raw.assignment_priority,
        raw.assignment_updated_at
      FROM raw_assignment raw
      ORDER BY raw.canonical_variant_id,raw.assignment_priority,raw.assignment_updated_at DESC,raw.source_product_id NULLS LAST
    ),
    searchable AS (
      SELECT
        best.canonical_variant_id,
        best.source_product_id,
        best.customer_price_minor,
        best.offer_status,
        best.vendor_sku,
        best.available_to_sell,
        best.assignment_priority,
        best.assignment_updated_at,
        cv.public_id AS id,
        cv.slug,
        cv.model,
        cv.gtin,
        cv.mpn,
        cv.category_id,
        c.code AS category_code,
        ${preTitle} AS sort_title
      FROM best_assignment best
      JOIN canonical_variants cv ON cv.id=best.canonical_variant_id
      JOIN categories c ON c.id=cv.category_id
      ${needsPreBrand ? "LEFT JOIN brands b_pre ON b_pre.id=cv.brand_id" : ""}
      ${needsPreTranslations ? "LEFT JOIN product_translations el_pre ON el_pre.canonical_variant_id=cv.id AND el_pre.locale='el'\n      LEFT JOIN product_translations en_pre ON en_pre.canonical_variant_id=cv.id AND en_pre.locale='en'" : ""}
      WHERE cv.suppressed=false
        AND cv.recalled=false
        ${predicates.length ? `AND ${predicates.join("\n        AND ")}` : ""}
    ),
    page AS (
      SELECT searchable.*,count(*) OVER() AS total_count
      FROM searchable
      ORDER BY ${sortSql}
      ${pageSql}
    )
    SELECT
      page.id,page.slug,page.model,COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
      page.category_code,COALESCE(ctel.name,cten.name,c.code) AS category_label,
      page.gtin,page.mpn,COALESCE(el.description,en.description) AS description,b.name AS brand,
      cv.variant_attributes,COALESCE(el.specifications,en.specifications,'{}'::jsonb) AS specifications,
      page.customer_price_minor,page.offer_status,page.vendor_sku,page.available_to_sell,
      src.source_product_id,src.source_supplier_code,src.source_image_url,src.source_url,
      src.source_normalized_payload,src.source_raw_payload,page.total_count
    FROM page
    JOIN canonical_variants cv ON cv.id=page.canonical_variant_id
    JOIN categories c ON c.id=page.category_id
    LEFT JOIN brands b ON b.id=cv.brand_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
    LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
    LEFT JOIN LATERAL (
      SELECT source_row.*
      FROM (
        SELECT
          csp.id::text AS source_product_id,
          csp.supplier_code AS source_supplier_code,
          csp.source_image_url,
          csp.source_url,
          csp.normalized_payload AS source_normalized_payload,
          csp.raw_payload AS source_raw_payload,
          0 AS source_priority,
          csp.created_at AS source_updated_at
        FROM catalog_source_products csp
        WHERE page.source_product_id IS NOT NULL
          AND csp.id=page.source_product_id

        UNION ALL

        SELECT
          csp.id::text AS source_product_id,
          csp.supplier_code AS source_supplier_code,
          csp.source_image_url,
          csp.source_url,
          csp.normalized_payload AS source_normalized_payload,
          csp.raw_payload AS source_raw_payload,
          1 AS source_priority,
          csl.updated_at AS source_updated_at
        FROM catalog_source_product_links csl
        JOIN catalog_source_products csp ON csp.id=csl.source_product_id
        WHERE page.source_product_id IS NULL
          AND csl.canonical_variant_id=page.canonical_variant_id
          AND csl.link_status='approved'
      ) source_row
      ORDER BY source_row.source_priority,source_row.source_updated_at DESC,source_row.source_product_id
      LIMIT 1
    ) src ON true
    ORDER BY ${sortSql.replaceAll("searchable.", "page.")}
  `, values);
  return result.rows;
}

async function attachApprovedImages(rows: readonly ProductRow[], vendor: DemoStorefrontVendor): Promise<readonly DemoCatalogProduct[]> {
  if (rows.length === 0) return [];
  let imageById = new Map<string, Readonly<{ mediaId: string; altText?: string }>>();
  try {
    const images = await approvedCatalogImages(rows.slice(0, 250).map((row) => ({ canonicalVariantId: text(row.id), preferredVendorId: vendor.id })));
    imageById = new Map(images.map((image) => [image.canonicalVariantId, { mediaId: image.mediaId, altText: image.altText }]));
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "demo_storefront.media_projection_failed", vendorId: vendor.id, message: error instanceof Error ? error.message : String(error) }));
  }
  return rows.map((row) => productFromRow(row, vendor, imageById.get(text(row.id))));
}

function facetOptions(values: readonly Readonly<{
  value?: string | null;
  label?: string | null;
  groupValue?: string | null;
  groupLabel?: string | null;
}>[]): readonly DemoCatalogFacetOption[] {
  const counts = new Map<string, {
    label: string;
    count: number;
    groupValue?: string;
    groupLabel?: string;
  }>();
  for (const entry of values) {
    const value = entry.value?.trim();
    if (!value) continue;
    const current = counts.get(value);
    const groupValue = entry.groupValue?.trim() || undefined;
    const groupLabel = entry.groupLabel?.trim() || undefined;
    counts.set(value, {
      label: current?.label ?? entry.label?.trim() ?? value,
      count: (current?.count ?? 0) + 1,
      groupValue: current?.groupValue ?? groupValue,
      groupLabel: current?.groupLabel ?? groupLabel
    });
  }
  return [...counts.entries()]
    .map(([value, entry]) => ({
      value,
      label: entry.label,
      count: entry.count,
      ...(entry.groupValue ? { groupValue: entry.groupValue } : {}),
      ...(entry.groupLabel ? { groupLabel: entry.groupLabel } : {})
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "el"));
}

export async function getDemoVendorCatalogPage(
  vendor: DemoStorefrontVendor,
  options: DemoCatalogQuery = {}
): Promise<DemoCatalogPage> {
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const limit = Math.max(1, Math.min(60, Math.trunc(options.limit ?? 20)));
  const rows = await productRows(vendor.uuid, undefined, undefined, { ...options, offset, limit });
  const products = await attachApprovedImages(rows, vendor);
  const total = Math.max(0, Math.trunc(numeric(rows[0]?.total_count) ?? 0));
  return {
    products,
    total,
    offset,
    limit,
    nextOffset: offset + limit < total ? offset + limit : null
  };
}

export async function getDemoVendorCatalogFacets(vendor: DemoStorefrontVendor): Promise<DemoCatalogFacets> {
  type FacetRow = SqlRow & {
    facet_kind: "total" | "category" | "brand";
    value: string | null;
    label: string | null;
    group_value: string | null;
    group_label: string | null;
    facet_count: number | string;
  };

  // Aggregate in PostgreSQL instead of returning one row per assigned variant.
  // Large DEMO catalogues (Fournarakis alone contributes 6k+ products) previously
  // sent thousands of rows through the serverless connection merely to count them
  // again in JavaScript. The compact projection keeps the connection short-lived
  // and materially reduces pool pressure on Vercel.
  const result = await getProductionPostgresRuntime().sqlPool.query<FacetRow>(`
    WITH RECURSIVE raw_assignment AS (
      SELECT vo.canonical_variant_id
      FROM vendor_offers vo
      WHERE vo.vendor_id=$1::uuid
        AND vo.status IN ('draft','pending_review','approved')

      UNION ALL

      SELECT vca.canonical_variant_id
      FROM vendor_catalog_assortments vca
      WHERE vca.vendor_id=$1::uuid
        AND vca.canonical_variant_id IS NOT NULL
        AND vca.assortment_status NOT IN ('rejected','discontinued')
    ),
    assigned_variants AS (
      SELECT DISTINCT canonical_variant_id
      FROM raw_assignment
    ),
    category_lineage AS (
      SELECT c.id AS leaf_id,
             c.id AS ancestor_id,
             c.parent_id,
             c.taxonomy_role,
             c.assignable,
             0 AS depth
      FROM categories c

      UNION ALL

      SELECT lineage.leaf_id,
             parent.id AS ancestor_id,
             parent.parent_id,
             parent.taxonomy_role,
             parent.assignable,
             lineage.depth + 1
      FROM category_lineage lineage
      JOIN categories parent ON parent.id=lineage.parent_id
    ),
    main_category AS (
      SELECT DISTINCT ON (lineage.leaf_id)
             lineage.leaf_id,
             lineage.ancestor_id AS main_category_id
      FROM category_lineage lineage
      LEFT JOIN categories parent ON parent.id=lineage.parent_id
      WHERE lineage.assignable=true
        AND lineage.taxonomy_role='product_class'
        AND (parent.taxonomy_role='navigation_group' OR parent.id IS NULL)
      ORDER BY lineage.leaf_id,lineage.depth DESC
    ),
    classified AS (
      SELECT c.code AS category_code,
             COALESCE(ctel.name,cten.name,c.code) AS category_label,
             COALESCE(main.code,c.code) AS category_group_code,
             COALESCE(main_el.name,main_en.name,main.code,ctel.name,cten.name,c.code) AS category_group_label,
             b.name AS brand
      FROM assigned_variants av
      JOIN canonical_variants cv ON cv.id=av.canonical_variant_id
      JOIN categories c ON c.id=cv.category_id
      LEFT JOIN main_category mc ON mc.leaf_id=c.id
      LEFT JOIN categories main ON main.id=mc.main_category_id
      LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
      LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
      LEFT JOIN category_translations main_el ON main_el.category_id=main.id AND main_el.locale='el'
      LEFT JOIN category_translations main_en ON main_en.category_id=main.id AND main_en.locale='en'
      LEFT JOIN brands b ON b.id=cv.brand_id
      WHERE cv.suppressed=false
        AND cv.recalled=false
    )
    SELECT 'total'::text AS facet_kind,
           NULL::text AS value,
           NULL::text AS label,
           NULL::text AS group_value,
           NULL::text AS group_label,
           count(*)::integer AS facet_count
    FROM classified

    UNION ALL

    SELECT 'category'::text AS facet_kind,
           category_code AS value,
           category_label AS label,
           category_group_code AS group_value,
           category_group_label AS group_label,
           count(*)::integer AS facet_count
    FROM classified
    GROUP BY category_code,category_label,category_group_code,category_group_label

    UNION ALL

    SELECT 'brand'::text AS facet_kind,
           brand AS value,
           brand AS label,
           NULL::text AS group_value,
           NULL::text AS group_label,
           count(*)::integer AS facet_count
    FROM classified
    WHERE brand IS NOT NULL AND btrim(brand)<>''
    GROUP BY brand
  `, [vendor.uuid]);

  const total = Math.max(0, Math.trunc(numeric(result.rows.find((row) => row.facet_kind === "total")?.facet_count) ?? 0));
  const categories = result.rows
    .filter((row) => row.facet_kind === "category" && optionalText(row.value))
    .map((row) => ({
      value: text(row.value),
      label: optionalText(row.label) ?? text(row.value),
      count: Math.max(0, Math.trunc(numeric(row.facet_count) ?? 0)),
      ...(optionalText(row.group_value) ? { groupValue: optionalText(row.group_value)! } : {}),
      ...(optionalText(row.group_label) ? { groupLabel: optionalText(row.group_label)! } : {})
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "el"));

  const brands = result.rows
    .filter((row) => row.facet_kind === "brand" && optionalText(row.value))
    .map((row) => ({
      value: text(row.value),
      label: optionalText(row.label) ?? text(row.value),
      count: Math.max(0, Math.trunc(numeric(row.facet_count) ?? 0))
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "el"));

  return {
    total,
    categories,
    brands,
    colors: [],
    sizes: [],
    fits: [],
    materials: []
  };
}

export async function getDemoVendorCatalogCards(vendor: DemoStorefrontVendor): Promise<readonly DemoCatalogProduct[]> {
  return (await getDemoVendorCatalogPage(vendor)).products;
}

export async function getDemoVendorCatalogProduct(vendor: DemoStorefrontVendor, routeKey: string): Promise<DemoCatalogProduct | undefined> {
  return (await attachApprovedImages(await productRows(vendor.uuid, routeKey), vendor))[0];
}

export async function getDemoVendorVariantOptions(vendor: DemoStorefrontVendor, product: DemoCatalogProduct): Promise<readonly DemoCatalogProduct[]> {
  if (!product.variantFamilyId || product.variantGroupSize <= 1) return [];
  return (await attachApprovedImages(await productRows(vendor.uuid, undefined, product.variantFamilyId), vendor))
    .filter((candidate) => candidate.id !== product.id)
    .slice(0, 24);
}
