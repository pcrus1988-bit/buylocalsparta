import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCanonicalProductSummary, getCatalogCard } from "../../../lib/catalog-view";
import { getVisitorKey } from "../../../lib/visitor";
import { AddToCartButton } from "../../../components/AddToCartButton";
import { SiteHeader } from "../../../components/SiteHeader";
import { ProductAccountActions } from "../../../components/ProductAccountActions";
import { storefrontCategoryForCode } from "../../../lib/storefront-taxonomy";
import { publicOrigin } from "../../../lib/public-origin";
import { SiteFooter } from "../../../components/SiteFooter";

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
  const description = `${product.title} στο Buy Local Sparta — τοπική διαθεσιμότητα, πραγματική συμβουλή και μία καθαρή εμπειρία αγοράς.`;
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
        "@type": "Organization",
        "@id": `${origin}#organization`,
        name: "Buy Local Sparta",
        url: origin
      },
      {
        "@type": "Product",
        "@id": `${productUrl}#product`,
        name: product.title,
        description: product.description,
        sku: product.mpn ?? product.id,
        mpn: product.mpn,
        brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
        image: product.mediaId ? `${origin}/api/media/${encodeURIComponent(product.mediaId)}` : undefined,
        category: product.categoryLabel ?? category.label,
        color: product.color,
        offers: {
          "@type": "Offer",
          url: productUrl,
          priceCurrency: "EUR",
          price: (product.priceMinor / 100).toFixed(2),
          availability: product.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          seller: product.vendorId && product.vendorName ? { "@type": "LocalBusiness", "@id": `${origin}/vendor/${encodeURIComponent(product.vendorId)}#business`, name: product.vendorName, url: `${origin}/vendor/${encodeURIComponent(product.vendorId)}` } : undefined,
          availableAtOrFrom: product.vendorId && product.vendorName ? { "@type": "LocalBusiness", "@id": `${origin}/vendor/${encodeURIComponent(product.vendorId)}#business`, name: product.vendorName, url: `${origin}/vendor/${encodeURIComponent(product.vendorId)}` } : undefined
        }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Αρχική", item: origin },
          { "@type": "ListItem", position: 2, name: category.label, item: categoryUrl },
          { "@type": "ListItem", position: 3, name: product.categoryLabel ?? category.label, item: `${origin}/shop?category=${encodeURIComponent(category.slug)}&subcategory=${encodeURIComponent(product.categoryCode)}` },
          { "@type": "ListItem", position: 4, name: product.title, item: productUrl }
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
          <div className="eyebrow"><a href={`/shop?category=${category.slug}`}>{category.label}</a>{product.categoryLabel ? <> · <a href={`/shop?category=${category.slug}&subcategory=${encodeURIComponent(product.categoryCode)}`}>{product.categoryLabel}</a></> : null} · Sparta 23100</div>
          <h1>{product.title}</h1>
          <div className="detail-price">{product.price}</div>
          <p className="lead compact">{product.available ? "Η τιμή και η διαθεσιμότητα προέρχονται από το επιλεγμένο τοπικό offer. Το Buy Local δεν προσθέτει προσαύξηση στην τιμή προϊόντος." : "Ενδεικτική τιμή καταλόγου από την τελευταία καταγεγραμμένη πηγή. Η αγορά θα ενεργοποιηθεί μόνο όταν υπάρχει εγκεκριμένο τοπικό offer με επιβεβαιωμένο stock."}</p>

          {product.description ? <div className="vendor-card"><div><span className="vendor-avatar">i</span></div><div><div className="eyebrow">Περιγραφή προϊόντος</div><p>{product.description}</p></div></div> : null}

          <div className="eyebrow">Χαρακτηριστικά</div>
          <div className="detail-assurances">
            {product.brand ? <div><strong>Μάρκα</strong><span>{product.brand}</span></div> : null}
            {product.mpn ? <div><strong>Κωδικός προϊόντος</strong><span>{product.mpn}</span></div> : null}
            {product.categoryLabel ? <div><strong>Κατηγορία</strong><span>{product.categoryLabel}</span></div> : null}
            {product.color ? <div><strong>Χρώμα</strong><span>{product.color}</span></div> : null}
            {product.sizes.length ? <div><strong>Μεγέθη</strong><span>{product.sizes.join(" · ")}</span></div> : null}
            {product.fit ? <div><strong>Εφαρμογή</strong><span>{product.fit}</span></div> : null}
            {product.composition ? <div><strong>Σύνθεση</strong><span>{product.composition}</span></div> : null}
            {product.madeIn ? <div><strong>Κατασκευή</strong><span>{product.madeIn === "Greece" ? "Ελλάδα" : product.madeIn}</span></div> : null}
          </div>

          {product.vendorId && product.vendorName && product.adviser ? <div className="vendor-card"><div><span className="vendor-avatar">{product.adviser.slice(0,1)}</span></div><div><div className="eyebrow">Ο άνθρωπός σου για αυτό το προϊόν</div><strong><a href={`/vendor/${product.vendorId}`}>{product.adviser} · {product.vendorName}</a></strong><p>Ρώτησε για συμβατότητα, χρήση, διαθεσιμότητα ή ποια επιλογή ταιριάζει καλύτερα στις ανάγκες σου.</p><div className="vendor-actions"><a className="button" href={`/ask-local?product=${encodeURIComponent(product.id)}&vendor=${encodeURIComponent(product.vendorId)}`}>Ζήτησε συμβουλή</a><a className="button button-secondary" href="/how-it-works">Πώς λειτουργεί</a></div></div></div> : product.vendorId && product.vendorName ? <div className="vendor-card"><div><span className="vendor-avatar">{product.vendorName.slice(0,1)}</span></div><div><div className="eyebrow">Τοπικό κατάστημα</div><strong><a href={`/vendor/${product.vendorId}`}>{product.vendorName}</a></strong><p>Η εμφανιζόμενη τιμή και διαθεσιμότητα προέρχονται από αυτό το κατάστημα.</p></div></div> : <div className="vendor-card"><div><span className="vendor-avatar">?</span></div><div><div className="eyebrow">Προσωρινά χωρίς ανάθεση</div><strong>Δεν υπάρχει επιλέξιμο τοπικό κατάστημα αυτή τη στιγμή.</strong><p>Μπορείς να χρησιμοποιήσεις το Ask Local για να περιγράψεις τι χρειάζεσαι.</p><div className="vendor-actions"><a className="button" href="/ask-local">Ask Local</a></div></div></div>}
          <div className="purchase-card"><div><strong>{product.availableToSell} τεμ. διαθέσιμα</strong><span>Η τιμή και το stock παραμένουν συνδεδεμένα με το ίδιο τοπικό offer στη διαδρομή προς το checkout.</span></div><div className="purchase-actions"><AddToCartButton product={product} /><ProductAccountActions productId={product.id} /></div></div>
          <div className="detail-assurances"><div><strong>Ένα προϊόν, μία επιλογή κάθε φορά</strong><span>Το ίδιο προϊόν δεν εμφανίζεται ως λίστα ανταγωνιστικών καταστημάτων. Η πλατφόρμα κατανέμει ισότιμα την έκθεση μεταξύ επιλέξιμων τοπικών vendors.</span></div><div><strong>Η τιμή είναι του καταστήματος</strong><span>Για διαθέσιμα προϊόντα η τιμή που βλέπεις είναι η τελική τιμή του συγκεκριμένου offer, χωρίς product markup από το Buy Local.</span></div><div><strong>Σταθερή ανάθεση</strong><span>Όσο το offer παραμένει επιλέξιμο, κρατάμε το ίδιο κατάστημα και την ίδια τιμή σε αναζήτηση, προϊόν και καλάθι.</span></div></div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
