import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "DEMO shop · KONTA MOY",
  robots: { index: false, follow: false, nocache: true }
};

type DemoVendorRow = SqlRow & {
  vendor_uuid: string;
  public_id: string;
  trading_name: string;
  legal_name: string;
  status: string;
  location_name: string | null;
  locality: string | null;
};

type DemoProductRow = SqlRow & {
  canonical_id: string;
  title: string;
  description: string | null;
  brand_name: string | null;
  model: string | null;
  vendor_sku: string | null;
  offer_status: string;
  customer_price_minor: number | string;
};

const text = (value: unknown) => typeof value === "string" ? value : String(value ?? "");
const money = (value: unknown) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(Number(value ?? 0) / 100);

export default async function DemoVendorPage({ params }: { params: Promise<{ id: string }> }) {
  if (!productionDatabaseConfigured()) notFound();
  const { id } = await params;
  const db = getProductionPostgresRuntime().sqlPool;
  const vendorResult = await db.query<DemoVendorRow>(`
    SELECT v.id::text AS vendor_uuid,v.public_id,v.trading_name,v.legal_name,v.status::text AS status,
           l.name AS location_name,l.locality
    FROM vendor_businesses v
    LEFT JOIN LATERAL (
      SELECT name,locality FROM vendor_locations
      WHERE vendor_id=v.id
      ORDER BY active DESC,created_at,public_id
      LIMIT 1
    ) l ON true
    WHERE (v.public_id=$1 OR v.id::text=$1)
      AND v.demo_mode=true
      AND v.status NOT IN ('restricted','suspended','closed')
    LIMIT 1
  `, [id]);
  const vendor = vendorResult.rows[0];
  if (!vendor) notFound();

  const products = await db.query<DemoProductRow>(`
    SELECT DISTINCT ON (cv.id)
           cv.public_id AS canonical_id,
           COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
           COALESCE(el.description,en.description) AS description,
           b.name AS brand_name,cv.model,vo.vendor_sku,vo.status::text AS offer_status,vo.customer_price_minor
    FROM vendor_offers vo
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    LEFT JOIN brands b ON b.id=cv.brand_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE vo.vendor_id=$1::uuid
      AND vo.status IN ('draft','pending_review','approved')
      AND cv.recalled=false
      AND cv.suppressed=false
    ORDER BY cv.id,
      CASE vo.status WHEN 'approved' THEN 1 WHEN 'pending_review' THEN 2 ELSE 3 END,
      vo.updated_at DESC
  `, [text(vendor.vendor_uuid)]);

  return <main className="customer-app">
    <section className="shell vendor-hero">
      <div>
        <div className="eyebrow">KONTA MOY · DEMO / Κατάστημα επίδειξης</div>
        <h1>{text(vendor.trading_name)}</h1>
        <p className="lead">Αυτή είναι δοκιμαστική παρουσίαση καταστήματος. Τα προϊόντα και οι τιμές προβάλλονται για σκοπούς επίδειξης και δεν μπορούν να αγοραστούν από αυτή τη σελίδα.</p>
        <p><strong>DEMO — οι παραγγελίες, πληρωμές και δεσμεύσεις αποθέματος είναι απενεργοποιημένες.</strong></p>
        {(vendor.location_name || vendor.locality) && <p>{[text(vendor.location_name), text(vendor.locality)].filter(Boolean).join(" · ")}</p>}
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="eyebrow">Prepared catalogue</div>
      <h2>Προϊόντα καταστήματος</h2>
      {products.rowCount === 0 ? <div className="card"><p>Το demo catalogue δεν έχει ακόμη προϊόντα.</p></div> : <div className="product-grid">
        {products.rows.map((product) => <article className="card product-card" key={text(product.canonical_id)}>
          <div className="eyebrow">{[text(product.brand_name), text(product.model)].filter(Boolean).join(" · ") || "Local catalogue"}</div>
          <h3>{text(product.title)}</h3>
          {product.description && <p>{text(product.description).slice(0, 240)}</p>}
          <p><strong>{money(product.customer_price_minor)}</strong></p>
          <small>{product.vendor_sku ? `SKU ${text(product.vendor_sku)} · ` : ""}DEMO · {text(product.offer_status)}</small>
          <button className="button button-secondary" type="button" disabled aria-disabled="true">Μη διαθέσιμο για αγορά σε DEMO</button>
        </article>)}
      </div>}
    </section>
  </main>;
}
