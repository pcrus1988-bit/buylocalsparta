import type { Metadata } from "next";
import Link from "next/link";
import { localePath } from "@buy-local-sparta/core";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { ACCOUNT_UTILITY_NAVIGATION, HUMAN_SITEMAP_SECTIONS } from "../../lib/site-navigation";
import { STOREFRONT_CATEGORIES } from "../../lib/storefront-taxonomy";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { getPublicVendorDirectory, type PublicVendorDirectoryEntry } from "../../lib/public-vendor-directory";
import { getSeoGlobalSettingsSnapshot } from "../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../lib/seo-entity-overrides";
import { absoluteSeoCanonical, findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../lib/seo-entity-policy";
import { researchVendorIndexEligibility } from "../../lib/seo-visibility-policy";
import { getPublicCmsPages } from "../../lib/public-cms";
import { getAvailableStorefrontCategories } from "../../lib/available-catalog-taxonomy";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/sitemap", {
    title: "Χάρτης ιστοτόπου",
    description: "Οι πραγματικές δημόσιες διαδρομές του ΚΟΝΤΑ ΜΟΥ Sparta, οργανωμένες χωρίς διπλές ή παραπλανητικές επιλογές."
  });
}

type VendorGroup = Readonly<{
  slug: string;
  label: string;
  vendors: readonly Readonly<{ vendor: PublicVendorDirectoryEntry; href: string }>[];
}>;

type CmsLink = Readonly<{
  path: string;
  href: string;
  title: string;
  description: string;
  locale: "el" | "en";
}>;

async function governedVendorGroups(): Promise<readonly VendorGroup[]> {
  const [[vendorResult], { settings }, overrides] = await Promise.all([
    Promise.allSettled([getPublicVendorDirectory()]),
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);
  if (vendorResult.status !== "fulfilled" || !settings.indexingEnabled) return [];

  const admitted = vendorResult.value.flatMap((vendor) => {
    const isPartner = vendor.directoryStatus === "partner";
    const reference: SeoEntityReference = { kind: isPartner ? "partner_vendor" : "research_vendor", id: vendor.id };
    const quality = researchVendorIndexEligibility(vendor, { enabled: true, minimumScore: settings.researchVendorMinimumScore });
    const override = findSeoEntityOverride(overrides.entries, reference);
    const control = resolveSeoEntityControl({
      settings,
      kind: reference.kind,
      entityEligible: isPartner || quality.blockingReasons.length === 0,
      defaultIndexAllowed: isPartner || (settings.researchVendorIndexingEnabled && quality.eligible),
      override
    });
    if (!control.sitemapAllowed) return [];
    const taxonomy = vendor.taxonomies[0];
    return [{
      vendor,
      // The default public vendor route family remains /vendor/[id]. Keep canonical
      // overrides in the shared resolver so the human and XML sitemaps cannot diverge.
      href: absoluteSeoCanonical(settings.canonicalOrigin, reference, override),
      groupSlug: taxonomy?.categorySlug ?? "other",
      groupLabel: taxonomy?.categoryLabel ?? "Άλλες τοπικές επιχειρήσεις"
    }];
  });

  const byGroup = new Map<string, { label: string; vendors: { vendor: PublicVendorDirectoryEntry; href: string }[] }>();
  for (const item of admitted) {
    const existing = byGroup.get(item.groupSlug);
    if (existing) existing.vendors.push({ vendor: item.vendor, href: item.href });
    else byGroup.set(item.groupSlug, { label: item.groupLabel, vendors: [{ vendor: item.vendor, href: item.href }] });
  }
  const order = new Map(STOREFRONT_CATEGORIES.map((category, index) => [category.slug, index]));
  return [...byGroup.entries()]
    .map(([slug, group]) => ({
      slug,
      label: group.label,
      vendors: group.vendors.sort((a, b) => Number(b.vendor.directoryStatus === "partner") - Number(a.vendor.directoryStatus === "partner") || a.vendor.name.localeCompare(b.vendor.name, "el"))
    }))
    .sort((a, b) => (order.get(a.slug) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.slug) ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label, "el"));
}

