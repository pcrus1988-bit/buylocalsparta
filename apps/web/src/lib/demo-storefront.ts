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

export type DemoCatalogProduct = CatalogCard & Readonly<{
  offerStatus: string;
  vendorSku?: string;
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
};

const text = (value: unknown): string => typeof value === "string" ? value : String(value ?? "");
const optionalText = (value: unknown): string | undefined => {
  const result = text(value).trim();
  return result || undefined;
};
const objectValue = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringArray = (value: unknown): readonly string[] => Array.isArray(value) ? value.map(optionalText).filter((entry): entry is string => Boolean(entry)) : [];
const numeric = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function productFromRow(row: ProductRow, vendor: DemoStorefrontVendor, image?: Readonly<{ mediaId: string; altText?: string }>): DemoCatalogProduct {
  const attributes = objectValue(row.variant_attributes);
  const specifications = objectValue(row.specifications);
  const priceMinor = Math.max(0, Number(row.customer_price_minor ?? 0));
  const sizes = stringArray(specifications.sizes).length ? stringArray(specifications.sizes) : stringArray(attributes.sizes_observed);
  const availableToSell = Math.max(0, Number(row.available_to_sell ?? 0));
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
    description: optionalText(row.description),
    brand: optionalText(row.brand) ?? optionalText(specifications.brand),
    color: optionalText(specifications.color) ?? optionalText(attributes.color),
    sizes,
    fit: optionalText(specifications.fit),
    composition: optionalText(specifications.composition),
    madeIn: optionalText(specifications.made_in) ?? optionalText(attributes.made_in),
    vendorId: vendor.id,
    vendorName: vendor.name,
    mediaId: image?.mediaId,
    mediaAlt: image?.altText,
    availableToSell,
    available: priceMinor > 0,
    offerStatus: text(row.offer_status),
    vendorSku: optionalText(row.vendor_sku)
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

async function productRows(vendorUuid: string, routeKey?: string): Promise<readonly ProductRow[]> {
  const values: unknown[] = [vendorUuid];
  const routePredicate = routeKey ? "AND (cv.public_id=$2 OR cv.slug=$2)" : "";
  if (routeKey) values.push(routeKey);
  const result = await getProductionPostgresRuntime().sqlPool.query<ProductRow>(`
    SELECT DISTINCT ON (cv.id)
           cv.public_id AS id,cv.slug,
           COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
           c.code AS category_code,COALESCE(ctel.name,cten.name,c.code) AS category_label,
           cv.gtin,cv.mpn,COALESCE(el.description,en.description) AS description,b.name AS brand,
           cv.variant_attributes,COALESCE(el.specifications,en.specifications,'{}'::jsonb) AS specifications,
           vo.customer_price_minor,vo.status::text AS offer_status,vo.vendor_sku,
           GREATEST(COALESCE(ib.on_hand,0)-COALESCE(ib.active_reservations,0)-COALESCE(ib.safety_stock,0)-COALESCE(ib.blocked,0),0)::int AS available_to_sell
    FROM vendor_offers vo
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    JOIN categories c ON c.id=cv.category_id
    LEFT JOIN brands b ON b.id=cv.brand_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
    LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
    LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
    WHERE vo.vendor_id=$1::uuid
      AND vo.status IN ('draft','pending_review','approved')
      AND cv.suppressed=false AND cv.recalled=false
      ${routePredicate}
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
