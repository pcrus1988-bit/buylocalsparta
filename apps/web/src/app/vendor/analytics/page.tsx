import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorAnalyticsWorkspace } from "../../../lib/vendor-backoffice-service";
import { vendorProductAnalytics } from "../../../lib/vendor-product-analytics";

export const metadata: Metadata = { title: "Vendor Analytics", robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_KEYS = new Set(["7", "30", "90", "365", "all"]);

function first(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function euro(minor: number): string { return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }
function pct(numerator: number, denominator: number): string { return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : "0,0%"; }
function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

export default async function VendorAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const query = await searchParams;
  const requestedPeriod = first(query.period);
  const periodKey = PERIOD_KEYS.has(requestedPeriod) ? requestedPeriod : "30";
  const fromDate = DATE_RE.test(first(query.from)) ? first(query.from) : null;
  const toDate = DATE_RE.test(first(query.to)) ? first(query.to) : null;
  const categoryId = UUID_RE.test(first(query.category)) ? first(query.category) : null;
  const productId = first(query.product).trim().slice(0, 160) || null;
  const periodDays = fromDate || toDate || periodKey === "all" ? null : Number(periodKey);

  const [legacy, commerce] = await Promise.all([
    vendorAnalyticsWorkspace(principal),
    vendorProductAnalytics(principal.vendorId ?? "", { periodDays, fromDate, toDate, categoryId, productId })
  ]);
  const t = commerce.totals;
  const selectedCategory = commerce.categories.find((entry) => entry.id === categoryId)?.label;
  const selectedProduct = commerce.products.find((entry) => entry.id === productId)?.label;
  const scope = [selectedCategory, selectedProduct].filter(Boolean).join(" · ") || "Όλα τα προϊόντα";
  const periodLabel = fromDate || toDate ? `${fromDate ?? "αρχή"} → ${toDate ?? "σήμερα"}` : periodKey === "all" ? "Όλο το ιστορικό" : `Τελευταίες ${periodKey} ημέρες`;

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Performance analytics</div><h1>Analytics</h1><p className="lead">Πραγματικά supplier-scoped στοιχεία από Fair Vendor Exposure, προβολές προϊόντων, καλάθι, checkout και πωλήσεις. Δεν εμφανίζονται competitor ή customer-level δεδομένα.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Fair impressions", value: t.impressions },
      { label: "Product views", value: t.pageViews },
      { label: "Cart adds", value: t.addToCarts },
      { label: "Checkout starts", value: t.checkoutStarts },
      { label: "Sales", value: t.purchases },
      { label: "Retail sales", value: euro(t.revenueMinor) }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Filters" title="Δες όλο το κατάστημα ή κάνε ανάλυση ανά προϊόν και κατηγορία" note={`${scope} · ${periodLabel}`} />
      <form method="get" className="workspace-queue-card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, alignItems: "end" }}>
        <label><small>Περίοδος</small><select name="period" defaultValue={periodKey} style={{ width: "100%" }}><option value="7">7 ημέρες</option><option value="30">30 ημέρες</option><option value="90">90 ημέρες</option><option value="365">12 μήνες</option><option value="all">Όλο το ιστορικό</option></select></label>
        <label><small>Κατηγορία</small><select name="category" defaultValue={categoryId ?? ""} style={{ width: "100%" }}><option value="">Όλες οι κατηγορίες</option>{commerce.categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
        <label><small>Προϊόν</small><select name="product" defaultValue={productId ?? ""} style={{ width: "100%" }}><option value="">Όλα τα προϊόντα</option>{commerce.products.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
        <label><small>Από</small><input type="date" name="from" defaultValue={fromDate ?? ""} style={{ width: "100%" }} /></label>
        <label><small>Έως</small><input type="date" name="to" defaultValue={toDate ?? ""} style={{ width: "100%" }} /></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="button" type="submit">Εφαρμογή</button><a className="button button-secondary" href="/vendor/analytics">Καθαρισμός</a></div>
      </form>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Commerce funnel" title="Από εμφάνιση σε αγορά" note="Τα φίλτρα εφαρμόζονται σε ολόκληρο το commerce funnel. Τα analytics είναι read-only και δεν αλλάζουν Fair Vendor Exposure." />
      <div className="workspace-dual-grid">
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>Συνολική απόδοση</strong><small>{scope} · {periodLabel}</small></div></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Qualified impressions</strong><span>{t.impressions}</span></div>
            <div className="workspace-compact-row"><strong>Product views</strong><span>{t.pageViews}</span><small>{t.uniqueViewers} unique product viewers</small></div>
            <div className="workspace-compact-row"><strong>Average engaged time</strong><span>{duration(t.pageViews ? t.engagedSeconds / t.pageViews : 0)}</span></div>
            <div className="workspace-compact-row"><strong>Cart adds</strong><span>{t.addToCarts}</span><small>{pct(t.addToCarts, t.pageViews)} of views</small></div>
            <div className="workspace-compact-row"><strong>Checkout starts</strong><span>{t.checkoutStarts}</span><small>{pct(t.checkoutStarts, t.pageViews)} of views</small></div>
            <div className="workspace-compact-row"><strong>Attributed sales</strong><span>{t.purchases}</span><small>{t.unitsSold} units · {pct(t.purchases, t.pageViews)} view → sale</small></div>
            <div className="workspace-compact-row"><strong>Retail sales</strong><span>{euro(t.revenueMinor)}</span></div>
          </div>
        </article>
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>Advice & Ask Local</strong><small>Store-wide human support interactions</small></div></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Advice starts</strong><span>{legacy.adviceStarts}</span></div>
            <div className="workspace-compact-row"><strong>Appointments</strong><span>{legacy.appointmentsBooked}</span></div>
            <div className="workspace-compact-row"><strong>Ask Local requests</strong><span>{legacy.counterofferRequests}</span></div>
            <div className="workspace-compact-row"><strong>Private offers</strong><span>{legacy.counterofferOffers}</span><small>{legacy.counterofferAccepted} accepted</small></div>
          </div>
          <p style={{ marginTop: 12, opacity: .72 }}>Τα Advice / Ask Local totals παραμένουν store-wide μέχρι κάθε interaction να έχει product/category attribution.</p>
        </article>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Per product" title="Απόδοση ανά προϊόν" note={`${commerce.rows.length} προϊόντα στο τρέχον φίλτρο.`} />
      {commerce.rows.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        {commerce.rows.map((row) => <article className="workspace-queue-card" key={row.canonicalVariantId}>
          <div className="workspace-queue-head"><div><strong>{row.productTitle}</strong><small>{row.categoryName}</small></div><a href={`/vendor/analytics?period=${encodeURIComponent(periodKey)}&product=${encodeURIComponent(row.canonicalVariantId)}${categoryId ? `&category=${encodeURIComponent(categoryId)}` : ""}`}>Μόνο αυτό</a></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Impressions</strong><span>{row.impressions}</span></div>
            <div className="workspace-compact-row"><strong>Views</strong><span>{row.pageViews}</span><small>{row.uniqueViewers} unique</small></div>
            <div className="workspace-compact-row"><strong>Avg. engaged</strong><span>{duration(row.pageViews ? row.engagedSeconds / row.pageViews : 0)}</span></div>
            <div className="workspace-compact-row"><strong>Cart / Checkout</strong><span>{row.addToCarts} / {row.checkoutStarts}</span></div>
            <div className="workspace-compact-row"><strong>Sales</strong><span>{row.purchases}</span><small>{row.unitsSold} units · {pct(row.purchases, row.pageViews)} conversion</small></div>
            <div className="workspace-compact-row"><strong>Revenue</strong><span>{euro(row.revenueMinor)}</span></div>
          </div>
        </article>)}
      </div> : <article className="workspace-queue-card"><strong>Δεν υπάρχουν προϊόντα για αυτό το φίλτρο.</strong><p>Δοκίμασε άλλη κατηγορία, προϊόν ή χρονικό διάστημα.</p></article>}
    </section>
  </main>;
}
