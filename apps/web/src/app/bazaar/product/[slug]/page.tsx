import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "../../../../components/AddToCartButton";
import { BazaarImageGallery } from "../../../../components/BazaarImageGallery";
import { ProductPurchaseInfoDialogs } from "../../../../components/ProductPurchaseInfoDialogs";
import { SiteHeader } from "../../../../components/SiteHeader";
import { SiteFooter } from "../../../../components/SiteFooter";
import { bazaarDisplayConditionLabel, bazaarProductDisclosure, bazaarProductNoticeSummary, bazaarProductNoticeTitle, getBazaarProductBySlug } from "../../../../lib/bazaar-catalog";
import { getBazaarMediaGallery } from "../../../../lib/bazaar-media-gallery";
import { publicBrandLogoUrl } from "../../../../lib/brand-logo";\nimport { publicDescriptionText } from "../../../../lib/public-description-text";

type BazaarProductPageProps = Readonly<{ params: Promise<{ slug: string }> }>;

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

export async function generateMetadata({ params }: BazaarProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getBazaarProductBySlug(decodeURIComponent(slug));
  if (!product) return { title: "BAZAAR | KONTA MOY", robots: { index: false, follow: true } };
  const description = publicDescriptionText(product.description);
  return {
    title: `${product.title} · BAZAAR | KONTA MOY`,
    description: description ?? `${bazaarDisplayConditionLabel(product.condition, product.bazaarSource)} στο Greece-wide BAZAAR του KONTA MOY.`,
    alternates: { canonical: `/bazaar/product/${product.slug}` }
  };
}

