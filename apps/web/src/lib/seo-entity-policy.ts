import type { SeoGlobalSettings } from "./seo-settings";

export const SEO_ENTITY_KINDS = ["static", "category", "product", "partner_vendor", "research_vendor"] as const;

export type SeoEntityKind = (typeof SEO_ENTITY_KINDS)[number];
export type SeoOverrideDecision = "inherit" | "allow" | "deny";
export type SeoQualityStatus = "unreviewed" | "approved" | "needs_work" | "suppressed";

export type SeoEntityReference = Readonly<{
  kind: SeoEntityKind;
  id: string;
}>;

export type SeoEntityOverride = SeoEntityReference & Readonly<{
  indexDecision: SeoOverrideDecision;
  sitemapDecision: SeoOverrideDecision;
  schemaDecision: SeoOverrideDecision;
  title?: string;
  description?: string;
  canonicalPath?: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
  openGraphImage?: string;
  keywords: readonly string[];
  editorialLabel?: string;
  qualityStatus: SeoQualityStatus;
  lastReviewedAt: string;
  reviewedBy: string;
}>;

export type SeoEntityControl = Readonly<{
  indexAllowed: boolean;
  sitemapAllowed: boolean;
  schemaAllowed: boolean;
  suppressed: boolean;
}>;

export function isSeoEntityKind(value: unknown): value is SeoEntityKind {
  return typeof value === "string" && SEO_ENTITY_KINDS.includes(value as SeoEntityKind);
}

export function seoEntityKey(reference: SeoEntityReference): string {
  return `${reference.kind}:${reference.id}`;
}

export function routeForSeoEntity(reference: SeoEntityReference): string {
  if (reference.kind === "static") return reference.id;
  if (reference.kind === "category") return `/category/${encodeURIComponent(reference.id)}`;
  if (reference.kind === "product") return `/product/${encodeURIComponent(reference.id)}`;
  return `/vendor/${encodeURIComponent(reference.id)}`;
}

export function findSeoEntityOverride(
  entries: readonly SeoEntityOverride[],
  reference: SeoEntityReference
): SeoEntityOverride | undefined {
  const key = seoEntityKey(reference);
  return entries.find((entry) => seoEntityKey(entry) === key);
}

export function sitemapFamilyEnabled(settings: SeoGlobalSettings, kind: SeoEntityKind): boolean {
  if (kind === "static") return settings.sitemap.staticPages;
  if (kind === "category") return settings.sitemap.categories;
  if (kind === "product") return settings.sitemap.products;
  if (kind === "partner_vendor") return settings.sitemap.partnerVendors;
  return settings.sitemap.researchVendors;
}

/**
 * Hierarchy: global emergency switch and public-admission boundaries always win;
 * family sitemap switches remain authoritative; entity overrides can then narrow
 * or deliberately opt an eligible entity into its normal family policy.
 */
export function resolveSeoEntityControl(input: {
  settings: SeoGlobalSettings;
  kind: SeoEntityKind;
  entityEligible: boolean;
  defaultIndexAllowed: boolean;
  defaultSitemapAllowed?: boolean;
  defaultSchemaAllowed?: boolean;
  override?: SeoEntityOverride;
}): SeoEntityControl {
  const suppressed = input.override?.qualityStatus === "suppressed";
  const indexAllowed = Boolean(
    input.settings.indexingEnabled
      && input.entityEligible
      && !suppressed
      && input.override?.indexDecision !== "deny"
      && (input.override?.indexDecision === "allow" || input.defaultIndexAllowed)
  );
  const sitemapAllowed = Boolean(
    indexAllowed
      && sitemapFamilyEnabled(input.settings, input.kind)
      && input.override?.sitemapDecision !== "deny"
      && (input.override?.sitemapDecision === "allow" || (input.defaultSitemapAllowed ?? input.defaultIndexAllowed))
  );
  const schemaAllowed = Boolean(
    indexAllowed
      && (input.defaultSchemaAllowed ?? false)
      && input.override?.schemaDecision !== "deny"
  );
  return { indexAllowed, sitemapAllowed, schemaAllowed, suppressed };
}

export function absoluteSeoCanonical(origin: string, reference: SeoEntityReference, override?: SeoEntityOverride): string {
  return new URL(override?.canonicalPath ?? routeForSeoEntity(reference), `${origin}/`).toString();
}
