import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { approvedVendorImages } from "./public-media-service";
import { publicVendorTaxonomies, type PublicVendorTaxonomy } from "./public-vendor-taxonomy";

export type PublicVendorCoordinates = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type PublicVendorLocation = Readonly<{
  name: string;
  addressLine1: string;
  addressLine2?: string;
  locality: string;
  postcode: string;
  phone?: string;
  publicEmail?: string;
  coordinates?: PublicVendorCoordinates;
  verified: boolean;
}>;

export type PublicVendorStory = Readonly<{
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  mediaUrl?: string;
}>;

export type PublicVendorResearchProfile = Readonly<{
  sourceKind?: string;
  majorBranch?: string;
  subBranch?: string;
  marketplaceScope?: string;
  distanceKm?: number;
  storefrontStatus?: string;
  directoryCategories?: string;
  directoryProfileUrl?: string;
  onlineShopActive?: string;
  onlineShopUrl?: string;
  checkedAt?: string;
}>;

export type PublicVendorDirectoryStatus = "partner" | "research";

export type PublicVendorDirectoryEntry = Readonly<{
  id: string;
  name: string;
  adviser?: string;
  location?: PublicVendorLocation;
  story?: PublicVendorStory;
  categoryCodes: readonly string[];
  researchCategory?: string;
  taxonomies: readonly PublicVendorTaxonomy[];
  research?: PublicVendorResearchProfile;
  canonicalCount: number;
  mediaId?: string;
  mediaAlt?: string;
  directoryStatus: PublicVendorDirectoryStatus;
}>;

type VendorDirectoryRow = SqlRow & {
  vendor_id: string;
  vendor_name: string;
  vendor_status: string;
  adviser_name?: string | null;
  location_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  locality?: string | null;
  postcode?: string | null;
  phone?: string | null;
  public_email?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  location_verified?: boolean | null;
  story_id?: string | null;
  story_slug?: string | null;
  story_title?: string | null;
  story_excerpt?: string | null;
  story_media_id?: string | null;
  category_codes?: readonly string[] | null;
  research_source_kind?: string | null;
  research_major_branch?: string | null;
  research_sub_branch?: string | null;
  research_marketplace_scope?: string | null;
  research_distance_km?: number | string | null;
  research_storefront_status?: string | null;
  research_directory_categories?: string | null;
  research_directory_profile?: string | null;
  research_online_shop_active?: string | null;
  research_online_shop_url?: string | null;
  research_checked_at?: string | null;
  canonical_count?: number | string | null;
};

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function publicMediaUrl(value: unknown): string | undefined {
  const mediaId = optionalText(value);
  return mediaId && /^media_[A-Za-z0-9_-]{8,128}$/.test(mediaId) ? `/api/media/${encodeURIComponent(mediaId)}` : undefined;
}

function asCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function asCoordinate(value: unknown, minimum: number, maximum: number): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function textArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()))];
}