async function governedCmsLinks(): Promise<readonly CmsLink[]> {
  const [pages, { settings }, overrides] = await Promise.all([
    getPublicCmsPages(),
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);
  if (!settings.indexingEnabled) return [];
  const links: CmsLink[] = [];
  for (const page of pages) {
    for (const locale of ["el", "en"] as const) {
      const translation = page.translations[locale];
      if (!translation || translation.seo.noindex) continue;
      const path = localePath(locale, page.slug);
      const reference: SeoEntityReference = { kind: "static", id: path };
      const override = findSeoEntityOverride(overrides.entries, reference);
      const control = resolveSeoEntityControl({ settings, kind: reference.kind, entityEligible: true, defaultIndexAllowed: true, override });
      if (!control.sitemapAllowed) continue;
      links.push({
        path,
        href: new URL(override?.canonicalPath ?? path, `${settings.canonicalOrigin}/`).toString(),
        title: translation.title,
        description: translation.seo.description,
        locale
      });
    }
  }
  return links.sort((a, b) => a.locale.localeCompare(b.locale) || a.title.localeCompare(b.title, a.locale === "el" ? "el" : "en"));
}

export default async function HumanSitemapPage() {
  const [vendorGroups, cmsLinks, availableCategories] = await Promise.all([
    governedVendorGroups(),
    governedCmsLinks(),
    getAvailableStorefrontCategories("23100")
  ]);
  const vendorCount = vendorGroups.reduce((sum, group) => sum + group.vendors.length, 0);
  const greekCmsLinks = cmsLinks.filter((item) => item.locale === "el");
  const englishCmsLinks = cmsLinks.filter((item) => item.locale === "en");

  return (
    <main>
      <div className="announcement">Χάρτης ιστοτόπου · οι πραγματικές δημόσιες διαδρομές του ΚΟΝΤΑ ΜΟΥ Sparta σε ένα σημείο.</div>
      <SiteHeader />

      <section className="shell route-map-hero">
        <div className="eyebrow">Clear navigation</div>
        <h1>Βρες ακριβώς τη διαδρομή που χρειάζεσαι.</h1>
        <p className="lead">Ο χάρτης περιλαμβάνει μόνο σελίδες και ροές που υπάρχουν πραγματικά. Τα ιδιωτικά dashboard και τα τεχνικά API δεν παρουσιάζονται ως δημόσιο περιεχόμενο.</p>
      </section>

      <section className="shell route-map-section" aria-label="Δημόσιες διαδρομές">
        <div className="route-map-grid">
          {HUMAN_SITEMAP_SECTIONS.map((section) => (
            <article className="route-map-card" key={section.title}>
              <div className="eyebrow">{section.title}</div>
              <div className="route-map-links">
                {section.links.map((link) => (
                  <Link href={link.href} key={link.href}>
                    <strong>{link.label}</strong>
                    {link.description && <span>{link.description}</span>}
                    <i aria-hidden="true">→</i>
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {cmsLinks.length > 0 && <section className="section section-tint" aria-labelledby="sitemap-cms-title"><div className="shell route-map-section">
        <div className="section-heading"><div><div className="eyebrow">CMS · {cmsLinks.length}</div><h2 id="sitemap-cms-title">Δημοσιευμένες σελίδες περιεχομένου</h2></div><p className="section-note">Εμφανίζονται μόνο δημοσιευμένες, index-eligible μεταφράσεις που περνούν τους ίδιους κανόνες visibility και canonical governance με το XML sitemap.</p></div>
        <div className="route-map-grid">
          {greekCmsLinks.length > 0 && <article className="route-map-card"><div className="eyebrow">Ελληνικά · {greekCmsLinks.length}</div><div className="route-map-links">{greekCmsLinks.map((item) => <a href={item.href} key={item.path}><strong>{item.title}</strong><span>{item.description}</span><i aria-hidden="true">→</i></a>)}</div></article>}
          {englishCmsLinks.length > 0 && <article className="route-map-card"><div className="eyebrow">English · {englishCmsLinks.length}</div><div className="route-map-links">{englishCmsLinks.map((item) => <a href={item.href} key={item.path}><strong>{item.title}</strong><span>{item.description}</span><i aria-hidden="true">→</i></a>)}</div></article>}
        </div>
      </div></section>}

      {availableCategories.length > 0 && <section className="section section-tint">
        <div className="shell route-map-split">
          <div>
            <div className="eyebrow">Κατηγορίες προϊόντων</div>
            <h2>Μπες κατευθείαν στην κατηγορία.</h2>
            <div className="route-map-category-list">
              {availableCategories.map((category) => <Link href={`/category/${category.slug}`} key={category.slug}>{category.label}<span aria-hidden="true">→</span></Link>)}
            </div>
          </div>
          <aside className="route-map-account">
            <div className="eyebrow">Λογαριασμός πελάτη</div>
            <h2>Σύνδεση ή νέα εγγραφή.</h2>
            <p>Οι σελίδες λογαριασμού δεν μπαίνουν στο XML sitemap, αλλά παραμένουν σαφείς και προσβάσιμες όταν τις χρειάζεσαι.</p>
            <div className="hero-actions">
              {ACCOUNT_UTILITY_NAVIGATION.map((link) => <Link className="button button-secondary" href={link.href} key={link.href}>{link.label}</Link>)}
            </div>
          </aside>
        </div>
      </section>}

      {vendorGroups.length > 0 && <section className="shell route-map-section" aria-labelledby="sitemap-vendors-title">
        <div className="section-heading">
          <div><div className="eyebrow">Τοπικές επιχειρήσεις · {vendorCount}</div><h2 id="sitemap-vendors-title">Δημόσια καταστήματα με δικαίωμα ευρετηρίασης</h2></div>
          <p className="section-note">Η λίστα ακολουθεί ακριβώς τους ίδιους κανόνες quality, index και sitemap governance με το XML sitemap. Research καταχωρίσεις χαμηλής ποιότητας ή σε noindex κατάσταση δεν εμφανίζονται εδώ.</p>
        </div>
        <div className="route-map-grid">
          {vendorGroups.map((group) => <article className="route-map-card" key={group.slug}>
            <div className="eyebrow">{group.label} · {group.vendors.length}</div>
            <div className="route-map-links">
              {group.vendors.map(({ vendor, href }) => <a href={href} key={vendor.id}>
                <strong>{vendor.name}</strong>
                <span>{vendor.directoryStatus === "partner" ? "Ενεργός συνεργάτης ΚΟΝΤΑ ΜΟΥ" : "Χαρτογραφημένη τοπική επιχείρηση"}{vendor.location?.locality ? ` · ${vendor.location.locality}` : ""}</span>
                <i aria-hidden="true">→</i>
              </a>)}
            </div>
          </article>)}
        </div>
      </section>}

      <SiteFooter />
    </main>
  );
}
