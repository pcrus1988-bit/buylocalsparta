import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCanonicalProductSummary, getCatalogCard } from "../../../lib/catalog-view";
import { getVisitorKey } from "../../../lib/visitor";
import { AddToCartButton } from "../../../components/AddToCartButton";
import { SiteHeader } from "../../../components/SiteHeader";
import { ProductAccountActions } from "../../../components/ProductAccountActions";
import { storefrontCategoryForCode } from "../../../lib/storefront-taxonomy";
import { publicOrigin } from "../../../lib/public-origin";

type ProductPageProps = Readonly<{ params: Promise<{ id: string }> }>;

const productImageStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  zIndex: 1
} as const;

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getCanonicalProductSummary(id);
  if (!product) return { title: "Προϊόν" };
  const description = `${product.title} στο Buy Local Sparta — τοπική συμβουλή και εκπλήρωση από κατάστημα της Σπάρτης.`;
  return {
    title: product.title,
    description,
    alternates: { canonical: `/product/${encodeURIComponent(product.id)}` },
    openGraph: { title: product.title, description, url: `/product/${encodeURIComponent(product.id)}`, type: "website" }
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const visitorKey = await getVisitorKey();
  const product = await getCatalogCard(id, visitorKey);
  if (!product) notFound();
  const category = storefrontCategoryForCode(product.categoryCode);
  const origin = publicOrigin();
  const productUrl = `${origin}/product/${encodeURIComponent(product.id)}`;
  const categoryUrl = `${origin}/category/${category.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${productUrl}#product`,
        name: product.title,
        sku: product.id,
        image: product.mediaId ? `${origin}/api/media/${encodeURIComponent(product.mediaId)}` : undefined,
        category: category.label,
        offers: {
          "@type": "Offer",
          url: productUrl,
          priceCurrency: "EUR",
          price: (product.priceMinor / 100).toFixed(2),
          availability: product.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          seller: { "@type": "Organization", "@id": `${origin}/#organization`, name: "Buy Local Sparta", url: origin },
          availableAtOrFrom: product.vendorId && product.vendorName ? { "@type": "LocalBusiness", "@id": `${origin}/vendor/${encodeURIComponent(product.vendorId)}#business`, name: product.vendorName, url: `${origin}/vendor/${encodeURIComponent(product.vendorId)}` } : undefined
        }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Αρχική", item: origin },
          { "@type": "ListItem", position: 2, name: category.label, item: categoryUrl },
          { "@type": "ListItem", position: 3, name: product.title, item: productUrl }
        ]
      }
    ]
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }} />
      <div className="announcement">Buy Local. Know Your Vendor. Get Real Advice.</div>
      <SiteHeader compact />

      <section className="shell product-detail">
        <div className={`product-detail-art ${category.artClass}`}>
          <span className="detail-category">{category.name}</span>
          <span className="detail-symbol" aria-hidden="true">{category.symbol}</span>
          {product.mediaId ? <img src={`/api/media/${encodeURIComponent(product.mediaId)}`} alt={product.mediaAlt ?? product.title} decoding="async" style={productImageStyle} /> : null}
          <span className="product-badge">{product.available ? "Διαθέσιμο σήμερα" : "Προσωρινά μη διαθέσιμο"}</span>
        </div>
        <div className="product-detail-copy">
          <div className="eyebrow"><a href={`/category/${category.slug}`}>{category.label}</a> · Διαθέσιμο τοπικά · Sparta 23100</div>
          <h1>{product.title}</h1>
          <div className="detail-price">{product.price}</div>
          <p className="lead compact">Αγοράζεις από το Buy Local Sparta με μία ενιαία εμπειρία checkout. Το τοπικό κατάστημα λειτουργεί ως σύμβουλος και συνεργάτης εκπλήρωσης.</p>
          {product.vendorId && product.vendorName && product.adviser ? <div className="vendor-card"><div><span className="vendor-avatar">{product.adviser.slice(0,1)}</span></div><div><div className="eyebrow">Ο άνθρωπός σου για αυτό το προϊόν</div><strong><a href={`/vendor/${product.vendorId}`}>{product.adviser} · {product.vendorName}</a></strong><p>Ρώτησε για συμβατότητα, χρήση, διαθεσιμότητα ή ποια επιλογή ταιριάζει καλύτερα στις ανάγκες σου.</p><div className="vendor-actions"><a className="button" href="/#ask-local">Ρώτησε μέσω Ask Local</a><a className="button button-secondary" href="/#advice">Πώς λειτουργεί η συμβουλή</a></div></div></div> : <div className="vendor-card"><div><span className="vendor-avatar">?</span></div><div><div className="eyebrow">Προσωρινά χωρίς ανάθεση</div><strong>Δεν υπάρχει επιλέξιμος τοπικός συνεργάτης αυτή τη στιγμή.</strong><p>Μπορείς να χρησιμοποιήσεις το Ask Local για να περιγράψεις τι χρειάζεσαι.</p><div className="vendor-actions"><a className="button" href="/#ask-local">Ask Local</a></div></div></div>}
          <div className="purchase-card"><div><strong>{product.availableToSell} τεμ. διαθέσιμα</strong><span>Παραλαβή από συνεργαζόμενο κατάστημα στη Σπάρτη</span></div><div className="purchase-actions"><AddToCartButton product={product} /><ProductAccountActions productId={product.id} /></div></div>
          <div className="detail-assurances"><div><strong>Ένα προϊόν, μία δημόσια τιμή</strong><span>Δεν εμφανίζουμε παράλληλες ανταγωνιστικές προσφορές για το ίδιο αντικείμενο.</span></div><div><strong>Πραγματική τοπική συμβουλή</strong><span>Μιλάς με επαγγελματία που γνωρίζει το προϊόν και την κατηγορία.</span></div><div><strong>Ένα checkout</strong><span>Ακόμα και όταν το καλάθι σου εξυπηρετείται από περισσότερα τοπικά καταστήματα.</span></div></div>
        </div>
      </section>
    </main>
  );
}
