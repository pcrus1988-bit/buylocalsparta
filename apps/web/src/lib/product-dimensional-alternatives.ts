import { cache } from "react";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import type { ProductRelatedOptionGroup } from "./product-related-options";

type AlternativeRole = "air_hose" | "socket" | "nozzle";

type AlternativeRow = SqlRow & {
  canonical_public_id: string;
  slug: string;
  model: string | null;
  title: string;
  brand_id: string | null;
  variant_attributes: unknown;
  source_variant_family_id: string | null;
  source_normalized_payload: unknown;
  source_raw_payload: unknown;
  media_public_id: string | null;
  media_alt_text: string | null;
  source_image_candidate: string | null;
  source_website: string | null;
};

type CurrentAlternativeRow = AlternativeRow & {
  product_type: string | null;
  supplier_category: string | null;
};

type DimensionChoice = Readonly<{
  key: string;
  label: string;
  value: string;
  numericSort?: number;
}>;

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function normalizedText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productRole(row: Pick<CurrentAlternativeRow, "title" | "product_type" | "supplier_category">): AlternativeRole | undefined {
  const title = normalizedText(row.title);
  const productType = normalizedText(row.product_type ?? "");
  const category = normalizedText(row.supplier_category ?? "");

  if (title.includes("air hose")
    || (title.includes("σωλην") && title.includes("αερ"))
    || (title.includes("σπιραλ") && (title.includes("ταχυσυνδεσ") || title.includes("αερ")))
    || (category.includes("εξαρτηματα αερος") && title.includes("σπιραλ"))
    || (productType === "hose or pipe" && title.includes("αερ"))) return "air_hose";

  if (title.includes("καρυδακ") || /\bsocket\b/u.test(title)) return "socket";
  if (title.includes("ακροφυσ") || /\bnozzle\b/u.test(title)) return "nozzle";
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const match = String(value).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cleanNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function sourceAttributes(row: AlternativeRow): Record<string, unknown> {
  const normalized = objectValue(row.source_normalized_payload);
  const raw = objectValue(row.source_raw_payload);
  return {
    ...objectValue(raw.variant_attributes_json),
    ...objectValue(normalized.variantAttributes),
    ...objectValue(normalized.priceDrivers),
    ...objectValue(row.variant_attributes),
  };
}

function airHoseLengthFromDescription(row: AlternativeRow): number | undefined {
  const normalized = objectValue(row.source_normalized_payload);
  const raw = objectValue(row.source_raw_payload);
  const description = [
    optionalText(normalized.descriptionEl),
    optionalText(raw.master_description_el),
    optionalText(raw.description),
  ].filter(Boolean).join(" ");
  if (!description) return undefined;

  const normalizedDescription = normalizedText(description);
  const dimensions = normalizedDescription.match(/διαστασεις\s+τεμαχιου\s+cm\s+(\d+(?:[.,]\d+)?)\s*[x×]/u);
  const firstCm = numberValue(dimensions?.[1]);
  // Long thin air hoses are often supplied as L×D in centimetres. Only use this
  // fallback when the first dimension is clearly a hose length, never for normal
  // package dimensions.
  if (firstCm !== undefined && firstCm >= 100 && firstCm <= 10000) return firstCm / 100;
  return undefined;
}

function titleLengthMetres(title: string): number | undefined {
  const match = title.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*m(?:\b|$)/iu);
  return numberValue(match?.[1]);
}

function dimensionChoice(row: AlternativeRow, role: AlternativeRole): DimensionChoice | undefined {
  const attributes = sourceAttributes(row);

  if (role === "air_hose") {
    const lengthCm = numberValue(attributes.length_cm);
    const metres = numberValue(attributes.length_m)
      ?? (lengthCm !== undefined ? lengthCm / 100 : undefined)
      ?? titleLengthMetres(row.title)
      ?? airHoseLengthFromDescription(row);
    if (metres !== undefined && metres > 0) {
      return { key: "length", label: "Μήκος", value: `${cleanNumber(metres)} m`, numericSort: metres };
    }
    return undefined;
  }

  if (role === "socket") {
    const socket = row.title.match(/\bNo\.?\s*(\d+(?:[.,]\d+)?)\s*mm\b/i)?.[1];
    const mm = numberValue(socket);
    if (mm !== undefined) return { key: "size", label: "Μέγεθος", value: `${cleanNumber(mm)} mm`, numericSort: mm };
    return undefined;
  }

  const diameter = numberValue(attributes.diameter_mm) ?? numberValue(attributes.length_mm);
  if (diameter !== undefined && diameter > 0) {
    return { key: "diameter", label: "Διάμετρος", value: `${cleanNumber(diameter)} mm`, numericSort: diameter };
  }
  return undefined;
}

