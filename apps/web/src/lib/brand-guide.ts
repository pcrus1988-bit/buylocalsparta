export const BRAND_GUIDE_STATUSES = [
  "empty",
  "draft",
  "needs_review",
  "ready",
  "published"
] as const;

export type BrandGuideStatus = (typeof BRAND_GUIDE_STATUSES)[number];

export type BrandGuideSource = Readonly<{
  url: string;
  label?: string;
  type?: string;
}>;

export type BrandGuideCatalogueCategory = Readonly<{
  slug: string;
  count: number;
}>;

export type BrandGuideCatalogueProfile = Readonly<{
  activeFamilyCount: number;
  generatedAt?: string;
  topCategories: readonly BrandGuideCatalogueCategory[];
}>;

export type BrandGuideContent = Readonly<{
  status: BrandGuideStatus;
  seoIndexable: boolean;
  foundedYear?: number;
  parentCompany?: string;
  brandStory?: string;
  catalogueSummary?: string;
  catalogueStoryBridge?: string;
  catalogueProfile?: BrandGuideCatalogueProfile;
  depthSourceBasis: readonly string[];
  depthEnrichedAt?: string;
  depthEnrichmentVersion?: string;
  whyItStandsOut?: string;
  knownFor: readonly string[];
  signatureProducts: readonly string[];
  notableInnovations: readonly string[];
  primaryCategories: readonly string[];
  productFamilies: readonly string[];
  styleTags: readonly string[];
  audience: readonly string[];
  pricePosition?: string;
  sourceUrls: readonly BrandGuideSource[];
  confidence?: number;
  enrichedAt?: string;
  reviewedAt?: string;
  enrichmentVersion?: string;
  agentStatus?: string;
  agentRequestedAt?: string;
  agentLastError?: string;
}>;

export type BrandGuideQualityInput = Readonly<{
  guide: BrandGuideContent;
  description?: string;
  countryCode?: string;
  website?: string;
  hasLogo: boolean;
  liveProductCount: number;
}>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalText(value: unknown, max = 6000): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : undefined;
}

function stringList(value: unknown, limit = 12): readonly string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const text = optionalText(item, 160);
    if (!text) continue;
    unique.add(text);
    if (unique.size >= limit) break;
  }
  return [...unique];
}

function numberInRange(value: unknown, min: number, max: number): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function catalogueCategories(value: unknown): readonly BrandGuideCatalogueCategory[] {
  if (!Array.isArray(value)) return [];
  const output: BrandGuideCatalogueCategory[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const item = record(candidate);
    const slug = optionalText(item.slug, 160);
    const count = numberInRange(item.count, 0, Number.MAX_SAFE_INTEGER);
    if (!slug || count === undefined || seen.has(slug)) continue;
    seen.add(slug);
    output.push({ slug, count });
    if (output.length >= 8) break;
  }
  return output;
}

function catalogueProfile(value: unknown): BrandGuideCatalogueProfile | undefined {
  const profile = record(value);
  const activeFamilyCount = numberInRange(profile.active_family_count, 0, Number.MAX_SAFE_INTEGER);
  const topCategories = catalogueCategories(profile.top_categories);
  const generatedAt = optionalText(profile.generated_at, 64);
  if (activeFamilyCount === undefined && !topCategories.length && !generatedAt) return undefined;
  return {
    activeFamilyCount: activeFamilyCount ?? 0,
    generatedAt,
    topCategories
  };
}

function guideStatus(value: unknown): BrandGuideStatus {
  return BRAND_GUIDE_STATUSES.includes(value as BrandGuideStatus)
    ? value as BrandGuideStatus
    : "empty";
}

function safeSourceUrl(value: unknown): string | undefined {
  const text = optionalText(value, 1200);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function sources(value: unknown): readonly BrandGuideSource[] {
  if (!Array.isArray(value)) return [];
  const output: BrandGuideSource[] = [];
  const seen = new Set<string>();
  for (const source of value) {
    const item = record(source);
    const url = safeSourceUrl(item.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    output.push({
      url,
      label: optionalText(item.label, 120),
      type: optionalText(item.type, 80)
    });
    if (output.length >= 12) break;
  }
  return output;
}

export function parseBrandGuide(metadata: unknown): BrandGuideContent {
  const root = record(metadata);
  const guide = record(root.brand_guide);
  return {
    status: guideStatus(guide.status),
    seoIndexable: guide.seo_indexable === true,
    foundedYear: numberInRange(guide.founded_year, 1000, new Date().getUTCFullYear()),
    parentCompany: optionalText(guide.parent_company, 200),
    brandStory: optionalText(guide.brand_story),
    catalogueSummary: optionalText(guide.catalogue_summary),
    catalogueStoryBridge: optionalText(guide.catalogue_story_bridge),
    catalogueProfile: catalogueProfile(guide.catalogue_profile),
    depthSourceBasis: stringList(guide.depth_source_basis, 6),
    depthEnrichedAt: optionalText(guide.depth_enriched_at, 64),
    depthEnrichmentVersion: optionalText(guide.depth_enrichment_version, 120),
    whyItStandsOut: optionalText(guide.why_it_stands_out),
    knownFor: stringList(guide.known_for),
    signatureProducts: stringList(guide.signature_products),
    notableInnovations: stringList(guide.notable_innovations),
    primaryCategories: stringList(guide.primary_categories),
    productFamilies: stringList(guide.product_families),
    styleTags: stringList(guide.style_tags),
    audience: stringList(guide.audience),
    pricePosition: optionalText(guide.price_position, 120),
    sourceUrls: sources(guide.source_urls),
    confidence: numberInRange(guide.confidence, 0, 1),
    enrichedAt: optionalText(guide.enriched_at, 64),
    reviewedAt: optionalText(guide.reviewed_at, 64),
    enrichmentVersion: optionalText(guide.enrichment_version, 80),
    agentStatus: optionalText(guide.agent_status, 80),
    agentRequestedAt: optionalText(guide.agent_requested_at, 64),
    agentLastError: optionalText(guide.agent_last_error, 800)
  };
}

export function brandGuideQualityScore(input: BrandGuideQualityInput): number {
  let score = 0;
  if (input.website) score += 8;
  if (input.hasLogo) score += 7;
  if (input.countryCode) score += 5;
  if ((input.description?.trim().length ?? 0) >= 70) score += 15;
  if ((input.guide.whyItStandsOut?.length ?? 0) >= 100) score += 15;
  if ((input.guide.brandStory?.length ?? 0) >= 120) score += 10;
  if (input.guide.knownFor.length >= 2) score += 10;
  if (input.guide.productFamilies.length >= 1 || input.guide.primaryCategories.length >= 1) score += 8;
  if (input.guide.sourceUrls.length >= 1) score += 10;
  if (input.guide.foundedYear) score += 4;
  if (input.liveProductCount > 0) score += 8;
  return Math.min(100, score);
}

export function brandGuideCanIndex(input: BrandGuideQualityInput): boolean {
  return input.guide.status === "published"
    && input.guide.seoIndexable
    && input.liveProductCount > 0
    && (input.description?.trim().length ?? 0) >= 70
    && (input.guide.whyItStandsOut?.length ?? 0) >= 100
    && input.guide.sourceUrls.length >= 1
    && brandGuideQualityScore(input) >= 65;
}

export function brandGuideStatusLabel(status: BrandGuideStatus): string {
  switch (status) {
    case "draft": return "Πρόχειρο";
    case "needs_review": return "Χρειάζεται έλεγχο";
    case "ready": return "Έτοιμο";
    case "published": return "Δημοσιευμένο";
    default: return "Χωρίς περιεχόμενο";
  }
}
