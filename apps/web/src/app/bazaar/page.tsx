import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import { bazaarConditionLabel, bazaarSourceLabel, getBazaarCatalog } from "../../lib/bazaar-catalog";

export const metadata: Metadata = {
  title: "BAZAAR | KONTA MOY",
  description: "Preloved, Preowned / Defect, open-box και επιλεγμένα επιστρεφόμενα προϊόντα από όλη την Ελλάδα, σε ξεχωριστό BAZAAR του KONTA MOY.",
  alternates: { canonical: "/bazaar" }
};

type BazaarPageProps = Readonly<{ searchParams: Promise<Record<string,string | string[] | undefined>> }>;

function valueOf(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

export default async function BazaarPage({ searchParams }: BazaarPageProps) {
  const params = await searchParams;
  const query = valueOf(params.q).trim();
  const condition = valueOf(params.condition).trim();
  const source = valueOf(params.source).trim();
  const brand = valueOf(params.brand).trim();
  const category = valueOf(params.category).trim();
  const [products, allProducts] = await Promise.all([
    getBazaarCatalog({ query,condition,source,brand,category }),
    getBazaarCatalog()
  ]);

  const brands = [...new Set(allProducts.map((product) => product.brand).filter((value): value is string => Boolean(value)))].sort((a,b) => a.localeCompare(b,"el"));
  const categories = [...new Set(allProducts.map((product) => product.categoryCode))].sort((a,b) => a.localeCompare(b,"el"));
  const conditions = [...new Set(allProducts.map((product) => product.condition))];
  const sources = [...new Set(allProducts.map((product) => product.bazaarSource).filter((value): value is NonNullable<typeof value> => Boolean(value)))];

  return <main style={{ background: "#f5f0e8", minHeight: "100vh" }}>
    <div className="announcement">BAZAAR · Μοναδικά κομμάτια, πανελλαδικά.</div>
    <SiteHeader />

    <section className="shell" style={{ paddingTop: 56, paddingBottom: 32 }}>
      <div style={{ display: "grid", gap: 18, maxWidth: 900 }}>
        <div className="eyebrow">KONTA MOY · Greece-wide</div>
        <h1 style={{ fontSize: "clamp(3rem, 9vw, 7.5rem)", letterSpacing: "-0.07em", lineHeight: .82, margin: 0 }}>BAZAAR</h1>
        <p className="lead" style={{ maxWidth: 760, fontSize: "clamp(1.05rem, 2vw, 1.35rem)" }}>
          Preloved, Preowned / Defect, open-box και επιλεγμένες επιστροφές. Κάθε προϊόν είναι ξεχωριστά ταξινομημένο και δεν εμφανίζεται ποτέ στον κανονικό κατάλογο του KONTA MOY.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span style={{ border: "1px solid currentColor", borderRadius: 999, padding: "8px 13px", fontWeight: 800 }}>ΕΛΛΑΔΑ · Χωρίς τοπικό περιορισμό</span>
          <span style={{ border: "1px solid currentColor", borderRadius: 999, padding: "8px 13px" }}>Condition-first</span>
          <span style={{ border: "1px solid currentColor", borderRadius: 999, padding: "8px 13px" }}>Μοναδική διαθεσιμότητα</span>
        </div>
      </div>
    </section>

    <section className="shell" style={{ paddingBottom: 28 }}>
      <form action="/bazaar" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", gap: 10, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 6 }}><span>Αναζήτηση BAZAAR</span><input name="q" defaultValue={query} placeholder="Brand, προϊόν, κατηγορία…" /></label>
        <label style={{ display: "grid", gap: 6 }}><span>Κατάσταση</span><select name="condition" defaultValue={condition}><option value="">Όλες</option>{conditions.map((item) => <option key={item} value={item}>{bazaarConditionLabel(item)}</option>)}</select></label>
        <label style={{ display: "grid", gap: 6 }}><span>Προέλευση</span><select name="source" defaultValue={source}><option value="">Όλες</option>{sources.map((item) => <option key={item} value={item}>{bazaarSourceLabel(item)}</option>)}</select></label>
        <label style={{ display: "grid", gap: 6 }}><span>Brand</span><select name="brand" defaultValue={brand}><option value="">Όλα</option>{brands.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label style={{ display: "grid", gap: 6 }}><span>Κατηγορία</span><select name="category" defaultValue={category}><option value="">Όλες</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <button type="submit" className="button primary">Φίλτρα</button>
      </form>
    </section>

    <section className="shell" style={{ paddingBottom: 72 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline", marginBottom: 22, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{products.length ? `${products.length} BAZAAR επιλογές` : "BAZAAR"}</h2>
        {(query || condition || source || brand || category) ? <Link href="/bazaar">Καθαρισμός φίλτρων</Link> : null}
      </div>

      {products.length === 0 ? <div className="empty-state" style={{ padding: 48 }}>
        <h3>Δεν υπάρχουν διαθέσιμα προϊόντα με αυτά τα φίλτρα.</h3>
        <p>Το BAZAAR ενημερώνεται δυναμικά καθώς περνούν προϊόντα από έλεγχο κατάστασης και διαθεσιμότητας.</p>
      </div> : <div className="product-grid">
        {products.map((product,index) => {
          const imageSrc = product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
          return <article className="product-card" key={product.id} style={{ overflow: "hidden", position: "relative" }}>
            {product.savingsPercent ? <div style={{ position: "absolute", zIndex: 3, top: 12, right: 12, background: "#111", color: "#fff", borderRadius: 999, padding: "7px 10px", fontWeight: 900 }}>−{product.savingsPercent}%</div> : null}
            <Link href={`/bazaar/product/${encodeURIComponent(product.slug)}`} className="product-art" aria-label={`Δες ${product.title}`}>
              <img src={imageSrc} alt={product.mediaAlt ?? product.title} loading={index < 4 ? "eager" : "lazy"} decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", padding: 16, background: "#fff" }} />
            </Link>
            <div className="product-body">
              <div className="eyebrow">{bazaarConditionLabel(product.condition)}</div>
              <h3><Link href={`/bazaar/product/${encodeURIComponent(product.slug)}`}>{product.title}</Link></h3>
              {product.brand ? <p style={{ margin: "4px 0 6px", opacity: .7 }}>{product.brand}</p> : null}
              {product.bazaarSource ? <p style={{ margin: "0 0 10px", fontSize: ".86rem", fontWeight: 800 }}>{bazaarSourceLabel(product.bazaarSource)}</p> : null}
              <div className="price">
                {product.msrpMinor && product.msrpMinor > product.priceMinor ? <s style={{ opacity: .55, fontSize: ".7em" }}>ΠΛΤ {euro(product.msrpMinor)}</s> : null}
                <span>{euro(product.priceMinor)}</span>
              </div>
              <p style={{ margin: "10px 0 0", fontWeight: 700 }}>BAZAAR · {product.availableToSell} διαθέσιμο</p>
            </div>
          </article>;
        })}
      </div>}
    </section>

    <SiteFooter />
  </main>;
}
