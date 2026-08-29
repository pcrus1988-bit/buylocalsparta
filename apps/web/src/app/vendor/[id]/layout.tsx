import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getPublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../../lib/seo-entity-overrides";
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../../lib/seo-entity-policy";
import { getPublicVendorSearchVisibility } from "../../../lib/seo-public-visibility";
import { researchVendorIndexEligibility } from "../../../lib/seo-visibility-policy";
import styles from "./claim.module.css";

type Props = Readonly<{
  children: ReactNode;
  params: Promise<{ id: string }>;
}>;

const numberFormat = new Intl.NumberFormat("el-GR");
const dateFormat = new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

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
  const vendor = await getPublicVendorDirectoryEntry(id);
  if (!vendor || vendor.directoryStatus !== "research") return children;

  const visibility = await getPublicVendorSearchVisibility(vendor.id);
  const claimHref = `/join/apply?claim=${encodeURIComponent(vendor.id)}`;

  return <>
    <aside className={styles.claimBar} aria-label="Διεκδίκηση σελίδας επιχείρησης">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>Είναι η επιχείρησή σας;</span>
          {visibility ? <>
            <strong className={styles.headline}>Η σελίδα της {vendor.name} εμφανίστηκε {numberFormat.format(visibility.impressions)} φορές στα αποτελέσματα Google και έλαβε {numberFormat.format(visibility.clicks)} κλικ.</strong>
            <span className={styles.detail}>Επαληθευμένα συγκεντρωτικά δεδομένα Search Console για {formatDate(visibility.startDate)}–{formatDate(visibility.endDate)}. Διεκδικήστε την υπάρχουσα σελίδα ώστε η ορατότητα να συνεχίσει στην ίδια διεύθυνση.</span>
          </> : <>
            <strong className={styles.headline}>Η {vendor.name} έχει ήδη δημόσια σελίδα στο ΚΟΝΤΑ ΜΟΥ.</strong>
            <span className={styles.detail}>Αν εκπροσωπείτε την επιχείρηση, συνδέστε αυτή την υπάρχουσα σελίδα με την αίτησή σας. Η διεύθυνση της σελίδας διατηρείται και μετά την ενεργοποίηση.</span>
          </>}
        </div>
        <div className={styles.actions}>
          <a className={styles.primary} href={claimHref}>Διεκδίκηση σελίδας</a>
          <a className={styles.secondary} href="/join">Πώς λειτουργεί</a>
        </div>
      </div>
    </aside>
    {children}
  </>;
}

function formatDate(value: string): string {
  return dateFormat.format(new Date(`${value}T00:00:00Z`));
}
