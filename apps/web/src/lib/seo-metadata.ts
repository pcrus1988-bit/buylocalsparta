import "server-only";

import type { Metadata } from "next";
import type { SeoGlobalSettings } from "./seo-settings";
import { getSeoGlobalSettingsSnapshot, localizeSeoBranding } from "./seo-settings";
import { getSeoEntityOverridesSnapshot } from "./seo-entity-overrides";
import { fitSeoTitleToTemplate } from "./seo-title";
import {
  findSeoEntityOverride,
  resolveSeoEntityControl,
  routeForSeoEntity,
  type SeoEntityOverride,
  type SeoEntityReference
} from "./seo-entity-policy";

export type GovernedSeoMetadataDefaults = Readonly<{
  title?: string;
  description?: string;
  canonicalPath?: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
  openGraphImage?: string;
}>;

function localizeOptionalSeoText(value: string | undefined): string | undefined {
  return value ? localizeSeoBranding(value) : undefined;
}

export function buildGovernedSeoMetadata(input: {
  reference: SeoEntityReference;
  settings: SeoGlobalSettings;
  override?: SeoEntityOverride;
  defaults: GovernedSeoMetadataDefaults;
  entityEligible: boolean;
  defaultIndexAllowed: boolean;
}): Metadata {
  const control = resolveSeoEntityControl({
    settings: input.settings,
    kind: input.reference.kind,
    entityEligible: input.entityEligible,
    defaultIndexAllowed: input.defaultIndexAllowed,
    override: input.override
  });
  const rawTitle = localizeOptionalSeoText(input.override?.title ?? input.defaults.title);
  const title = rawTitle && !input.override?.title
    ? fitSeoTitleToTemplate(rawTitle, input.settings.titleTemplate)
    : rawTitle;
  const description = localizeOptionalSeoText(input.override?.description ?? input.defaults.description);
  const canonical = input.override?.canonicalPath ?? input.defaults.canonicalPath ?? routeForSeoEntity(input.reference);
  const openGraphTitle = localizeOptionalSeoText(input.override?.openGraphTitle ?? input.defaults.openGraphTitle ?? title);
  const openGraphDescription = localizeOptionalSeoText(input.override?.openGraphDescription ?? input.defaults.openGraphDescription ?? description);
  const openGraphImage = input.override?.openGraphImage ?? input.defaults.openGraphImage;
  return {
    title,
    description,
    alternates: { canonical },
    robots: control.indexAllowed
      ? { index: true, follow: true }
      : { index: false, follow: true, noarchive: true, nosnippet: true },
    openGraph: openGraphTitle || openGraphDescription || openGraphImage
      ? {
          title: openGraphTitle,
          description: openGraphDescription,
          url: canonical,
          images: openGraphImage ? [openGraphImage] : undefined,
          type: "website"
        }
      : undefined,
    twitter: openGraphTitle || openGraphDescription || openGraphImage
      ? {
          card: openGraphImage ? "summary_large_image" : "summary",
          title: openGraphTitle,
          description: openGraphDescription,
          images: openGraphImage ? [openGraphImage] : undefined
        }
      : undefined
  };
}

export async function governedStaticSeoMetadata(
  pathname: string,
  defaults: GovernedSeoMetadataDefaults
): Promise<Metadata> {
  const reference: SeoEntityReference = { kind: "static", id: pathname };
  const [{ settings }, overrideSnapshot] = await Promise.all([
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);
  return buildGovernedSeoMetadata({
    reference,
    settings,
    override: findSeoEntityOverride(overrideSnapshot.entries, reference),
    defaults: { ...defaults, canonicalPath: defaults.canonicalPath ?? pathname },
    entityEligible: true,
    defaultIndexAllowed: true
  });
}
