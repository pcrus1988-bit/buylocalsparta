import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorProfitabilityIntelligence, type ProfitabilityPeriod } from "../../../lib/profitability-intelligence";

export const metadata: Metadata = { title: "Κερδοφορία & περιθώρια", robots: { index: false, follow: false } };

type PageProps = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;

function first(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function euro(minor: number): string { return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }
function pctBps(value?: number): string { return value === undefined ? "—" : `${(value / 100).toLocaleString("el-GR", { maximumFractionDigits: 1 })}%`; }
function pct(value: number): string { return `${value.toLocaleString("el-GR", { maximumFractionDigits: 1 })}%`; }
function period(raw: string): ProfitabilityPeriod { return raw === "30" ? 30 : raw === "365" ? 365 : raw === "all" ? null : 90; }
function periodLabel(value: ProfitabilityPeriod): string { return value === null ? "Όλο το ιστορικό" : `Τελευταίες ${value} ημέρες`; }

const statusLabel = {
  missing_cost: "Λείπει τιμή αγοράς",
  negative: "Αρνητικό περιθώριο",
  thin: "Χαμηλό περιθώριο",
  healthy: "Υγιές περιθώριο"
} as const;

export default async function VendorProfitabilityPage({ searchParams }: PageProps) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const query = await searchParams;
  const selectedPeriod = period(first(query.period));
  const report = await vendorProfitabilityIntelligence(principal, selectedPeriod);
  const s = report.summary;
  const c = report.current;

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Οικονομική απόδοση</div>
      <h1>Κερδοφορία & περιθώρια</h1>
      <p className="lead">Δες το μικτό περιθώριο προϊόντων και τη συνεισφορά μετά τις προμήθειες του marketplace. Τα ποσά κόστους είναι ιδιωτικά και δεν εμφανίζονται ποτέ στο δημόσιο κατάστημα.</p>
      <div className="hero-actions"><Link className="button button-secondary" href="/vendor/analytics">Επισκέψεις & πωλήσεις</Link><Link className="button button-secondary" href="/vendor/products">Διαχείριση τιμών</Link></div>
    </div></section>

    <WorkspaceMetricStrip items={[
      { label: "Πραγματοποιημένες πωλήσεις", value: euro(s.realizedRevenueMinor), hint: periodLabel(selectedPeriod) },
      { label: "Μικτό κέρδος", value: euro(s.grossProfitMinor), hint: `μόνο για γραμμές με ιστορικό κόστος · ${pctBps(s.grossMarginBps)}`, tone: s.grossProfitMinor > 0 ? "positive" : s.grossProfitMinor < 0 ? "danger" : "default" },
      { label: "Συνεισφορά μετά marketplace fees", value: euro(s.contributionAfterMarketplaceFeesMinor), hint: pctBps(s.contributionMarginBps), tone: s.contributionAfterMarketplaceFeesMinor > 0 ? "positive" : s.contributionAfterMarketplaceFeesMinor < 0 ? "danger" : "default" },
      { label: "Κάλυψη ιστορικού κόστους", value: pct(s.costCoveragePct), hint: `${s.costCoveredLines}/${s.recognizedLines} γραμμές πώλησης` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Χρονικό διάστημα" title="Πραγματοποιημένη κερδοφορία" note="Οι ιστορικές αναφορές χρησιμοποιούν το κόστος που αποθηκεύτηκε τη στιγμή που δημιουργήθηκε η γραμμή παραγγελίας." />
      <form method="get" className="workspace-queue-card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <label><small>Περίοδος</small><select name="period" defaultValue={selectedPeriod === null ? "all" : String(selectedPeriod)}><option value="30">30 ημέρες</option><option value="90">90 ημέρες</option><option value="365">12 μήνες</option><option value="all">Όλο το ιστορικό</option></select></label>
        <button className="button" type="submit">Εφαρμογή</button>
      </form>
      {s.missingCostLines > 0 ? <div className="workspace-inline-note" style={{ marginTop: 12 }}><strong>Ιστορικό κόστος μη διαθέσιμο:</strong> {s.missingCostLines} παλαιότερες γραμμές δεν έχουν immutable cost snapshot. Δεν χρησιμοποιούμε τη σημερινή τιμή αγοράς για να ξαναγράψουμε το παρελθόν.</div> : null}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Τρέχον catalogue" title="Υγεία περιθωρίου σήμερα" note="Αυτό το τμήμα χρησιμοποιεί τη σημερινή ιδιωτική τιμή αγοράς και την τρέχουσα λιανική. Δεν είναι ιστορική αναφορά." />
      <WorkspaceMetricStrip items={[
        { label: "Προϊόντα με κόστος", value: c.costCoveredOffers, hint: `${pct(c.coveragePct)} κάλυψη` },
        { label: "Χωρίς τιμή αγοράς", value: c.missingCostOffers, tone: c.missingCostOffers ? "attention" : "positive" },
        { label: "Αρνητικό περιθώριο", value: c.negativeMarginOffers, tone: c.negativeMarginOffers ? "danger" : "positive" },
        { label: "Χαμηλό περιθώριο (<15%)", value: c.thinMarginOffers, tone: c.thinMarginOffers ? "attention" : "positive" }
      ]} />
      {report.currentRows.length ? <div className="workspace-queue-list" style={{ marginTop: 16 }}>
        {report.currentRows.slice(0, 100).map((row) => <article className="workspace-queue-card" key={row.offerId}>
          <div className="workspace-queue-head"><div><strong>{row.productTitle}</strong><small>{row.categoryName}</small></div><span className="vendor-merchant-status">{statusLabel[row.status]}</span></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Λιανική</strong><span>{euro(row.retailPriceMinor)}</span></div>
            <div className="workspace-compact-row"><strong>Τιμή αγοράς</strong><span>{row.buyingPriceMinor === undefined ? "—" : euro(row.buyingPriceMinor)}</span></div>
            <div className="workspace-compact-row"><strong>Μικτό κέρδος / τεμ.</strong><span>{row.grossProfitMinor === undefined ? "—" : euro(row.grossProfitMinor)}</span><small>{pctBps(row.grossMarginBps)}</small></div>
          </div>
        </article>)}
      </div> : <article className="workspace-queue-card" style={{ marginTop: 16 }}><strong>Δεν υπάρχουν ενεργές τιμές για ανάλυση.</strong></article>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Πραγματοποιημένες πωλήσεις" title="Κερδοφορία ανά προϊόν" note="Τα ποσά κέρδους εμφανίζονται μόνο για πωλήσεις με καταγεγραμμένο ιστορικό κόστος." />
      {report.products.length ? <div className="workspace-queue-list">
        {report.products.slice(0, 50).map((row) => <article className="workspace-queue-card" key={row.id}>
          <div className="workspace-queue-head"><div><strong>{row.label}</strong><small>{row.secondaryLabel}</small></div><strong>{pctBps(row.grossMarginBps)}</strong></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Πωλήσεις</strong><span>{euro(row.revenueMinor)}</span><small>{row.recognizedUnits} τεμ.</small></div>
            <div className="workspace-compact-row"><strong>Μικτό κέρδος</strong><span>{euro(row.grossProfitMinor)}</span></div>
            <div className="workspace-compact-row"><strong>Μετά marketplace fees</strong><span>{euro(row.contributionMinor)}</span><small>{pctBps(row.contributionMarginBps)}</small></div>
            {row.missingCostLines ? <div className="workspace-compact-row"><strong>Χωρίς ιστορικό κόστος</strong><span>{row.missingCostLines} γραμμές</span></div> : null}
          </div>
        </article>)}
      </div> : <article className="workspace-queue-card"><strong>Δεν υπάρχουν πραγματοποιημένες πωλήσεις στο επιλεγμένο διάστημα.</strong></article>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Κατηγορίες" title="Πού παράγεται το περιθώριο" note="Σύγκρινε κατηγορίες με βάση πραγματοποιημένες πωλήσεις, όχι views." />
      <WorkspaceRecordDetails label={`Ανάλυση ${report.categories.length} κατηγοριών`} open>
        <div className="workspace-compact-list">
          {report.categories.map((row) => <div className="workspace-compact-row" key={row.id}><strong>{row.label}</strong><span>{euro(row.grossProfitMinor)}</span><small>{pctBps(row.grossMarginBps)} μικτό · {euro(row.contributionMinor)} μετά fees</small></div>)}
        </div>
      </WorkspaceRecordDetails>
    </section>

    <section className="shell vendor-section"><div className="workspace-inline-note"><strong>Σημαντικό:</strong> «Συνεισφορά μετά marketplace fees» δεν σημαίνει καθαρό λογιστικό κέρδος. Δεν αφαιρεί μισθοδοσία, ενοίκιο, λειτουργικά, μεταφορικά κόστη που δεν έχουν αποδοθεί σε γραμμή προϊόντος, φόρο εισοδήματος ή άλλα γενικά έξοδα.</div></section>
  </main>;
}