function fromDatabaseRow(row: VendorDirectoryRow): PublicVendorDirectoryEntry {
  const isPartner = row.vendor_status === "active";
  const addressLine1 = optionalText(row.address_line1);
  const locality = optionalText(row.locality);
  const postcode = optionalText(row.postcode);
  const latitude = asCoordinate(row.latitude, -90, 90);
  const longitude = asCoordinate(row.longitude, -180, 180);
  const coordinates = latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
  const location = addressLine1 && locality && postcode
    ? {
        name: optionalText(row.location_name) ?? row.vendor_name,
        addressLine1,
        addressLine2: optionalText(row.address_line2),
        locality,
        postcode,
        phone: optionalText(row.phone),
        publicEmail: optionalText(row.public_email),
        coordinates,
        verified: row.location_verified === true
      }
    : undefined;
  const storyId = optionalText(row.story_id);
  const storySlug = optionalText(row.story_slug);
  const storyTitle = optionalText(row.story_title);
  const storyExcerpt = optionalText(row.story_excerpt);
  const story = isPartner && storyId && storySlug && storyTitle && storyExcerpt
    ? { id: storyId, slug: storySlug, title: storyTitle, excerpt: storyExcerpt, mediaUrl: publicMediaUrl(row.story_media_id) }
    : undefined;
  const categoryCodes = isPartner ? textArray(row.category_codes) : [];
  const majorBranch = optionalText(row.research_major_branch);
  const subBranch = optionalText(row.research_sub_branch);
  const research: PublicVendorResearchProfile | undefined = optionalText(row.research_source_kind) || majorBranch || subBranch
    ? {
        sourceKind: optionalText(row.research_source_kind),
        majorBranch,
        subBranch,
        marketplaceScope: optionalText(row.research_marketplace_scope),
        distanceKm: optionalNumber(row.research_distance_km),
        storefrontStatus: optionalText(row.research_storefront_status),
        directoryCategories: optionalText(row.research_directory_categories),
        directoryProfileUrl: optionalText(row.research_directory_profile),
        onlineShopActive: optionalText(row.research_online_shop_active),
        onlineShopUrl: optionalText(row.research_online_shop_url),
        checkedAt: optionalText(row.research_checked_at)
      }
    : undefined;
  return {
    id: row.vendor_id,
    name: row.vendor_name,
    adviser: isPartner ? optionalText(row.adviser_name) : undefined,
    location,
    story,
    categoryCodes,
    researchCategory: isPartner ? undefined : subBranch,
    taxonomies: publicVendorTaxonomies({ majorBranch, subBranch, categoryCodes }),
    research,
    canonicalCount: isPartner ? asCount(row.canonical_count) : 0,
    directoryStatus: isPartner ? "partner" : "research"
  };
}

