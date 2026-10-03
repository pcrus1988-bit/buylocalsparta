import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogProductCard } from "../../../components/CatalogProductCard";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { getPublicBrandGuide } from "../../../lib/brand-guide-runtime";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";
import styles from "./page.module.css";

type Props = Readonly<{ params: Promise<{ slug: string }> }>;

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  // Brand guides are numerous; cache each guide on first request instead of
  // querying hundreds of brand records during every deployment build.
  return [];
}

function host(value: string): string {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value; }
}

function jsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getPublicBrandGuide(slug);
  if (!brand) return { title: "Brand | ΚΟΝΤΑ ΜΟΥ", robots: { index: false, follow: true } };

  const description = brand.description
    ?? `Ανακάλυψε ${brand.name} στο ΚΟΝΤΑ ΜΟΥ: κατηγορίες και ${brand.liveProductCount.toLocaleString("el-GR")} διαθέσιμα προϊόντα.`;

  return {
    title: `${brand.name} — Brand Guide & διαθέσιμα προϊόντα`,
    description: description.slice(0, 160),
    alternates: { canonical: `/brands/${brand.slug}` },
    robots: { index: brand.indexable, follow: true },
    openGraph: {
      title: `${brand.name} | ΚΟΝΤΑ ΜΟΥ`,
      description: description.slice(0, 180),
      url: `/brands/${brand.slug}`
    }
  };
}

