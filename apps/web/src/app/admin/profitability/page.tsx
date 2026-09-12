import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../lib/admin-session";
import { assertAdminPermission } from "../../../lib/admin-runtime";
import { adminProfitabilityIntelligence, type ProfitabilityPeriod } from "../../../lib/profitability-intelligence";

export const metadata: Metadata = { title: "Admin · Profitability & Margins", robots: { index: false, follow: false } };

type PageProps = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;

function first(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function euro(minor: number): string { return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }
function pctBps(value?: number): string { return value === undefined ? "—" : `${(value / 100).toLocaleString("el-GR", { maximumFractionDigits: 1 })}%`; }
function pct(value: number): string { return `${value.toLocaleString("el-GR", { maximumFractionDigits: 1 })}%`; }
function period(raw: string): ProfitabilityPeriod { return raw === "30" ? 30 : raw === "365" ? 365 : raw === "all" ? null : 90; }
function periodLabel(value: ProfitabilityPeriod): string { return value === null ? "all history" : `last ${value} days`; }

export default async function AdminProfitabilityPage({ searchParams }: PageProps) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  assertAdminPermission(principal, "finance.read");
  const query = await searchParams;
  const selectedPeriod = period(first(query.period));
  const report = await adminProfitabilityIntelligence(principal, selectedPeriod);
  const s = report.summary;
  const c = report.current;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Finance intelligence · private</div>
      <h1>Profitability & Margin Intelligence</h1>
      <p className="lead">Marketplace-wide view of realised product economics, current catalogue margin health, vendor cost coverage and category profitability. No buying-cost field is exposed to public storefront APIs.</p>
      <div className="hero-actions"><Link className="button button-secondary" href="/admin/analytics">Marketplace analytics</Link><Link className="button button-secondary" href="/admin/finance">Finance</Link></div>
    </div></section>

    <WorkspaceMetricStrip items={[
      { label: "Realised revenue", value: euro(s.realizedRevenueMinor), hint: periodLabel(selectedPeriod) },
      { label: "Gross product profit", value: euro(s.grossProfitMinor), hint: `${pctBps(s.grossMarginBps)} on cost-covered revenue`, tone: s.grossProfitMinor > 0 ? "positive" : s.grossProfitMinor < 0 ? "attention" : "default" },
      { label: "Contribution after marketplace fees", value: euro(s.contributionAfterMarketplaceFeesMinor), hint: pctBps(s.contributionMarginBps), tone: s.contributionAfterMarketplaceFeesMinor > 0 ? "positive" : s.contributionAfterMarketplaceFeesMinor < 0 ? "attention" : "default" },
      { label: "Historical cost coverage", value: pct(s.costCoveragePct), hint: `${s.costCoveredLines}/${s.recognizedLines} realised lines` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Period" title="Realised economics" note="Historical profit uses immutable order-line cost snapshots. Legacy sales without a snapshot stay explicitly uncovered." />
      <form method="get" className="workspace-queue-card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <label><small>Period</small><select name="period" defaultValue={selectedPeriod === null ? "all" : String(selectedPeriod)}><option value="30">30 days</option><option value="90">90 days</option><option value="365">12 months</option><option value="all">All history</option></select></label>
        <button className="button" type="submit">Apply</button>
      </form>
      {s.missingCostLines ? <div className="workspace-inline-note" style={{ marginTop: 12 }}><strong>Coverage warning:</strong> {s.missingCostLines} realised legacy lines have no historical cost snapshot. They contribute to revenue but are excluded from profit/margin denominators.</div> : null}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Current catalogue" title="Margin-risk control" note="Uses today's private buying cost and current retail price. This is a pricing health signal, not historical P&L." />
      <WorkspaceMetricStrip items={[
        { label: "Approved offers", value: c.offers },
        { label: "Cost coverage", value: pct(c.coveragePct), hint: `${c.costCoveredOffers} offers with buying cost` },
        { label: "Missing buying cost", value: c.missingCostOffers, tone: c.missingCostOffers ? "attention" : "positive" },
        { label: "Negative / thin margin", value: `${c.negativeMarginOffers} / ${c.thinMarginOffers}`, tone: c.negativeMarginOffers || c.thinMarginOffers ? "attention" : "positive" }
      ]} />
      <WorkspaceRecordDetails label="Highest-priority pricing risks" open>
        <div className="workspace-compact-list">
          {report.currentRows.filter((row) => row.status !== "healthy").slice(0, 100).map((row) => <div className="workspace-compact-row" key={`${row.vendorId}:${row.offerId}`}>
            <strong>{row.productTitle}</strong>
            <span>{row.vendorName ?? row.vendorId}</span>
            <small>{row.status === "missing_cost" ? "missing buying cost" : `${euro(row.grossProfitMinor ?? 0)} / unit · ${pctBps(row.grossMarginBps)}`}</small>
          </div>)}
        </div>
      </WorkspaceRecordDetails>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Vendors" title="Realised profitability by vendor" note="Gross profit and contribution are calculated only where immutable historical cost is available." />
      <div className="workspace-queue-list">
        {report.vendors.slice(0, 100).map((row) => <article className="workspace-queue-card" key={row.id}>
          <div className="workspace-queue-head"><div><strong>{row.label}</strong><small>{row.recognizedUnits} realised units</small></div><strong>{pctBps(row.grossMarginBps)}</strong></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Revenue</strong><span>{euro(row.revenueMinor)}</span></div>
            <div className="workspace-compact-row"><strong>Gross product profit</strong><span>{euro(row.grossProfitMinor)}</span></div>
            <div className="workspace-compact-row"><strong>After marketplace fees</strong><span>{euro(row.contributionMinor)}</span><small>{pctBps(row.contributionMarginBps)}</small></div>
            {row.missingCostLines ? <div className="workspace-compact-row"><strong>Uncovered legacy lines</strong><span>{row.missingCostLines}</span></div> : null}
          </div>
        </article>)}
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Categories" title="Where margin is created or destroyed" note="Use this to identify categories that generate volume but weak product economics." />
      <WorkspaceRecordDetails label={`${report.categories.length} category groups`} open>
        <div className="workspace-compact-list">
          {report.categories.map((row) => <div className="workspace-compact-row" key={row.id}><strong>{row.label}</strong><span>{euro(row.grossProfitMinor)}</span><small>{pctBps(row.grossMarginBps)} gross · {euro(row.contributionMinor)} contribution</small></div>)}
        </div>
      </WorkspaceRecordDetails>
    </section>

    <section className="shell vendor-section"><div className="workspace-inline-note"><strong>Accounting boundary:</strong> contribution after marketplace fees is not statutory net profit or EBITDA. It does not include payroll, rent, corporate overhead, income tax, unattributed logistics or other operating expenses.</div></section>
  </main>;
}
