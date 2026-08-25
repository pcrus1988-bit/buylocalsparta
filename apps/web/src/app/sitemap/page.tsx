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
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../lib/seo-entity-policy";
import { researchVendorIndexEligibility } from "../../lib/seo-visibility-policy";
import { getPublicCmsPages } from "../../lib/public-cms";
import { getAvailableStorefrontCategories } from "../../lib/available-catalog-taxonomy";

export const dynamic = "force-dynamic";
const XML_SITEMAP_PATH = "/sitemap.xml";
const ROBOTS_PATH = "/robots.txt";
const PUBLIC_VENDOR_PROFILE_PREFIX = "/vendor/";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/sitemap", {
    title: "Χάρτης ιστοτόπου",
    description: "Βρες γρήγορα προϊόντα, καταστήματα, υπηρεσίες και βασικές πληροφορίες του ΚΟΝΤΑ ΜΟΥ Sparta. Περιλαμβάνεται και το XML sitemap για Google Search Console."
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
    const defaultVendorPath = `${PUBLIC_VENDOR_PROFILE_PREFIX}${encodeURIComponent(vendor.id)}`;
    return [{
      vendor,
      href: new URL(override?.canonicalPath ?? defaultVendorPath, `${settings.canonicalOrigin}/`).toString(),
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
      <div className="announcement">Χάρτης ιστοτόπου · όλο το ΚΟΝΤΑ ΜΟΥ Sparta σε ένα σημείο.</div>
      <SiteHeader />

      <section className="shell route-map-hero">
        <div className="eyebrow">Χάρτης ιστοτόπου</div>
        <h1>Βρες γρήγορα αυτό που ψάχνεις.</h1>
        <p className="lead">Προϊόντα, τοπικά καταστήματα, συμβουλές, πληροφορίες αγοράς και χρήσιμες σελίδες του ΚΟΝΤΑ ΜΟΥ, οργανωμένα σε μία καθαρή διαδρομή.</p>
        <div className="hero-actions">
          <Link className="button" href="/shop">Δες προϊόντα</Link>
          <Link className="button button-secondary" href="/shops">Δες καταστήματα</Link>
          <a className="button button-secondary" href={XML_SITEMAP_PATH}>XML sitemap</a>
        </div>
      </section>

      <section className="shell route-map-section" aria-labelledby="search-engine-sitemap-title">
        <div className="route-map-split">
          <div>
            <div className="eyebrow">Για επισκέπτες</div>
            <h2 id="search-engine-sitemap-title">Ο ανθρώπινος χάρτης του ΚΟΝΤΑ ΜΟΥ.</h2>
            <p className="lead compact">Οι παρακάτω ενότητες οδηγούν στις βασικές δημόσιες σελίδες. Σελίδες λογαριασμού, διαχείρισης, οδηγών και εσωτερικά εργαλεία δεν προβάλλονται ως δημόσιο περιεχόμενο.</p>
          </div>
          <aside className="route-map-account">
            <div className="eyebrow">Google Search Console</div>
            <h2>XML sitemap</h2>
            <p>Για Google και άλλες μηχανές αναζήτησης χρησιμοποιείται ξεχωριστό XML sitemap. Ενημερώνεται δυναμικά με τις δημόσιες σελίδες, κατηγορίες, προϊόντα και καταστήματα που επιτρέπεται να ευρετηριαστούν.</p>
            <div className="hero-actions">
              <a className="button" href={XML_SITEMAP_PATH}>Άνοιγμα sitemap.xml</a>
              <a className="button button-secondary" href={ROBOTS_PATH}>robots.txt</a>
            </div>
          </aside>
        </div>
      </section>

      <section className="shell route-map-section" aria-label="Δημόσιες διαδρομές">
        <div className="section-heading">
          <div><div className="eyebrow">Κύριες σελίδες</div><h2>Πήγαινε κατευθείαν εκεί που θέλεις.</h2></div>
          <p className="section-note">Οι σύνδεσμοι είναι ομαδοποιημένοι ανά χρήση, ώστε ο χάρτης να παραμένει εύχρηστος ακόμη και όσο μεγαλώνει η πλατφόρμα.</p>
        </div>
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
        <div className="section-heading"><div><div className="eyebrow">Περιεχόμενο · {cmsLinks.length}</div><h2 id="sitemap-cms-title">Δημοσιευμένες ενημερωτικές σελίδες</h2></div><p className="section-note">Εδώ εμφανίζονται οι δημοσιευμένες σελίδες περιεχομένου που είναι διαθέσιμες δημόσια και μπορούν να εμφανιστούν στις μηχανές αναζήτησης.</p></div>
        <div className="route-map-grid">
          {greekCmsLinks.length > 0 && <article className="route-map-card"><div className="eyebrow">Ελληνικά · {greekCmsLinks.length}</div><div className="route-map-links">{greekCmsLinks.map((item) => <a href={item.href} key={item.path}><strong>{item.title}</strong><span>{item.description}</span><i aria-hidden="true">→</i></a>)}</div></article>}
          {englishCmsLinks.length > 0 && <article className="route-map-card"><div className="eyebrow">English · {englishCmsLinks.length}</div><div className="route-map-links">{englishCmsLinks.map((item) => <a href={item.href} key={item.path}><strong>{item.title}</strong><span>{item.description}</span><i aria-hidden="true">→</i></a>)}</div></article>}
        </div>
      </div></section>}

      {availableCategories.length > 0 && <section className="section section-tint">
        <div className="shell route-map-split">
          <div>
            <div className="eyebrow">Κατηγορίες προϊόντων · {availableCategories.length}</div>
            <h2>Μπες κατευθείαν στην κατηγορία.</h2>
            <div className="route-map-category-list">
              {availableCategories.map((category) => <Link href={`/category/${category.slug}`} key={category.slug}>{category.label}<span aria-hidden="true">→</span></Link>)}
            </div>
          </div>
          <aside className="route-map-account">
            <div className="eyebrow">Λογαριασμός πελάτη</div>
            <h2>Σύνδεση ή νέα εγγραφή.</h2>
            <p>Οι προσωπικές σελίδες λογαριασμού δεν ανήκουν στο XML sitemap, αλλά είναι διαθέσιμες εδώ όταν τις χρειάζεσαι.</p>
            <div className="hero-actions">
              {ACCOUNT_UTILITY_NAVIGATION.map((link) => <Link className="button button-secondary" href={link.href} key={link.href}>{link.label}</Link>)}
            </div>
          </aside>
        </div>
      </section>}

      {vendorGroups.length > 0 && <section className="shell route-map-section" aria-labelledby="sitemap-vendors-title">
        <div className="section-heading">
          <div><div className="eyebrow">Τοπικές επιχειρήσεις · {vendorCount}</div><h2 id="sitemap-vendors-title">Καταστήματα που μπορείς να ανακαλύψεις δημόσια</h2></div>
          <p className="section-note">Εμφανίζονται μόνο δημόσιες καταχωρίσεις που πληρούν τα κριτήρια ποιότητας και ευρετηρίασης του ΚΟΝΤΑ ΜΟΥ.</p>
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
