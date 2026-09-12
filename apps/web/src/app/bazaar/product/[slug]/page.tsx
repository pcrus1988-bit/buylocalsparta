import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductMediaGallery, type ProductMediaGalleryImage } from "../../../../components/ProductMediaGallery";
import { SiteHeader } from "../../../../components/SiteHeader";
import { SiteFooter } from "../../../../components/SiteFooter";
import { bazaarConditionLabel, getBazaarProductBySlug } from "../../../../lib/bazaar-catalog";
import { getPublicCatalogSourceGallery } from "../../../../lib/public-catalog-source-gallery";
import { approvedCatalogImageGallery } from "../../../../lib/public-product-media-gallery";

type BazaarProductPageProps = Readonly<{ params: Promise<{ slug: string }> }>;

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

export async function generateMetadata({ params }: BazaarProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getBazaarProductBySlug(decodeURIComponent(slug));
  if (!product) return { title: "BAZAAR | KONTA MOY", robots: { index: false, follow: true } };
  return {
    title: `${product.title} · BAZAAR | KONTA MOY`,
    description: product.description ?? `${bazaarConditionLabel(product.condition)} στο Greece-wide BAZAAR του KONTA MOY.`,
    alternates: { canonical: `/bazaar/product/${product.slug}` }
  };
}

export default async function BazaarProductPage({ params }: BazaarProductPageProps) {
  const { slug } = await params;
  const product = await getBazaarProductBySlug(decodeURIComponent(slug));
  if (!product) notFound();

  const canonicalGallery = await approvedCatalogImageGallery({ canonicalVariantId: product.id }, 12);
  const sourceGallery = canonicalGallery.length === 0 ? await getPublicCatalogSourceGallery(product.id) : [];
  const fallbackImageSrc = product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
  const galleryImages: readonly ProductMediaGalleryImage[] = canonicalGallery.length > 0
    ? canonicalGallery.map((image, index) => ({
        id: image.mediaId,
        src: `/api/media/${encodeURIComponent(image.mediaId)}`,
        alt: image.altText ?? `${product.title} — φωτογραφία ${index + 1}`
      }))
    : sourceGallery.length > 0
      ? sourceGallery.map((image) => ({
          id: `source-${image.index}`,
          src: `/api/catalog-source-image/${encodeURIComponent(product.id)}?index=${image.index}`,
          alt: image.altText ?? `${product.title} — φωτογραφία ${image.index + 1}`
        }))
      : [{ id: "primary", src: fallbackImageSrc, alt: product.mediaAlt ?? product.title }];
  const defectLike = product.condition === "preowned_defect" || product.condition === "open_box";

  return <main style={{ background: "#f5f0e8", minHeight: "100vh" }}>
    <div className="announcement">BAZAAR · Greece-wide, condition-first.</div>
    <SiteHeader />

    <section className="shell" style={{ paddingTop: 28, paddingBottom: 18 }}>
      <Link href="/bazaar">← Πίσω στο BAZAAR</Link>
    </section>

    <section className="shell" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: "clamp(28px,5vw,72px)", alignItems: "start", paddingBottom: 72 }}>
      <ProductMediaGallery
        images={galleryImages}
        badge={product.savingsPercent ? `−${product.savingsPercent}%` : ""}
        placeholderLabel="BAZAAR"
        placeholderSymbol="•"
        surface="bazaar"
        showInfoMarker
      />

      <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
        <div className="eyebrow">{bazaarConditionLabel(product.condition)} · BAZAAR</div>
        <h1 style={{ margin: 0, fontSize: "clamp(2rem,4vw,4.5rem)", lineHeight: .95, letterSpacing: "-.045em", overflowWrap: "anywhere" }}>{product.title}</h1>
        {product.brand ? <p style={{ margin: 0, fontWeight: 800, fontSize: "1.1rem" }}>{product.brand}</p> : null}

        <div style={{ display: "grid", gap: 4, padding: "20px 0", borderTop: "1px solid rgba(0,0,0,.16)", borderBottom: "1px solid rgba(0,0,0,.16)" }}>
          {product.msrpMinor && product.msrpMinor > product.priceMinor ? <s style={{ opacity: .55 }}>ΠΛΤ {euro(product.msrpMinor)}</s> : null}
          <strong style={{ fontSize: "clamp(2rem,5vw,3.8rem)", letterSpacing: "-.04em" }}>{euro(product.priceMinor)}</strong>
          {product.savingsPercent ? <span style={{ fontWeight: 900 }}>Κερδίζεις {product.savingsPercent}% έναντι ΠΛΤ</span> : null}
        </div>

        <div style={{ padding: 18, borderRadius: 18, background: defectLike ? "#fff1d9" : "rgba(255,255,255,.65)" }}>
          <strong>Κατάσταση: {bazaarConditionLabel(product.condition)}</strong>
          <p style={{ marginBottom: 0 }}>
            {product.condition === "preloved" ? "Προηγουμένως ιδιόκτητο προϊόν. Η κατάσταση και η διαθεσιμότητα αφορούν το συγκεκριμένο BAZAAR τεμάχιο." : null}
            {product.condition === "preowned_defect" ? "Προηγουμένως ιδιόκτητο ή/και με δηλωμένη φθορά/ελάττωμα. Έλεγξε προσεκτικά την περιγραφή και τις φωτογραφίες πριν από αγορά." : null}
            {product.condition === "open_box" ? "Ανοιγμένη συσκευασία ή επιστροφή/open-box. Η κατάσταση αφορά το συγκεκριμένο τεμάχιο." : null}
            {product.condition === "new" ? "Το προϊόν ταξινομείται φυσικά ως νέο αλλά πωλείται αποκλειστικά μέσω BAZAAR, π.χ. ως εγκεκριμένη επιστροφή." : null}
            {product.condition === "refurbished" ? "Ανακατασκευασμένο προϊόν που διατίθεται αποκλειστικά μέσω BAZAAR." : null}
            {product.condition === "used" ? "Μεταχειρισμένο προϊόν που διατίθεται αποκλειστικά μέσω BAZAAR." : null}
          </p>
        </div>

        {product.description ? <div><h2 style={{ fontSize: "1.15rem" }}>Περιγραφή</h2><p style={{ whiteSpace: "pre-wrap" }}>{product.description}</p></div> : null}

        <div style={{ display: "grid", gap: 6 }}>
          <strong>{product.availableToSell} διαθέσιμο</strong>
          <span>Πωλητής / fulfilment partner: {product.vendorName}</span>
          <span>BAZAAR διαθεσιμότητα πανελλαδικά · οι διαθέσιμοι τρόποι fulfilment καθορίζονται ανά τεμάχιο.</span>
        </div>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
