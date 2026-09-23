import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { VendorAskLocalPanel } from "../../../components/VendorAskLocalPanel";
import { VendorCatalogBrowser } from "../../../components/VendorCatalogBrowser";
import storefrontStyles from "../../../components/VendorStorefront.module.css";
import { getAccountSession } from "../../../lib/account-session";
import { getPublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../../lib/seo-entity-overrides";
import { findSeoEntityOverride, type SeoEntityReference } from "../../../lib/seo-entity-policy";
import { buildGovernedSeoMetadata } from "../../../lib/seo-metadata";
import { researchVendorIndexEligibility } from "../../../lib/seo-visibility-policy";
import styles from "./page.module.css";

const VENDOR_ID = "vendor_e8cb57b3c67b469d9a9d";
const DISPLAY_NAME = "SP BUSINESS LAB";
const SPECIAL_DESCRIPTION =
  "Luxury items, αγαπημένα designer brands και haute couture. Κοντά σου — μέσα από μια επιλεγμένη premium συλλογή στο ΚΟΝΤΑ ΜΟΥ.";

export const dynamic = "force-dynamic";

const getCachedPublicVendorDirectoryEntry = cache((id: string) => getPublicVendorDirectoryEntry(id));
const getCachedSeoGlobalSettingsSnapshot = cache(() => getSeoGlobalSettingsSnapshot());
const getCachedSeoEntityOverridesSnapshot = cache(() => getSeoEntityOverridesSnapshot());

export async function generateMetadata(): Promise<Metadata> {
  const [vendor, { settings }, overrides] = await Promise.all([
    getCachedPublicVendorDirectoryEntry(VENDOR_ID),
    getCachedSeoGlobalSettingsSnapshot(),
    getCachedSeoEntityOverridesSnapshot()
  ]);

  if (!vendor) {
    return {
      title: DISPLAY_NAME,
      description: SPECIAL_DESCRIPTION
    };
  }

  const isResearch = vendor.directoryStatus === "research";
  const reference: SeoEntityReference = {
    kind: isResearch ? "research_vendor" : "partner_vendor",
    id: vendor.id
  };
  const quality = researchVendorIndexEligibility(vendor, {
    enabled: true,
    minimumScore: settings.researchVendorMinimumScore
  });

  return buildGovernedSeoMetadata({
    reference,
    settings,
    override: findSeoEntityOverride(overrides.entries, reference),
    defaults: {
      title: `${DISPLAY_NAME} · Luxury, Designer Brands & Haute Couture`,
      description: SPECIAL_DESCRIPTION,
      canonicalPath: `/vendor/${VENDOR_ID}`,
      openGraphTitle: DISPLAY_NAME,
      openGraphDescription: SPECIAL_DESCRIPTION,
      keywords: [
        DISPLAY_NAME,
        "luxury items",
        "designer brands",
        "haute couture",
        "premium fashion",
        "ΚΟΝΤΑ ΜΟΥ"
      ]
    },
    entityEligible: !isResearch || quality.blockingReasons.length === 0,
    defaultIndexAllowed: !isResearch || (settings.researchVendorIndexingEnabled && quality.eligible)
  });
}

export default async function SpBusinessLabStorefront() {
  const vendor = await getCachedPublicVendorDirectoryEntry(VENDOR_ID);
  if (!vendor) notFound();

  const isResearch = vendor.directoryStatus === "research";
  // The catalogue browser fetches a bounded 20-item page after hydration. Do not
  // run the same supplier-catalogue query during SSR: this storefront can contain
  // tens of thousands of supplier families, and the duplicate cold-start query
  // was competing for production DB connections before the client request.
  const principal = isResearch ? undefined : await getAccountSession();
  const products = [] as const;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `https://kontamou.site/vendor/${VENDOR_ID}#store`,
    name: DISPLAY_NAME,
    url: `https://kontamou.site/vendor/${VENDOR_ID}`,
    description: SPECIAL_DESCRIPTION
  };

  return (
    <main className={`${storefrontStyles.page} ${styles.page}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c")
        }}
      />

      <div className="announcement">Luxury · Designer Brands · Haute Couture · Κοντά σου.</div>
      <SiteHeader />

      <section className={styles.hero} aria-labelledby="sp-business-lab-title">
        <div className="shell">
          <a className={styles.backLink} href="/shops">← Όλα τα καταστήματα</a>

          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <div className={styles.kicker}>LUXURY · ICONIC BRANDS · HAUTE COUTURE</div>
              <h1 id="sp-business-lab-title">{DISPLAY_NAME}</h1>
              <p className={styles.lead}>
                Luxury items, αγαπημένα brands και haute couture. <strong>Κοντά σου.</strong>
              </p>
              <p className={styles.support}>
                Μια επιλεγμένη συλλογή από premium μόδα, αξεσουάρ και designer κομμάτια από
                αναγνωρισμένους οίκους — με την απλότητα, την αναζήτηση και την εξυπηρέτηση του ΚΟΝΤΑ ΜΟΥ.
              </p>

              <div className={styles.tags} aria-label="Χαρακτηριστικά συλλογής">
                <span>Luxury items</span>
                <span>Popular brands</span>
                <span>Designer fashion</span>
                <span>Haute couture</span>
              </div>

              <div className={styles.actions}>
                <a className="button" href={`/fitting-room?vendor=${encodeURIComponent(VENDOR_ID)}`}>Μπες στο Fitting Room</a>
                <a className="button button-secondary" href="#products">Δες τη συλλογή</a>
                <a className="button button-secondary" href="#ask-local">Ρώτησε το κατάστημα</a>
              </div>
            </div>

            <div className={styles.editorialPanel} aria-hidden="true">
              <div className={styles.editorialTop}>
                <span>CURATED</span>
                <span>PREMIUM</span>
              </div>
              <div className={styles.editorialCenter}>
                <span>LUXURY</span>
                <span>ICONS</span>
                <span>COUTURE</span>
              </div>
              <div className={styles.editorialBottom}>
                <span>KONTA MOY</span>
                <strong>ΚΟΝΤΑ ΣΟΥ.</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={storefrontStyles.catalogSection} id="products" aria-labelledby="vendor-products-title">
        <div className="shell">
          <div className={storefrontStyles.sectionHeader}>
            <div>
              <div className="eyebrow">THE COLLECTION</div>
              <h2 id="vendor-products-title">Η συλλογή του {DISPLAY_NAME}</h2>
            </div>
            <p className={storefrontStyles.sectionLead}>
              Αναζήτησε τη συλλογή και φιλτράρισε ανά κατηγορία, brand, χρώμα ή διαθεσιμότητα.
            </p>
          </div>

          {isResearch ? (
            <div className={storefrontStyles.researchNotice}>
              <strong>Ο κατάλογος δεν είναι ακόμη ενεργός.</strong>
            </div>
          ) : (
            <VendorCatalogBrowser
              products={products}
              vendor={{ name: DISPLAY_NAME, adviser: vendor.adviser }}
              vendorId={vendor.id}
            />
          )}
        </div>
      </section>

      <section className={storefrontStyles.askSection} id="ask-local" aria-labelledby="vendor-ask-title">
        <div className="shell">
          <div className={storefrontStyles.askPanel}>
            <div className={storefrontStyles.askCopy}>
              <div className="eyebrow">ASK LOCAL · {DISPLAY_NAME}</div>
              <h2 id="vendor-ask-title">Ψάχνεις κάτι συγκεκριμένο;</h2>
              <p>
                Ρώτησε απευθείας το {DISPLAY_NAME} για brand, μέγεθος, χρώμα ή συγκεκριμένο designer κομμάτι.
              </p>
              <span className={storefrontStyles.askVendorBadge}>Δρομολόγηση → {DISPLAY_NAME}</span>
            </div>

            {isResearch ? (
              <div className={storefrontStyles.askLoginCard}>
                <h3>Ask Local</h3>
                <p>Η δυνατότητα θα ενεργοποιηθεί με την ενεργοποίηση του καταστήματος.</p>
              </div>
            ) : (
              <VendorAskLocalPanel
                vendorId={vendor.id}
                vendorName={DISPLAY_NAME}
                csrfToken={principal?.csrfToken}
              />
            )}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