function safeSameSourceImage(sourceWebsite: string | null, sourceImage: string | null): boolean {
  if (!sourceWebsite || !sourceImage) return false;
  try {
    const source = new URL(sourceWebsite);
    const image = new URL(sourceImage, source);
    const host = (value: string) => value.toLowerCase().replace(/^www\./, "");
    return image.protocol === "https:" && host(image.hostname) === host(source.hostname);
  } catch {
    return false;
  }
}

function imageForRow(row: AlternativeRow): Pick<ProductRelatedOptionGroup["products"][number], "imageSrc" | "imageAlt"> {
  if (row.media_public_id) {
    return {
      imageSrc: `/api/media/${encodeURIComponent(String(row.media_public_id))}`,
      imageAlt: row.media_alt_text?.trim() || row.title,
    };
  }
  if (safeSameSourceImage(row.source_website, row.source_image_candidate)) {
    return {
      imageSrc: `/api/catalog-source-image/${encodeURIComponent(row.canonical_public_id)}`,
      imageAlt: row.title,
    };
  }
  return { imageAlt: row.title };
}

function roleSearchPredicate(role: AlternativeRole): string {
  if (role === "air_hose") {
    return `AND (
      COALESCE(el.title,en.title,sibling.model,sibling.slug) ILIKE '%σωλήνας%αέρα%'
      OR COALESCE(el.title,en.title,sibling.model,sibling.slug) ILIKE '%σωληνας%αερα%'
      OR COALESCE(el.title,en.title,sibling.model,sibling.slug) ILIKE '%σπιράλ%ταχυ%σύνδεσμο%'
      OR COALESCE(el.title,en.title,sibling.model,sibling.slug) ILIKE '%σπιραλ%ταχυ%συνδεσμο%'
      OR COALESCE(el.title,en.title,sibling.model,sibling.slug) ILIKE '%air hose%'
      OR COALESCE(source_candidate.normalized_payload->>'descriptionEl','') ILIKE '%Σπιράλ%Ταχυ%σύνδεσμο%'
      OR COALESCE(source_candidate.normalized_payload->>'descriptionEl','') ILIKE '%σπιραλ%ταχυ%συνδεσμο%'
    )`;
  }
  if (role === "socket") {
    return `AND (
      COALESCE(el.title,en.title,sibling.model,sibling.slug) ILIKE '%καρυδάκ%'
      OR COALESCE(el.title,en.title,sibling.model,sibling.slug) ILIKE '%socket%'
    )`;
  }
  return `AND (
    COALESCE(el.title,en.title,sibling.model,sibling.slug) ILIKE '%ακροφύσ%'
    OR COALESCE(el.title,en.title,sibling.model,sibling.slug) ILIKE '%nozzle%'
  )`;
}

function groupCopy(role: AlternativeRole): Pick<ProductRelatedOptionGroup, "key" | "title" | "description"> {
  if (role === "air_hose") {
    return {
      key: "air-hose-length-alternatives",
      title: "Άλλα μήκη σωλήνα αέρα",
      description: "Ξεχωριστά προϊόντα της ίδιας μάρκας με διαφορετικό μήκος. Δεν παρουσιάζονται ως παραλλαγές του προϊόντος που βλέπεις· έλεγξε τύπο σύνδεσης και εφαρμογή πριν την επιλογή.",
    };
  }
  if (role === "socket") {
    return {
      key: "socket-size-alternatives",
      title: "Άλλα μεγέθη",
      description: "Ξεχωριστά προϊόντα της ίδιας μάρκας με διαφορετικό μέγεθος. Όπου υπάρχει πραγματική οικογένεια παραλλαγών, αυτή εμφανίζεται ξεχωριστά πάνω από την τιμή.",
    };
  }
  return {
    key: "nozzle-diameter-alternatives",
    title: "Άλλες διαμέτρους",
    description: "Ξεχωριστές επιλογές της ίδιας μάρκας με διαφορετική διάμετρο. Έλεγξε εφαρμογή και συμβατότητα πριν την επιλογή.",
  };
}

