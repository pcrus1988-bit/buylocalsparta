import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getPublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";
import { vendorIndexEligible } from "../../../lib/seo-visibility-policy";

type Props = Readonly<{
  children: ReactNode;
  params: Promise<{ id: string }>;
}>;

/**
 * Search-index governance layer for the existing public /vendor/[id] namespace.
 *
 * The storefront page itself stays untouched. Active partner profiles remain
 * indexable. Research profiles are indexable only when they pass the Model C
 * quality gate; lower-quality records may still be human-visible in the directory
 * while Google receives an explicit noindex signal.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [vendor, { settings }] = await Promise.all([
    getPublicVendorDirectoryEntry(id),
    getSeoGlobalSettingsSnapshot()
  ]);
  const index = Boolean(settings.indexingEnabled && vendor && vendorIndexEligible(vendor, {
    enabled: settings.researchVendorIndexingEnabled,
    minimumScore: settings.researchVendorMinimumScore
  }));

  return {
    robots: index
      ? { index: true, follow: true }
      : { index: false, follow: true, noarchive: true, nosnippet: true }
  };
}

export default function PublicVendorProfileLayout({ children }: Props) {
  return children;
}