export default async function BrandGuidePage({ params }: Props) {
  const { slug } = await params;
  const brand = await getPublicBrandGuide(slug);
  if (!brand) notFound();

  const { settings } = await getSeoGlobalSettingsSnapshot();
  const canonicalUrl = new URL(`/brands/${brand.slug}`, `${settings.canonicalOrigin}/`).toString();
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Αρχική", item: settings.canonicalOrigin },
      { "@type": "ListItem", position: 2, name: "Brands", item: new URL("/brands", `${settings.canonicalOrigin}/`).toString() },
      { "@type": "ListItem", position: 3, name: brand.name, item: canonicalUrl }
    ]
  };
  const brandStructuredData = {
    "@context": "https://schema.org",
    "@type": "Brand",
    name: brand.name,
    url: canonicalUrl,
    ...(brand.logoUrl ? { logo: brand.logoUrl } : {}),
    ...(brand.description ? { description: brand.description } : {}),
    ...(brand.website ? { sameAs: brand.website } : {})
  };

  const countryName = brand.countryCode
    ? new Intl.DisplayNames(["el"], { type: "region" }).of(brand.countryCode.toUpperCase()) ?? brand.countryCode
    : undefined;

  const tags = [
    ...brand.guide.knownFor,
    ...brand.guide.styleTags,
    ...brand.guide.productFamilies
  ].filter((value, index, all) => all.indexOf(value) === index).slice(0, 8);

  return <main className={styles.page}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(brandStructuredData) }} />
    <SiteHeader />

    <div className="shell">
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <Link href="/">Αρχική</Link> · <Link href="/brands">Brands</Link> · <span>{brand.name}</span>
      </nav>

      <section className={styles.hero}>
        <div>
          {brand.logoUrl ? <div className={styles.logoBox}>
            <img src={brand.logoUrl} alt={`Λογότυπο ${brand.name}`} decoding="async" />
          </div> : null}
          <div className="eyebrow">KONTA MOU · Brand Guide</div>
          <h1 className={styles.brandName}>{brand.name}</h1>
          {brand.description ? <p className={styles.intro}>{brand.description}</p> : <p className={styles.intro}>Ανακάλυψε τις κατηγορίες και τα προϊόντα {brand.name} που είναι διαθέσιμα τώρα στο ΚΟΝΤΑ ΜΟΥ.</p>}
          {tags.length ? <div className={styles.dna} aria-label="Brand DNA">
            {tags.map((tag) => <span className={styles.tag} key={tag}>{tag}</span>)}
          </div> : null}
        </div>

        <aside className={styles.heroAside}>
          <div className={styles.stat}><strong>{brand.liveProductCount.toLocaleString("el-GR")}</strong><span>διαθέσιμα προϊόντα τώρα</span></div>
          <div className={styles.stat}><strong>{brand.categories.length.toLocaleString("el-GR")}</strong><span>ενεργές κατηγορίες</span></div>
          {brand.guide.foundedYear ? <div className={styles.stat}><strong>{brand.guide.foundedYear}</strong><span>έτος ίδρυσης</span></div> : null}
        </aside>
      </section>


      {brand.guide.whyItStandsOut ? <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><div className="eyebrow">Γιατί ξεχωρίζει</div><h2>Η ταυτότητα του {brand.name}</h2></div>
          <p className={styles.copy}>{brand.guide.whyItStandsOut}</p>
        </div>
      </section> : null}

      {brand.departments.length ? <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><div className="eyebrow">Ο χάρτης του brand</div><h2>Πού συναντάς το {brand.name}.</h2></div>
          <p className={styles.copy}>Αντί για μία επίπεδη λίστα προϊόντων, ξεκίνα από τον τομέα που σε ενδιαφέρει. Οι διαδρομές παρακάτω δημιουργούνται από τη σημερινή πραγματική διαθεσιμότητα του brand.</p>
        </div>
        <div className={styles.departmentGrid}>
          {brand.departments.map((department) => <Link className={styles.departmentCard} href={department.href} key={department.slug}>
            <span>ΤΟΜΕΑΣ</span>
            <strong>{department.label}</strong>
            <small>{department.productCount.toLocaleString("el-GR")} προϊόντα · {department.categoryCount.toLocaleString("el-GR")} {department.categoryCount === 1 ? "κατηγορία" : "κατηγορίες"} →</small>
          </Link>)}
        </div>
      </section> : null}

      {brand.categories.length ? <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><div className="eyebrow">Πιο συγκεκριμένα</div><h2>Κατηγορίες {brand.name}</h2></div>
          <p className={styles.copy}>Οι ενότητες δεν είναι στατικές SEO κατηγορίες. Προκύπτουν από τα πραγματικά προϊόντα {brand.name} που είναι αυτή τη στιγμή διαθέσιμα στο ΚΟΝΤΑ ΜΟΥ.</p>
        </div>
        <div className={styles.categoryGrid}>
          {brand.categories.map((category) => <Link className={styles.categoryCard} href={category.href} key={category.code}>
            <small>{category.departmentLabel}</small>
            <strong>{category.label}</strong>
            <span>{category.productCount.toLocaleString("el-GR")} διαθέσιμα →</span>
          </Link>)}
        </div>
      </section> : null}

      {brand.products.length ? <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><div className="eyebrow">Διαθέσιμα τώρα</div><h2>Επιλογές {brand.name}</h2></div>
          <p className={styles.copy}>Μικρό δείγμα από την τρέχουσα εμπορική διαθεσιμότητα. Η πλήρης λίστα παραμένει στο marketplace ώστε τιμές και απόθεμα να ακολουθούν τους ίδιους κανόνες με το υπόλοιπο ΚΟΝΤΑ ΜΟΥ.</p>
        </div>
        <div className={styles.productGrid}>
          {brand.products.map((product, index) => <CatalogProductCard product={product} index={index} key={product.id} />)}
        </div>
        <div className={styles.ctaRow}>
          <Link className="button" href={brand.shopHref}>Όλα τα προϊόντα {brand.name} →</Link>
        </div>
      </section> : null}

      {brand.relatedBrands.length ? <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><div className="eyebrow">Συνέχισε την ανακάλυψη</div><h2>Brands με κοινό έδαφος.</h2></div>
          <p className={styles.copy}>Αυτές οι προτάσεις δεν είναι πληρωμένη κατάταξη. Βασίζονται στις ενεργές κατηγορίες που μοιράζονται με το {brand.name} και στην τρέχουσα διαθεσιμότητα του καταλόγου.</p>
        </div>
        <div className={styles.relatedGrid}>
          {brand.relatedBrands.map((related) => <Link className={styles.relatedCard} href={`/brands/${related.slug}`} key={related.id}>
            <div className={styles.relatedLogo}>
              {related.logoUrl ? <img src={related.logoUrl} alt="" loading="lazy" decoding="async" /> : <span>{related.name}</span>}
            </div>
            <div>
              <strong>{related.name}</strong>
              <span>{related.sharedCategoryCount.toLocaleString("el-GR")} κοινές {related.sharedCategoryCount === 1 ? "κατηγορία" : "κατηγορίες"} · {related.liveProductCount.toLocaleString("el-GR")} διαθέσιμα</span>
            </div>
          </Link>)}
        </div>
      </section> : null}

      {(brand.guide.brandStory || brand.guide.parentCompany || brand.countryCode || brand.guide.pricePosition) ? <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><div className="eyebrow">Brand story</div><h2>Γνώρισε το brand.</h2></div>
          {brand.guide.brandStory ? <p className={styles.copy}>{brand.guide.brandStory}</p> : <div />}
        </div>
        <div className={styles.facts}>
          {countryName ? <div className={styles.fact}><span>Χώρα</span><strong>{countryName}</strong></div> : null}
          {brand.guide.parentCompany ? <div className={styles.fact}><span>Όμιλος / μητρική εταιρεία</span><strong>{brand.guide.parentCompany}</strong></div> : null}
          {brand.guide.pricePosition ? <div className={styles.fact}><span>Positioning</span><strong>{brand.guide.pricePosition}</strong></div> : null}
        </div>
      </section> : null}

      {(brand.website || brand.guide.sourceUrls.length) ? <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><div className="eyebrow">Πηγές</div><h2>Επαληθευμένες πληροφορίες.</h2></div>
          <div>
            {brand.website ? <p className={styles.copy}>Επίσημο website: <a href={brand.website} target="_blank" rel="noreferrer">{host(brand.website)} ↗</a></p> : null}
            {brand.guide.sourceUrls.length ? <ul className={styles.sources}>
              {brand.guide.sourceUrls.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label ?? host(source.url)} ↗</a></li>)}
            </ul> : null}
          </div>
        </div>
      </section> : null}
    </div>
    <SiteFooter />
  </main>;
}
