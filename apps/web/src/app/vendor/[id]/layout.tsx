import type { Metadata } from "next";
import type { ReactNode } from "react";
import { VendorSeoVisibilityClaim } from "../../../components/VendorSeoVisibilityClaim";
import { getPublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../../lib/seo-entity-overrides";
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../../lib/seo-entity-policy";
import { getVendorCurrentMonthSeoVisibility } from "../../../lib/seo-vendor-visibility";
import { researchVendorIndexEligibility } from "../../../lib/seo-visibility-policy";

type Props = Readonly<{
  children: ReactNode;
  params: Promise<{ id: string }>;
}>;

/**
 * Search-index governance layer for the existing public /vendor/[id] namespace.
 *
 * Active partner profiles remain indexable. Research profiles are indexable only
 * when they pass the Model C quality gate; lower-quality records may still be
 * human-visible while Google receives an explicit noindex signal.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [vendor, { settings }, overrides] = await Promise.all([
    getPublicVendorDirectoryEntry(id),
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);
  const isResearch = vendor?.directoryStatus === "research";
  const reference: SeoEntityReference = { kind: isResearch ? "research_vendor" : "partner_vendor", id };
  const quality = vendor ? researchVendorIndexEligibility(vendor, { enabled: true, minimumScore: settings.researchVendorMinimumScore }) : undefined;
  const index = resolveSeoEntityControl({
    settings,
    kind: reference.kind,
    entityEligible: Boolean(vendor && (!isResearch || quality?.blockingReasons.length === 0)),
    defaultIndexAllowed: Boolean(vendor && (!isResearch || (settings.researchVendorIndexingEnabled && quality?.eligible))),
    override: findSeoEntityOverride(overrides.entries, reference)
  }).indexAllowed;

  return {
    robots: index
      ? { index: true, follow: true }
      : { index: false, follow: true, noarchive: true, nosnippet: true }
  };
}

export default async function PublicVendorProfileLayout({ children, params }: Props) {
  const { id } = await params;
  const [vendor, visibility] = await Promise.all([
    getPublicVendorDirectoryEntry(id),
    getVendorCurrentMonthSeoVisibility(id)
  ]);

  if (vendor?.directoryStatus === "research" && visibility) {
    return (
      <>
        <VendorSeoVisibilityClaim vendorId={vendor.id} vendorName={vendor.name} visibility={visibility} />
        {children}
      </>
    );
  }

  return children;
}