async function currentRow(canonicalVariantId: string, allowInactive: boolean): Promise<CurrentAlternativeRow | undefined> {
  const result = await getProductionPostgresRuntime().sqlPool.query<CurrentAlternativeRow>(`
    SELECT cv.public_id AS canonical_public_id,
           cv.slug,
           cv.model,
           COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
           cv.brand_id::text AS brand_id,
           cv.variant_attributes,
           source_candidate.source_variant_family_id,
           source_candidate.normalized_payload AS source_normalized_payload,
           source_candidate.raw_payload AS source_raw_payload,
           source_candidate.product_type,
           source_candidate.supplier_category,
           NULL::text AS media_public_id,
           NULL::text AS media_alt_text,
           source_candidate.source_image_candidate,
           source_candidate.source_website
    FROM canonical_variants cv
    JOIN markets market ON market.id=cv.market_id AND market.code='sparta'
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN LATERAL (
      SELECT COALESCE(
               NULLIF(latest.normalized_payload->>'variantFamilyId',''),
               NULLIF(latest.raw_payload->>'variant_family_id',''),
               NULLIF(linked.normalized_payload->>'variantFamilyId',''),
               NULLIF(linked.raw_payload->>'variant_family_id','')
             ) AS source_variant_family_id,
             latest.normalized_payload,
             latest.raw_payload,
             COALESCE(latest.normalized_payload->>'productType',latest.raw_payload->>'product_type',linked.normalized_payload->>'productType',linked.raw_payload->>'product_type') AS product_type,
             COALESCE(latest.normalized_payload->>'supplierCategory',latest.raw_payload->>'supplier_categories',linked.normalized_payload->>'supplierCategory',linked.raw_payload->>'supplier_categories') AS supplier_category,
             COALESCE(latest.source_image_url,latest.normalized_payload->>'imageUrl',latest.raw_payload->>'image_url',linked.source_image_url,linked.normalized_payload->>'imageUrl',linked.raw_payload->>'image_url') AS source_image_candidate,
             source.website AS source_website
      FROM catalog_source_product_links csl
      JOIN catalog_source_products linked ON linked.id=csl.source_product_id
      JOIN catalog_sources source ON source.id=linked.source_id AND source.active=true
      JOIN LATERAL (
        SELECT candidate.normalized_payload,candidate.raw_payload,candidate.source_image_url
        FROM catalog_source_products candidate
        JOIN catalog_source_snapshots snapshot ON snapshot.id=candidate.snapshot_id
        WHERE candidate.source_id=linked.source_id
          AND candidate.source_product_key=linked.source_product_key
        ORDER BY snapshot.observed_at DESC NULLS LAST,candidate.created_at DESC,candidate.id DESC
        LIMIT 1
      ) latest ON true
      WHERE csl.canonical_variant_id=cv.id
        AND csl.link_status='approved'
      ORDER BY csl.confidence DESC,csl.updated_at DESC,csl.id DESC
      LIMIT 1
    ) source_candidate ON true
    WHERE cv.public_id=$1
      AND ($2::boolean OR cv.active=true)
      AND cv.suppressed=false
      AND cv.recalled=false
    LIMIT 1
  `, [canonicalVariantId, allowInactive]);
  return result.rows[0];
}

