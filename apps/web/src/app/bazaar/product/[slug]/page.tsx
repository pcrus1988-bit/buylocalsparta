import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "../../../../components/AddToCartButton";
import { SiteHeader } from "../../../../components/SiteHeader";
import { SiteFooter } from "../../../../components/SiteFooter";
import { bazaarConditionLabel, getBazaarProductBySlug } from "../../../../lib/bazaar-catalog";

type BazaarProductPageProps = Readonly<{ params: Promise<{ slug: string }> }>;

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function decodeHtmlEntity(entity: string): string {
  if (/^#x[0-9a-f]+$/i.test(entity)) {
    const code = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : `&${entity};`;
  }
  if (/^#\d+$/.test(entity)) {
    const code = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : `&${entity};`;
  }
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    quot: "\"",
    lt: "<",
    gt: ">",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    hellip: "…"
  };
  return named[entity.toLowerCase()] ?? `&${entity};`;
}

function plainSupplierDescription(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const text = value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(?:p|div|li|ul|ol|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li(?:\s[^>]*)?>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&([#a-z0-9]+);/gi, (_match, entity: string) => decodeHtmlEntity(entity))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || undefined;
}

export async function generateMetadata({ params }: BazaarProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getBazaarProductBySlug(decodeURIComponent(slug));
  if (!product) return { title: "BAZAAR | KONTA MOY", robots: { index: false, follow: true } };
  const description = plainSupplierDescription(product.description);
  return {
    title: `${product.title} · BAZAAR | KONTA MOY`,
    description: description ?? `${bazaarConditionLabel(product.condition)} στο Greece-wide BAZAAR του KONTA MOY.`,
    alternates: { canonical: `/bazaar/product/${product.slug}` }
  };
}

export default async function BazaarProductPage({ params }: BazaarProductPageProps) {
  const { slug } = await params;
  const product = await getBazaarProductBySlug(decodeURIComponent(slug));
  if (!product) notFound();

  const imageSrc = product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
  const defectLike = product.condition === "preowned_defect" || product.condition === "open_box";
  const description = plainSupplierDescription(product.description);
  const available = product.availableToSell > 0;
  const price = euro(product.priceMinor);

  return <main style={{ background: "#f5f0e8", minHeight: "100vh" }}>
    <div className="announcement">BAZAAR · Greece-wide, condition-first.</div>
    <SiteHeader />

    <section className="shell" style={{ paddingTop: 28, paddingBottom: 18 }}>
      <Link href="/bazaar">← Πίσω στο BAZAAR</Link>
    </section>

    <section className="shell" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: "clamp(28px,5vw,72px)", alignItems: "start", paddingBottom: 72 }}>
      <div style={{ position: "relative", aspectRatio: "1 / 1", background: "#fff", borderRadius: 28, overflow: "hidden", minWidth: 0 }}>
        {product.savingsPercent ? <div style={{ position: "absolute", zIndex: 2, top: 18, right: 18, background: "#111", color: "#fff", borderRadius: 999, padding: "9px 13px", fontWeight: 900 }}>−{product.savingsPercent}%</div> : null}
        <img src={imageSrc} alt={product.mediaAlt ?? product.title} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 24 }} />
      </div>

      <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
        <div className="eyebrow">{bazaarConditionLabel(product.condition)} · BAZAAR</div>
        <h1 style={{ margin: 0, fontSize: "clamp(2rem,4vw,4.5rem)", lineHeight: .95, letterSpacing: "-.045em", overflowWrap: "anywhere" }}>{product.title}</h1>
        {product.brand ? <p style={{ margin: 0, fontWeight: 800, fontSize: "1.1rem" }}>{product.brand}</p> : null}

        <div style={{ display: "grid", gap: 4, padding: "20px 0", borderTop: "1px solid rgba(0,0,0,.16)", borderBottom: "1px solid rgba(0,0,0,.16)" }}>
          {product.msrpMinor && product.msrpMinor > product.priceMinor ? <s style={{ opacity: .55 }}>ΠΛΤ {euro(product.msrpMinor)}</s> : null}
          <strong style={{ fontSize: "clamp(2rem,5vw,3.8rem)", letterSpacing: "-.04em" }}>{price}</strong>
          {product.savingsPercent ? <span style={{ fontWeight: 900 }}>Κερδίζεις {product.savingsPercent}% έναντι ΠΛΤ</span> : null}
        </div>

        <AddToCartButton product={{
          id: product.id,
          title: product.title,
          priceMinor: product.priceMinor,
          price,
          available,
          imageUrl: imageSrc,
          imageAlt: product.mediaAlt ?? product.title
        }} />
        <p style={{ margin: "-6px 0 0", fontSize: ".95rem", opacity: .78 }}>
          {available
            ? "Η τελική διαθεσιμότητα του συγκεκριμένου BAZAAR τεμαχίου επαληθεύεται ξανά από τον προμηθευτή κατά το checkout."
            : "Το συγκεκριμένο BAZAAR τεμάχιο δεν είναι πλέον διαθέσιμο για αγορά."}
        </p>

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

        {description ? <div><h2 style={{ fontSize: "1.15rem" }}>Περιγραφή</h2><p style={{ whiteSpace: "pre-wrap" }}>{description}</p></div> : null}

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