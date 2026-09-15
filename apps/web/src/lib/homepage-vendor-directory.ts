import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { approvedVendorImages, approvedVendorProfileMedia, type ApprovedVendorProfileMedia } from "./public-media-service";
import type { PublicVendorDirectoryEntry, PublicVendorStory } from "./public-vendor-directory";
import { publicVendorTaxonomies } from "./public-vendor-taxonomy";

type HomepageVendorRow = SqlRow & Readonly<{
  vendor_id: string;
  vendor_name: string;
  adviser_name?: string | null;
  profile_short_description?: string | null;
  profile_story?: string | null;
  research_major_branch?: string | null;
  research_sub_branch?: string | null;
  story_id?: string | null;
  story_slug?: string | null;
  story_title?: string | null;
  story_excerpt?: string | null;
  story_media_id?: string | null;
}>;

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function customerReadyProfileText(value: unknown): string | undefined {
  const text = optionalText(value);
  if (!text) return undefined;
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[.!?;,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (
    normalized === "δεν πουλαμε τιποτα"
    || normalized === "δεν πουλαμε τιποτα ακομα"
    || normalized === "test"
    || normalized === "demo"
    || normalized === "placeholder"
    || normalized.startsWith("lorem ipsum")
  ) return undefined;
  return text;
}

function publicMediaUrl(value: unknown): string | undefined {
  const mediaId = optionalText(value);
  return mediaId && /^media_[A-Za-z0-9_-]{8,128}$/.test(mediaId)
    ? `/api/media/${encodeURIComponent(mediaId)}`
    : undefined;
}

function preferredProfileMedia(media: readonly ApprovedVendorProfileMedia[], vendorId: string): ApprovedVendorProfileMedia | undefined {
  const vendorMedia = media.filter((item) => item.vendorId === vendorId);
  return vendorMedia.find((item) => item.role === "storefront") ?? vendorMedia.find((item) => item.role === "logo");
}

function storyFromRow(row: HomepageVendorRow): PublicVendorStory | undefined {
  const id = optionalText(row.story_id);
  const slug = optionalText(row.story_slug);
  const title = optionalText(row.story_title);
  const excerpt = optionalText(row.story_excerpt);
  if (!id || !slug || !title || !excerpt) return undefined;
  return { id, slug, title, excerpt, mediaUrl: publicMediaUrl(row.story_media_id) };
}

/**
 * Homepage-only partner directory.
 *
 * The full /shops directory intentionally keeps research evidence, location and
 * assortment aggregation. The homepage needs only active partner presentation,
 * so it must never rescan the 50k+ offer graph just to render six shop windows.
 */
export async function getHomepagePublicVendorDirectory(): Promise<readonly PublicVendorDirectoryEntry[]> {
  if (!productionDatabaseConfigured()) return [];

  const result = await getProductionPostgresRuntime().nativePool.query<HomepageVendorRow>(`
    SELECT
      v.public_id AS vendor_id,
      v.trading_name AS vendor_name,
      adviser.name AS adviser_name,
      profile.short_description AS profile_short_description,
      profile.story AS profile_story,
      vrp.major_branch AS research_major_branch,
      vrp.sub_branch AS research_sub_branch,
      story.public_id AS story_id,
      story.slug AS story_slug,
      story.title AS story_title,
      story.excerpt AS story_excerpt,
      story.media_public_id AS story_media_id
    FROM vendor_businesses v
    JOIN markets m ON m.id=v.market_id
    LEFT JOIN vendor_profile_translations profile ON profile.vendor_id=v.id AND profile.locale='el'
    LEFT JOIN vendor_research_profiles vrp ON vrp.vendor_id=v.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(NULLIF(ap.display_name,''),'Local adviser') AS name
      FROM adviser_profiles ap
      JOIN vendor_users vu ON vu.id=ap.vendor_user_id
      WHERE vu.vendor_id=v.id AND vu.active=true AND ap.active=true
      ORDER BY ap.created_at,ap.public_id
      LIMIT 1
    ) adviser ON true
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
      WHERE ms.vendor_id=v.id
        AND ms.status='published'
        AND ms.locale='el'
        AND ms.vendor_approved_at IS NOT NULL
        AND ms.published_at IS NOT NULL
        AND ms.published_at<=now()
      ORDER BY ms.published_at DESC,ms.updated_at DESC,ms.public_id
      LIMIT 1
    ) story ON true
    WHERE m.code='sparta'
      AND v.public_directory_visible=true
      AND v.status='active'
    ORDER BY v.trading_name,v.public_id
  `);

  const base = result.rows.map((row): PublicVendorDirectoryEntry => {
    const majorBranch = optionalText(row.research_major_branch);
    const subBranch = optionalText(row.research_sub_branch);
    const story = storyFromRow(row);
    return {
      id: row.vendor_id,
      name: row.vendor_name,
      adviser: optionalText(row.adviser_name),
      story,
      profileShortDescription: customerReadyProfileText(row.profile_short_description),
      profileStory: customerReadyProfileText(row.profile_story),
      categoryCodes: [],
      taxonomies: publicVendorTaxonomies({ majorBranch, subBranch, categoryCodes: [] }),
      canonicalCount: 0,
      directoryStatus: "partner"
    };
  });
  if (!base.length) return [];

  const partnerIds = base.map((vendor) => vendor.id);
  const [profileMedia, fallbackImages] = await Promise.all([
    approvedVendorProfileMedia(partnerIds),
    approvedVendorImages(partnerIds)
  ]);
  const fallbackByVendor = new Map(fallbackImages.map((image) => [image.vendorId, image]));

  return base.map((vendor) => {
    const profileImage = preferredProfileMedia(profileMedia, vendor.id);
    const fallback = fallbackByVendor.get(vendor.id);
    const selectedImage = profileImage ?? fallback;
    const effectiveCopy = vendor.profileShortDescription ?? vendor.profileStory ?? vendor.story?.excerpt;
    const effectiveMediaUrl = profileImage
      ? publicMediaUrl(profileImage.mediaId)
      : vendor.story?.mediaUrl ?? (fallback ? publicMediaUrl(fallback.mediaId) : undefined);
    const effectiveStory = effectiveCopy || effectiveMediaUrl
      ? {
          id: vendor.story?.id ?? `storefront_${vendor.id}`,
          slug: vendor.story?.slug ?? vendor.id,
          title: vendor.story?.title ?? vendor.name,
          excerpt: effectiveCopy ?? `Δες το δημόσιο προφίλ του ${vendor.name} και όσα μπορεί να σε βοηθήσει να βρεις.`,
          mediaUrl: effectiveMediaUrl
        }
      : vendor.story;
    return selectedImage
      ? { ...vendor, story: effectiveStory, mediaId: selectedImage.mediaId, mediaAlt: selectedImage.altText }
      : { ...vendor, story: effectiveStory };
  });
}