async function alternatives(
  canonicalVariantId: string,
  demoVendorUuid?: string,
): Promise<readonly ProductRelatedOptionGroup[]> {
  if (!productionDatabaseConfigured()) return [];
  const demoMode = Boolean(demoVendorUuid);
  const current = await currentRow(canonicalVariantId, demoMode);
  if (!current?.brand_id) return [];
  const role = productRole(current);
  if (!role) return [];
  const currentDimension = dimensionChoice(current, role);
  if (!currentDimension) return [];

  const values: unknown[] = [canonicalVariantId, current.brand_id, demoMode];
  const publicationPredicate = demoVendorUuid
    ? (() => {
        values.push(demoVendorUuid);
        return `AND EXISTS (
          SELECT 1 FROM vendor_offers demo_offer
          WHERE demo_offer.canonical_variant_id=sibling.id
            AND demo_offer.vendor_id=$${values.length}::uuid
            AND demo_offer.status IN ('draft','pending_review','approved')
        )`;
      })()
    : `AND EXISTS (
        SELECT 1
        FROM vendor_offers live_offer
        JOIN vendor_businesses live_vendor ON live_vendor.id=live_offer.vendor_id
        WHERE live_offer.canonical_variant_id=sibling.id
          AND live_offer.status='approved'
          AND live_vendor.status='active'
      )`;

  const result = await getProductionPostgresRuntime().sqlPool.query<AlternativeRow>(`
    SELECT sibling.public_id AS canonical_public_id,
           sibling.slug,
           sibling.model,
           COALESCE(el.title,en.title,sibling.model,sibling.slug) AS title,
           sibling.brand_id::text AS brand_id,
           sibling.variant_attributes,
           source_candidate.source_variant_family_id,
           source_candidate.normalized_payload AS source_normalized_payload,
           source_candidate.raw_payload AS source_raw_payload,
           governed_media.media_public_id,
           governed_media.media_alt_text,
           source_candidate.source_image_candidate,
           source_candidate.source_website
    FROM canonical_variants sibling
    JOIN markets market ON market.id=sibling.market_id AND market.code='sparta'
    LEFT JOIN product_translations el ON el.canonical_variant_id=sibling.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=sibling.id AND en.locale='en'
    LEFT JOIN LATERAL (
      SELECT COALESCE(
               NULLIF(latest.normalized_payload->>'variantFamilyId',''),
               NULLIF(latest.raw_payload->>'variant_family_id',''),
               NULLIF(linked.normalized_payload->>'variantFamilyId',''),
               NULLIF(linked.raw_payload->>'variant_family_id','')
             ) AS source_variant_family_id,
             latest.normalized_payload,
             latest.raw_payload,
             COALESCE(latest.source_image_url,latest.normalized_payload->>'imageUrl',latest.raw_payload->>'image_url',linked.source_image_url,linked.normalized_payload->>'imageUrl',linked.raw_payload->>'image_url') AS source_image_candidate,
             source.website AS source_website
      FROM catalog_source_product_links csl
      JOIN catalog_source_products linked ON linked.id=csl.source_product_id
      JOIN catalog_sources source ON source.id=linked.source_id AND source.active=true
      JOIN LATERAL (
        SELECT candidate.normalized_payload,candidate.raw_payload,candidate.source_image_url
        FROM catalog_source_products candidate
        JOIN catalog_source_snapshots snapshot ON snapshot.id=candidate.snapshot_id
        WHERE candidate.source_id=linked.source_id
          AND candidate.source_product_key=linked.source_product_key
        ORDER BY snapshot.observed_at DESC NULLS LAST,candidate.created_at DESC,candidate.id DESC
        LIMIT 1
      ) latest ON true
      WHERE csl.canonical_variant_id=sibling.id
        AND csl.link_status='approved'
      ORDER BY csl.confidence DESC,csl.updated_at DESC,csl.id DESC
      LIMIT 1
    ) source_candidate ON true
    LEFT JOIN LATERAL (
      SELECT media.public_id AS media_public_id,media.alt_text AS media_alt_text
      FROM product_media media
      WHERE media.canonical_variant_id=sibling.id
        AND media.kind='image'
        AND media.scan_status='clean'
        AND media.rights_status='approved'
        AND media.moderation_status='approved'
        AND media.object_key IS NOT NULL
        AND media.content_type IN ('image/jpeg','image/png','image/webp')
      ORDER BY CASE WHEN media.vendor_id IS NULL THEN 0 ELSE 1 END,
               media.reviewed_at DESC NULLS LAST,
               media.created_at DESC,
               media.public_id
      LIMIT 1
    ) governed_media ON true
    WHERE sibling.public_id<>$1
      AND sibling.brand_id=$2::uuid
      AND ($3::boolean OR sibling.active=true)
      AND sibling.suppressed=false
      AND sibling.recalled=false
      ${publicationPredicate}
      ${roleSearchPredicate(role)}
    ORDER BY sibling.slug
    LIMIT 80
  `, values);

  const candidates = result.rows
    .filter((row) => productRole({
      title: row.title,
      product_type: optionalText(objectValue(row.source_normalized_payload).productType) ?? null,
      supplier_category: optionalText(objectValue(row.source_normalized_payload).supplierCategory) ?? null,
    }) === role)
    // Same source family belongs in the mandatory variant selector, not here.
    .filter((row) => !current.source_variant_family_id || row.source_variant_family_id !== current.source_variant_family_id)
    .map((row) => ({ row, dimension: dimensionChoice(row, role) }))
    .filter((entry): entry is { row: AlternativeRow; dimension: DimensionChoice } => Boolean(entry.dimension))
    .filter((entry) => normalizedText(entry.dimension.value) !== normalizedText(currentDimension.value))
    .sort((a, b) => (a.dimension.numericSort ?? Number.MAX_SAFE_INTEGER) - (b.dimension.numericSort ?? Number.MAX_SAFE_INTEGER));

  const byChoice = new Map<string, { row: AlternativeRow; dimension: DimensionChoice }>();
  for (const candidate of candidates) {
    const key = normalizedText(candidate.dimension.value);
    if (!byChoice.has(key)) byChoice.set(key, candidate);
  }

  const products = [...byChoice.values()].slice(0, 8).map(({ row, dimension }) => ({
    canonicalVariantId: row.canonical_public_id,
    slug: row.slug,
    title: row.title,
    choiceLabel: `${dimension.label}: ${dimension.value}`,
    ...imageForRow(row),
  }));
  if (!products.length) return [];

  return [{ ...groupCopy(role), products }];
}

export const getPublicDimensionalAlternatives = cache(async (
  canonicalVariantId: string,
): Promise<readonly ProductRelatedOptionGroup[]> => alternatives(canonicalVariantId.trim()));

export async function getDemoDimensionalAlternatives(
  canonicalVariantId: string,
  vendorUuid: string,
): Promise<readonly ProductRelatedOptionGroup[]> {
  const canonicalId = canonicalVariantId.trim();
  const vendorId = vendorUuid.trim();
  if (!canonicalId || !vendorId) return [];
  return alternatives(canonicalId, vendorId);
}