export default async function BazaarProductPage({ params }: BazaarProductPageProps) {
  const { slug } = await params;
  const product = await getBazaarProductBySlug(decodeURIComponent(slug));
  if (!product) notFound();

  const imageSrc = product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
  const defectLike = product.condition === "preowned_defect" || product.condition === "open_box" || product.bazaarSource === "supplier_tester";
  const description = publicDescriptionText(product.description);
  const available = product.availableToSell > 0;
  const price = euro(product.priceMinor);
  const brandLogoUrl = publicBrandLogoUrl(product.brandLogoObjectKey);
  const productDisclosure = bazaarProductDisclosure(product.bazaarSource);
  const productNoticeTitle = bazaarProductNoticeTitle(product.bazaarSource);
  const productNoticeSummary = bazaarProductNoticeSummary(product.bazaarSource);

  let galleryMedia: Awaited<ReturnType<typeof getBazaarMediaGallery>> = [];
  try {
    galleryMedia = await getBazaarMediaGallery(product.id, product.vendorId);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "bazaar.product_gallery_projection_failed",
      productId: product.id,
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  const orderedMedia = [...galleryMedia];
  if (product.mediaId) {
    const primaryIndex = orderedMedia.findIndex((media) => media.mediaId === product.mediaId);
    if (primaryIndex > 0) {
      const [primary] = orderedMedia.splice(primaryIndex, 1);
      if (primary) orderedMedia.unshift(primary);
    } else if (primaryIndex < 0) {
      orderedMedia.unshift({ mediaId: product.mediaId, altText: product.mediaAlt });
    }
  }

  const galleryImages = orderedMedia.length > 0
    ? orderedMedia.map((media, index) => ({
        src: `/api/media/${encodeURIComponent(media.mediaId)}`,
        alt: media.altText ?? `${product.title} · εικόνα ${index + 1}`
      }))
    : [{ src: imageSrc, alt: product.mediaAlt ?? product.title }];

  return <main style={{ background: "#f5f0e8", minHeight: "100vh" }}>
    <div className="announcement">BAZAAR · Greece-wide, condition-first.</div>
    <SiteHeader />

    <section className="shell" style={{ paddingTop: 28, paddingBottom: 18 }}>
      <Link href="/bazaar">← Πίσω στο BAZAAR</Link>
    </section>

    <section className="shell" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: "clamp(28px,5vw,72px)", alignItems: "start", paddingBottom: 72 }}>
      <BazaarImageGallery images={galleryImages} title={product.title} savingsPercent={product.savingsPercent} />

      <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
        <div className="eyebrow">{bazaarDisplayConditionLabel(product.condition, product.bazaarSource)} · BAZAAR</div>
        {product.brand ? <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 30, fontWeight: 900 }}>
          {brandLogoUrl ? <img src={brandLogoUrl} alt="" aria-hidden="true" loading="eager" decoding="async" style={{ display: "block", maxHeight: 28, maxWidth: 130, width: "auto", height: "auto", objectFit: "contain" }} /> : null}
          <span>{product.brand}</span>
        </div> : null}
        <h1 style={{ margin: 0, fontSize: "clamp(2rem,4vw,4.5rem)", lineHeight: .95, letterSpacing: "-.045em", overflowWrap: "anywhere" }}>{product.title}</h1>

        <div style={{ display: "grid", gap: 4, padding: "20px 0", borderTop: "1px solid rgba(0,0,0,.16)", borderBottom: "1px solid rgba(0,0,0,.16)" }}>
          {product.msrpMinor && product.msrpMinor > product.priceMinor ? <s style={{ opacity: .55 }}>ΠΛΤ {euro(product.msrpMinor)}</s> : null}
          <strong style={{ fontSize: "clamp(2rem,5vw,3.8rem)", letterSpacing: "-.04em" }}>{price}</strong>
          {product.savingsPercent ? <span style={{ fontWeight: 900 }}>Κερδίζεις {product.savingsPercent}% έναντι ΠΛΤ</span> : null}
        </div>

        {productDisclosure && productNoticeTitle ? <details style={{
          borderRadius: 14,
          border: "1px solid rgba(22,55,45,.45)",
          background: "#fff8ea",
          padding: "10px 12px"
        }}>
          <summary style={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            listStyle: "none",
            fontSize: ".88rem"
          }}>
            <strong>{productNoticeTitle}</strong>
            <span style={{ fontSize: ".8rem", textDecoration: "underline", whiteSpace: "nowrap" }}>Περισσότερα</span>
          </summary>
          {productNoticeSummary ? <p style={{ margin: "8px 0 0", lineHeight: 1.35, fontSize: ".84rem", fontWeight: 700 }}>{productNoticeSummary}</p> : null}
          <p style={{ margin: "7px 0 2px", lineHeight: 1.4, fontSize: ".88rem" }}>{productDisclosure}</p>
        </details> : null}

        <AddToCartButton product={{
          id: product.id,
          title: product.title,
          priceMinor: product.priceMinor,
          price,
          available,
          imageUrl: imageSrc,
          imageAlt: product.mediaAlt ?? product.title
        }} />
        {!available ? <p style={{ margin: "-6px 0 0", fontSize: ".95rem", opacity: .78 }}>Το συγκεκριμένο BAZAAR τεμάχιο δεν είναι πλέον διαθέσιμο για αγορά.</p> : null}

        <div style={{ display: "grid", gap: 6 }}>
          <strong>{product.availableToSell} διαθέσιμο</strong>
          {product.supplierFulfilled
            ? <span>Αποστολή από συνεργαζόμενο προμηθευτή.</span>
            : <>
                <span>Πωλητής / fulfilment partner: {product.vendorName}</span>
                <span>BAZAAR διαθεσιμότητα πανελλαδικά · οι διαθέσιμοι τρόποι fulfilment καθορίζονται ανά τεμάχιο.</span>
              </>}
        </div>

        <ProductPurchaseInfoDialogs supplierFulfilled={product.supplierFulfilled} />

        {product.bazaarSource === "supplier_tester" || product.bazaarSource === "supplier_sample"
          ? <div style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,.55)", fontSize: ".88rem" }}>
              <strong>Κατάσταση: {bazaarDisplayConditionLabel(product.condition, product.bazaarSource)}</strong>
            </div>
          : <div style={{ padding: 18, borderRadius: 18, background: defectLike ? "#fff1d9" : "rgba(255,255,255,.65)" }}>
              <strong>Κατάσταση: {bazaarDisplayConditionLabel(product.condition, product.bazaarSource)}</strong>
              <p style={{ marginBottom: 0 }}>
                {product.condition === "preloved" ? "Προηγουμένως ιδιόκτητο προϊόν. Η κατάσταση και η διαθεσιμότητα αφορούν το συγκεκριμένο BAZAAR τεμάχιο." : null}
                {product.condition === "preowned_defect" ? "Προηγουμένως ιδιόκτητο ή/και με δηλωμένη φθορά/ελάττωμα. Έλεγξε προσεκτικά την περιγραφή και τις φωτογραφίες πριν από αγορά." : null}
                {product.condition === "open_box" ? "Ανοιγμένη συσκευασία ή επιστροφή/open-box. Η κατάσταση αφορά το συγκεκριμένο τεμάχιο." : null}
                {product.condition === "new" ? "Το προϊόν ταξινομείται φυσικά ως νέο αλλά πωλείται αποκλειστικά μέσω BAZAAR, π.χ. ως εγκεκριμένη επιστροφή." : null}
                {product.condition === "refurbished" ? "Ανακατασκευασμένο προϊόν που διατίθεται αποκλειστικά μέσω BAZAAR." : null}
                {product.condition === "used" ? "Μεταχειρισμένο προϊόν που διατίθεται αποκλειστικά μέσω BAZAAR." : null}
              </p>
            </div>}

        {description ? <div><h2 style={{ fontSize: "1.15rem" }}>Περιγραφή</h2><p style={{ whiteSpace: "pre-wrap" }}>{description}</p></div> : null}
      </div>
    </section>

    <SiteFooter />
  </main>;
}