async function databaseDirectory(vendorId?: string): Promise<readonly PublicVendorDirectoryEntry[]> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  const result = await uow.withTransaction({ marketId: "sparta", platformAccess: true }, (tx) => tx.query<VendorDirectoryRow>(`
    SELECT v.public_id AS vendor_id,
           v.trading_name AS vendor_name,
           v.status::text AS vendor_status,
           adviser.name AS adviser_name,
           location.name AS location_name,
           location.address_line1,
           location.address_line2,
           location.locality,
           location.postcode,
           location.phone,
           location.public_email,
           location.latitude,
           location.longitude,
           location.verified_at IS NOT NULL AS location_verified,
           story.public_id AS story_id,
           story.slug AS story_slug,
           story.title AS story_title,
           story.excerpt AS story_excerpt,
           story.media_public_id AS story_media_id,
           COALESCE(assortment.category_codes, ARRAY[]::text[]) AS category_codes,
           vrp.source_kind AS research_source_kind,
           vrp.major_branch AS research_major_branch,
           vrp.sub_branch AS research_sub_branch,
           vrp.marketplace_scope AS research_marketplace_scope,
           vrp.distance_km AS research_distance_km,
           vrp.storefront_status AS research_storefront_status,
           vrp.directory_categories AS research_directory_categories,
           vrp.directory_profile AS research_directory_profile,
           vrp.online_shop_active AS research_online_shop_active,
           vrp.online_shop_url AS research_online_shop_url,
           vrp.checked_at::text AS research_checked_at,
           COALESCE(assortment.canonical_count, 0)::integer AS canonical_count
    FROM vendor_businesses v
    JOIN markets m ON m.id=v.market_id
    LEFT JOIN vendor_research_profiles vrp ON vrp.vendor_id=v.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(NULLIF(ap.display_name,''),'Local adviser') AS name
      FROM adviser_profiles ap
      JOIN vendor_users vu ON vu.id=ap.vendor_user_id
      WHERE v.status='active' AND vu.vendor_id=v.id AND vu.active=true AND ap.active=true
      ORDER BY ap.created_at,ap.public_id
      LIMIT 1
    ) adviser ON true
    LEFT JOIN LATERAL (
      SELECT vl.name,vl.address_line1,vl.address_line2,vl.locality,vl.postcode,vl.phone,vl.public_email,vl.verified_at,
             CASE WHEN vl.coordinates IS NULL THEN NULL ELSE ST_Y(vl.coordinates::geometry) END AS latitude,
             CASE WHEN vl.coordinates IS NULL THEN NULL ELSE ST_X(vl.coordinates::geometry) END AS longitude
      FROM vendor_locations vl
      WHERE vl.vendor_id=v.id AND vl.active=true
      ORDER BY vl.is_primary DESC,vl.verified_at DESC NULLS LAST,vl.created_at,vl.id
      LIMIT 1
    ) location ON true
    LEFT JOIN LATERAL (
      SELECT ms.public_id,ms.slug,ms.title,ms.excerpt,approved_media.public_id AS media_public_id
      FROM merchant_stories ms
      LEFT JOIN product_media approved_media
        ON approved_media.public_id=ms.og_image
       AND approved_media.vendor_id=v.id
       AND approved_media.canonical_variant_id IS NULL
       AND approved_media.kind='image'
       AND approved_media.scan_status='clean'
       AND approved_media.rights_status='approved'
       AND approved_media.moderation_status='approved'
       AND approved_media.object_key IS NOT NULL
       AND approved_media.content_type IN ('image/jpeg','image/png','image/webp')
      WHERE v.status='active'
        AND ms.vendor_id=v.id
        AND ms.status='published'
        AND ms.locale='el'
        AND ms.vendor_approved_at IS NOT NULL
        AND ms.published_at IS NOT NULL
        AND ms.published_at <= now()
      ORDER BY ms.published_at DESC,ms.updated_at DESC,ms.public_id
      LIMIT 1
    ) story ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT c.code ORDER BY c.code) AS category_codes,
             count(DISTINCT cv.id)::integer AS canonical_count
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN categories c ON c.id=cv.category_id
      JOIN vendor_locations offer_location ON offer_location.id=vo.location_id
      WHERE v.status='active'
        AND vo.vendor_id=v.id
        AND vo.status='approved'
        AND offer_location.active=true
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
    ) assortment ON true
    WHERE (m.code=$1 OR m.id::text=$1)
      AND v.public_directory_visible=true
      AND (
        v.status='active'
        OR (v.status='invited' AND v.public_id LIKE 'vendor_research_%')
      )
      AND ($2::text IS NULL OR v.public_id=$2 OR v.id::text=$2)
    ORDER BY CASE WHEN v.status='active' THEN 0 ELSE 1 END,v.trading_name,v.public_id
  `, ["sparta", vendorId ?? null]), { readOnly: true });
  return result.rows.map(fromDatabaseRow);
}

export async function getPublicVendorDirectory(): Promise<readonly PublicVendorDirectoryEntry[]> {
  if (!productionDatabaseConfigured()) return [];
  const directory = await databaseDirectory();
  const partnerIds = directory.filter((vendor) => vendor.directoryStatus === "partner").map((vendor) => vendor.id);
  const images = new Map((await approvedVendorImages(partnerIds)).map((image) => [image.vendorId, image]));
  return directory.map((vendor) => {
    const image = images.get(vendor.id);
    return image ? { ...vendor, mediaId: image.mediaId, mediaAlt: image.altText } : vendor;
  });
}

export async function getPublicVendorDirectoryEntry(vendorId: string): Promise<PublicVendorDirectoryEntry | undefined> {
  if (!vendorId.trim() || !productionDatabaseConfigured()) return undefined;
  const vendor = (await databaseDirectory(vendorId))[0];
  if (!vendor) return undefined;
  if (vendor.directoryStatus !== "partner") return vendor;
  const image = (await approvedVendorImages([vendor.id]))[0];
  return image ? { ...vendor, mediaId: image.mediaId, mediaAlt: image.altText } : vendor;
}
