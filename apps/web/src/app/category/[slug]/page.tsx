import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogProductCard } from "../../../components/CatalogProductCard";
import { SiteHeader } from "../../../components/SiteHeader";
import { getCatalogCards } from "../../../lib/catalog-view";
import { getVisitorKey } from "../../../lib/visitor";
import { STOREFRONT_CATEGORIES, storefrontCategoryBySlug } from "../../../lib/storefront-taxonomy";
import { SiteFooter } from "../../../components/SiteFooter";

type Props = Readonly<{ params: Promise<{ slug: string }> }>;

export function generateStaticParams() {
  return STOREFRONT_CATEGORIES.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = storefrontCategoryBySlug(slug);
  if (!category) return { title: "Κατηγορία" };
  return {
    title: `${category.label} · Buy Local Sparta`,
    description: `${category.description} Ανακάλυψε τοπικά διαθέσιμα προϊόντα στη Σπάρτη.`
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = storefrontCategoryBySlug(slug);
  if (!category) notFound();

  const visitorKey = await getVisitorKey();
  const products = await getCatalogCards(visitorKey, "23100", "", category.slug);
  const siblings = STOREFRONT_CATEGORIES.filter((item) => item.slug !== category.slug);

  return (
    <main>
      <div className="announcement">Ανακάλυψε τη Σπάρτη ανά κατηγορία — με πραγματικούς τοπικούς ανθρώπους.</div>
      <SiteHeader />

      <section className={`category-landing-hero ${category.artClass}`}>
        <div className="shell category-landing-grid">
          <div className="category-landing-copy">
            <div className="eyebrow light">{category.eyebrow}</div>
            <h1>{category.label}</h1>
            <p>{category.description}</p>
            <div className="hero-actions">
              <a className="button button-light" href={`/shop?category=${category.slug}`}>Δες όλα τα προϊόντα</a>
              <a className="button category-outline" href="/ask-local">Ρώτησε τοπικά</a>
            </div>
          </div>
          <div className="category-landing-visual" aria-hidden="true">
            <span className="category-hero-symbol">{category.symbol}</span>
            <span className="category-hero-mark">{category.mark}</span>
            <div className="category-visual-card category-visual-card-a">LOCAL</div>
            <div className="category-visual-card category-visual-card-b">SPARTA</div>
          </div>
        </div>
      </section>

      <section className="shell category-intro-band" aria-label="Πώς λειτουργεί η κατηγορία">
        <div><strong>Μία δημόσια παρουσία ανά προϊόν</strong><span>Δεν βάζουμε τα τοπικά καταστήματα σε δημόσιο πόλεμο τιμών για το ίδιο προϊόν. <a className="text-link" href="/fairness">Δες τους κανόνες →</a></span></div>
        <div><strong>Τοπικός άνθρωπος όταν χρειάζεται</strong><span>Η ανάθεση συμβούλου και συνεργάτη εκπλήρωσης γίνεται με τους κανόνες δικαιοσύνης της πλατφόρμας.</span></div>
        <div><strong>Ένα checkout</strong><span>Συνδύασε προϊόντα από διαφορετικές κατηγορίες και καταστήματα σε μία αγορά.</span></div>
      </section>

      <section className="section section-tint">
        <div className="shell">
          <div className="section-heading">
            <div><div className="eyebrow">Διαθέσιμα τώρα</div><h2>{category.label} στη Σπάρτη</h2></div>
            <p className="section-note">Τα προϊόντα παραμένουν canonical: ένα αποτέλεσμα ανά αντικείμενο, με τον κατάλληλο συνεργάτη στο παρασκήνιο.</p>
          </div>
          {products.length ? (
            <div className="product-grid">
              {products.map((product, index) => <CatalogProductCard product={product} index={index} key={product.id} />)}
            </div>
          ) : (
            <div className="empty-state category-empty-state"><div className="eyebrow">Η κατηγορία χτίζεται</div><h2>Δεν υπάρχουν ακόμη ενεργά προϊόντα εδώ.</h2><p>Η σελίδα είναι έτοιμη για το πραγματικό catalog. Μέχρι τότε, το Ask Local μπορεί να δρομολογήσει ιδιωτικά αυτό που ψάχνεις σε κατάλληλο κατάστημα.</p><a className="button" href="/ask-local">Ask Local</a></div>
          )}
        </div>
      </section>

      <section className="shell section category-discovery">
        <div className="section-heading">
          <div><div className="eyebrow">Συνέχισε την ανακάλυψη</div><h2>Και άλλες πλευρές της τοπικής αγοράς</h2></div>
        </div>
        <div className="category-discovery-grid">
          {siblings.map((item) => (
            <a className={`category-discovery-card ${item.artClass}`} href={`/category/${item.slug}`} key={item.slug}>
              <span className="category-discovery-symbol" aria-hidden="true">{item.symbol}</span>
              <span><strong>{item.label}</strong><small>{item.name}</small></span>
              <span>↗</span>
            </a>
          ))}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
