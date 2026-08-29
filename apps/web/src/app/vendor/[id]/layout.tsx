import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getPublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../../lib/seo-entity-overrides";
import { absoluteSeoCanonical, findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../../lib/seo-entity-policy";
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
  const [vendor, { settings }, overrides] = await Promise.all([
    getPublicVendorDirectoryEntry(id),
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);
  if (!vendor || vendor.directoryStatus !== "research") return children;

  const reference: SeoEntityReference = { kind: "research_vendor", id: vendor.id };
  const quality = researchVendorIndexEligibility(vendor, { enabled: true, minimumScore: settings.researchVendorMinimumScore });
  const override = findSeoEntityOverride(overrides.entries, reference);
  const seoControl = resolveSeoEntityControl({
    settings,
    kind: reference.kind,
    entityEligible: quality.blockingReasons.length === 0,
    defaultIndexAllowed: settings.researchVendorIndexingEnabled && quality.eligible,
    defaultSchemaAllowed: true,
    override
  });
  const vendorUrl = absoluteSeoCanonical(settings.canonicalOrigin, reference, override);
  const origin = settings.canonicalOrigin.replace(/\/$/, "");
  const businessId = `${vendorUrl}#business`;
  const relationshipStatusId = `${vendorUrl}#kontamou-relationship-status`;
  const relationshipLabel = "Δημόσια καταχώριση · όχι ενεργός συνεργάτης ΚΟΝΤΑ ΜΟΥ";
  const relationshipDescription = "Η σελίδα αποτελεί ενημερωτική καταχώριση τοπικής επιχείρησης. Η επιχείρηση δεν έχει ακόμη ενεργοποιήσει πωλήσεις, Ask Local ή εμπορική συνεργασία μέσω ΚΟΝΤΑ ΜΟΥ.";
  const directoryStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${vendorUrl}#profile-page`,
        url: vendorUrl,
        name: `${vendor.name} · Δημόσια καταχώριση τοπικής επιχείρησης`,
        description: relationshipDescription,
        inLanguage: "el-GR",
        isPartOf: { "@id": `${origin}/#website` },
        publisher: { "@id": `${origin}/#organization` },
        mainEntity: { "@id": businessId },
        about: [{ "@id": businessId }, { "@id": relationshipStatusId }]
      },
      {
        "@type": "DefinedTerm",
        "@id": relationshipStatusId,
        name: relationshipLabel,
        description: relationshipDescription
      }
    ]
  };

  const visibility = await getPublicVendorSearchVisibility(vendor.id);
  const claimHref = `/join/apply?claim=${encodeURIComponent(vendor.id)}`;

  return <>
    {seoControl.schemaAllowed ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(directoryStructuredData).replaceAll("<", "\\u003c") }} /> : null}
    <aside className={styles.claimBar} aria-label="Κατάσταση και διεκδίκηση δημόσιας σελίδας επιχείρησης">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>{relationshipLabel}</span>
          {visibility ? <>
            <strong className={styles.headline}>Η Google ήδη δείχνει τη σελίδα της {vendor.name}: {numberFormat.format(visibility.impressions)} εμφανίσεις αυτόν τον μήνα.</strong>
            <div className={styles.metrics} aria-label={`Οργανική ορατότητα για ${vendor.name}`}>
              <span className={styles.metric}><strong>{numberFormat.format(visibility.impressions)}</strong><small>εμφανίσεις στη Google</small></span>
              <span className={styles.metric}><strong>{numberFormat.format(visibility.clicks)}</strong><small>κλικ από Google</small></span>
              <span className={styles.metric}><strong>{numberFormat.format(visibility.organicSessions)}</strong><small>οργανικές επισκέψεις</small></span>
            </div>
            <span className={styles.detail}>Επαληθευμένα συγκεντρωτικά δεδομένα Google Search Console + GA4 για {formatDate(visibility.startDate)}–{formatDate(visibility.endDate)}. Οι επισκέψεις είναι consent-aware GA4 sessions και μπορεί να είναι χαμηλότερες από τα Search Console clicks. Διεκδικήστε την υπάρχουσα σελίδα ώστε η ορατότητα να συνεχίσει στην ίδια διεύθυνση μετά την ενεργοποίηση.</span>
          </> : <>
            <strong className={styles.headline}>Η {vendor.name} έχει ήδη δημόσια ενημερωτική σελίδα στο ΚΟΝΤΑ ΜΟΥ.</strong>
            <span className={styles.detail}>Η παρουσία εδώ δεν σημαίνει ενεργή συνεργασία ή πωλήσεις μέσω ΚΟΝΤΑ ΜΟΥ. Αν εκπροσωπείτε την επιχείρηση, συνδέστε αυτή την υπάρχουσα σελίδα με την αίτησή σας· η διεύθυνση της σελίδας διατηρείται και μετά την ενεργοποίηση.</span>
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