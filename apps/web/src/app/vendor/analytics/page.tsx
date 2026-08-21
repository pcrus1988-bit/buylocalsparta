import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorAnalyticsWorkspace } from "../../../lib/vendor-backoffice-service";
import { vendorProductAnalytics } from "../../../lib/vendor-product-analytics";

export const metadata: Metadata = { title: "Απόδοση καταστήματος", robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_KEYS = new Set(["7", "30", "90", "365", "all"]);

function first(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function euro(minor: number): string { return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }
function pct(numerator: number, denominator: number): string { return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : "0,0%"; }
function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} δευτ.`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} λ. ${rest} δ.`;
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
  const funnelMax = Math.max(t.pageViews, t.addToCarts, t.checkoutStarts, t.purchases, 1);

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Στατιστικά</div><h1>Απόδοση καταστήματος</h1><p className="lead">Ξεκίνα από πωλήσεις, επισκέψεις και μετατροπή. Οι πιο τεχνικές μετρήσεις προβολής και attribution παραμένουν διαθέσιμες όταν τις χρειάζεσαι.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Πωλήσεις", value: euro(t.revenueMinor), tone: t.revenueMinor ? "positive" : "default" },
      { label: "Αγορές", value: t.purchases, tone: t.purchases ? "positive" : "default" },
      { label: "Προβολές προϊόντων", value: t.pageViews },
      { label: "Μετατροπή σε αγορά", value: pct(t.purchases, t.pageViews), hint: "προβολή → αγορά" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Φίλτρα" title="Διάλεξε τι θέλεις να αναλύσεις" note={`${scope} · ${periodLabel}`} />
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
      <WorkspaceSectionHeading eyebrow="Διαδρομή πελάτη" title="Από την προβολή στην αγορά" note="Βλέπεις πού συνεχίζουν και πού χάνονται οι πελάτες για το επιλεγμένο προϊόν, κατηγορία και διάστημα." />
      <WorkspaceHowItWorks className="vendor-page-help">
        <p><strong>Προβολές:</strong> πόσες φορές άνοιξαν σελίδες προϊόντων.</p>
        <p><strong>Προσθήκες στο καλάθι:</strong> πόσες φορές προϊόν μπήκε στο καλάθι.</p>
        <p><strong>Έναρξη checkout:</strong> πόσες φορές ο πελάτης προχώρησε προς πληρωμή.</p>
        <p><strong>Αγορές:</strong> ολοκληρωμένες αγορές που αποδίδονται στο κατάστημά σου.</p>
      </WorkspaceHowItWorks>
      <article className="workspace-queue-card">
        <div className="workspace-queue-head"><div><strong>{scope}</strong><small>{periodLabel}</small></div><span className="vendor-merchant-status">{pct(t.purchases, t.pageViews)} μετατροπή</span></div>
        <div className="workspace-compact-list" style={{ marginTop: 14 }}>
          {[
            { label: "Προβολές προϊόντων", value: t.pageViews, detail: `${t.uniqueViewers} μοναδικοί επισκέπτες` },
            { label: "Προσθήκες στο καλάθι", value: t.addToCarts, detail: `${pct(t.addToCarts, t.pageViews)} των προβολών` },
            { label: "Έναρξη checkout", value: t.checkoutStarts, detail: `${pct(t.checkoutStarts, t.pageViews)} των προβολών` },
            { label: "Αγορές", value: t.purchases, detail: `${t.unitsSold} τεμάχια · ${euro(t.revenueMinor)}` }
          ].map((step) => <div className="workspace-compact-row" key={step.label} style={{ alignItems: "center" }}>
            <strong>{step.label}</strong>
            <span>{step.value}</span>
            <small>{step.detail}</small>
            <progress value={step.value} max={funnelMax} aria-label={`${step.label}: ${step.value}`} style={{ width: "100%", gridColumn: "1 / -1", height: 10 }} />
          </div>)}
        </div>
      </article>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ανθρώπινη εξυπηρέτηση" title="Συμβουλή & Ask Local" note="Οι μετρήσεις αυτές είναι συνολικές για το κατάστημα μέχρι κάθε interaction να έχει αξιόπιστη απόδοση σε συγκεκριμένο προϊόν." />
      <div className="workspace-dual-grid">
        <article className="workspace-queue-card"><strong>Συμβουλή πελατών</strong><div className="workspace-compact-list" style={{ marginTop: 12 }}><div className="workspace-compact-row"><strong>Έναρξη συμβουλής</strong><span>{legacy.adviceStarts}</span></div><div className="workspace-compact-row"><strong>Ραντεβού</strong><span>{legacy.appointmentsBooked}</span></div></div></article>
        <article className="workspace-queue-card"><strong>Ask Local</strong><div className="workspace-compact-list" style={{ marginTop: 12 }}><div className="workspace-compact-row"><strong>Αιτήματα</strong><span>{legacy.counterofferRequests}</span></div><div className="workspace-compact-row"><strong>Ιδιωτικές προσφορές</strong><span>{legacy.counterofferOffers}</span><small>{legacy.counterofferAccepted} έγιναν αποδεκτές</small></div></div></article>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Προϊόντα" title="Απόδοση ανά προϊόν" note={`${commerce.rows.length} προϊόντα στο τρέχον φίλτρο.`} />
      {commerce.rows.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        {commerce.rows.map((row) => <article className="workspace-queue-card" key={row.canonicalVariantId}>
          <div className="workspace-queue-head"><div><strong>{row.productTitle}</strong><small>{row.categoryName}</small></div><a href={`/vendor/analytics?period=${encodeURIComponent(periodKey)}&product=${encodeURIComponent(row.canonicalVariantId)}${categoryId ? `&category=${encodeURIComponent(categoryId)}` : ""}`}>Ανάλυση προϊόντος</a></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Προβολές</strong><span>{row.pageViews}</span><small>{row.uniqueViewers} μοναδικοί</small></div>
            <div className="workspace-compact-row"><strong>Καλάθι / Checkout</strong><span>{row.addToCarts} / {row.checkoutStarts}</span></div>
            <div className="workspace-compact-row"><strong>Αγορές</strong><span>{row.purchases}</span><small>{row.unitsSold} τεμάχια · {pct(row.purchases, row.pageViews)} μετατροπή</small></div>
            <div className="workspace-compact-row"><strong>Πωλήσεις</strong><span>{euro(row.revenueMinor)}</span></div>
          </div>
          <WorkspaceRecordDetails label="Προχωρημένες μετρήσεις">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Fair impressions</strong><span>{row.impressions}</span></div>
              <div className="workspace-compact-row"><strong>Μέσος ενεργός χρόνος</strong><span>{duration(row.pageViews ? row.engagedSeconds / row.pageViews : 0)}</span></div>
            </div>
          </WorkspaceRecordDetails>
        </article>)}
      </div> : <article className="workspace-queue-card"><strong>Δεν υπάρχουν προϊόντα για αυτό το φίλτρο.</strong><p>Δοκίμασε άλλη κατηγορία, προϊόν ή χρονικό διάστημα.</p></article>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Προχωρημένα" title="Μετρήσεις έκθεσης & attribution" note="Χρήσιμες για βαθύτερη ανάλυση, όχι απαραίτητες για την καθημερινή λειτουργία του καταστήματος." />
      <WorkspaceRecordDetails label="Προβολή προχωρημένων μετρήσεων">
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Fair / qualified impressions</strong><span>{t.impressions}</span></div>
          <div className="workspace-compact-row"><strong>Μοναδικοί επισκέπτες προϊόντων</strong><span>{t.uniqueViewers}</span></div>
          <div className="workspace-compact-row"><strong>Μέσος ενεργός χρόνος</strong><span>{duration(t.pageViews ? t.engagedSeconds / t.pageViews : 0)}</span></div>
          <div className="workspace-compact-row"><strong>Attributed purchases</strong><span>{t.purchases}</span><small>{t.unitsSold} τεμάχια</small></div>
        </div>
      </WorkspaceRecordDetails>
    </section>
  </main>;
}
