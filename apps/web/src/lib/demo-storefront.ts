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
};

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
    if (hostname !== "nikolaoutools.gr" && hostname !== "www.nikolaoutools.gr") return undefined;
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

async function productRows(vendorUuid: string, routeKey?: string, variantFamilyId?: string): Promise<readonly ProductRow[]> {
  const values: unknown[] = [vendorUuid];
  let routePredicate = "";
  let familyPredicate = "";
  if (routeKey) {
    values.push(routeKey);
    routePredicate = `AND (cv.public_id=$${values.length} OR cv.slug=$${values.length})`;
  }
  if (variantFamilyId) {
    values.push(variantFamilyId);
    familyPredicate = `AND src.source_normalized_payload->>'variantFamilyId'=$${values.length}`;
  }
  const result = await getProductionPostgresRuntime().sqlPool.query<ProductRow>(`
    SELECT DISTINCT ON (cv.id)
           cv.public_id AS id,cv.slug,cv.model,
           COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
           c.code AS category_code,COALESCE(ctel.name,cten.name,c.code) AS category_label,
           cv.gtin,cv.mpn,COALESCE(el.description,en.description) AS description,b.name AS brand,
           cv.variant_attributes,COALESCE(el.specifications,en.specifications,'{}'::jsonb) AS specifications,
           vo.customer_price_minor,vo.status::text AS offer_status,vo.vendor_sku,
           GREATEST(COALESCE(ib.on_hand,0)-COALESCE(ib.active_reservations,0)-COALESCE(ib.safety_stock,0)-COALESCE(ib.blocked,0),0)::int AS available_to_sell,
           src.source_product_id,src.source_supplier_code,src.source_image_url,src.source_url,
           src.source_normalized_payload,src.source_raw_payload
    FROM vendor_offers vo
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    JOIN categories c ON c.id=cv.category_id
    LEFT JOIN brands b ON b.id=cv.brand_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
    LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
    LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
    LEFT JOIN LATERAL (
      SELECT csp.id::text AS source_product_id,csp.supplier_code AS source_supplier_code,
             csp.source_image_url,csp.source_url,csp.normalized_payload AS source_normalized_payload,
             csp.raw_payload AS source_raw_payload
      FROM catalog_source_product_links csl
      JOIN catalog_source_products csp ON csp.id=csl.source_product_id
      WHERE csl.canonical_variant_id=cv.id
        AND csl.link_status='approved'
      ORDER BY csl.confidence DESC,csl.updated_at DESC,csl.id DESC
      LIMIT 1
    ) src ON true
    WHERE vo.vendor_id=$1::uuid
      AND vo.status IN ('draft','pending_review','approved')
      AND cv.suppressed=false AND cv.recalled=false
      ${routePredicate}
      ${familyPredicate}
    ORDER BY cv.id,
      CASE vo.status WHEN 'approved' THEN 1 WHEN 'pending_review' THEN 2 ELSE 3 END,
      vo.updated_at DESC,vo.public_id
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

export async function getDemoVendorCatalogCards(vendor: DemoStorefrontVendor): Promise<readonly DemoCatalogProduct[]> {
  return attachApprovedImages(await productRows(vendor.uuid), vendor);
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
