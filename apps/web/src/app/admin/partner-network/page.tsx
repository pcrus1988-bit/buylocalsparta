import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import {
  PARTNER_ATTRIBUTION_DAYS,
  PARTNER_BONUS_TIERS,
  PARTNER_COMMISSION_RATES_BPS,
  PARTNER_MAX_LEVELS,
  PARTNER_RANK_RULES,
  PARTNER_SUBSCRIPTION_RESIDUAL_MONTHS,
  formatEuroCents
} from "../../../lib/partner-network";
import { partnerNetworkAdminSnapshot } from "../../../lib/partner-network-runtime";

export const metadata: Metadata = { title: "Admin · Partner Network", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function percent(bps: number | undefined) { return bps == null ? "—" : `${(bps / 100).toLocaleString("el-GR")}%`; }

export default async function PartnerNetworkAdminPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "vendor.manage")) redirect("/admin");

  const snapshot = await partnerNetworkAdminSnapshot().catch(() => undefined);

  return <main className="vendor-app admin-app admin-partner-network">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Acquisition · Partner Network</div><h1>KONTA MOY Partner Network</h1><p className="lead">Three-level performance network for Greece-wide vendor acquisition. It pays for verified vendor revenue events, never for recruiting another Partner.</p></div>
    </section>

    {snapshot ? <WorkspaceMetricStrip items={[
      { label: "Partners", value: snapshot.totalPartners, tone: snapshot.activePartners ? "positive" : "default", hint: `${snapshot.activePartners} active` },
      { label: "Converted vendors", value: snapshot.convertedVendors, tone: snapshot.convertedVendors ? "positive" : "default", hint: "verified referral conversions" },
      { label: "Commission on hold", value: formatEuroCents(snapshot.heldAmountCents), tone: snapshot.heldAmountCents ? "attention" : "default", hint: "refund / clearance hold" },
      { label: "Payable", value: formatEuroCents(snapshot.payableAmountCents), tone: snapshot.payableAmountCents ? "attention" : "default", hint: `${snapshot.payoutsPending} pending payouts · ${formatEuroCents(snapshot.paidAmountCents)} paid` }
    ]} /> : <section className="shell vendor-section"><div className="workspace-action-bar"><span>Live Partner Network metrics will appear after migration 0224 is applied to the connected database.</span></div></section>}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Compensation policy" title="Revenue-derived only" note={`Maximum ${PARTNER_MAX_LEVELS} earning levels. Referral attribution lasts ${PARTNER_ATTRIBUTION_DAYS} days. Full subscription residuals run for months 1–${PARTNER_SUBSCRIPTION_RESIDUAL_MONTHS}.`} />
      <div className="admin-insight-table" role="table" aria-label="Partner commission policy">
        <div className="admin-insight-head" role="row"><span>Event</span><span>L1 / L2 / L3</span><span>Base</span></div>
        <div className="admin-insight-row" role="row"><span><strong>Activation</strong><small>cleared vendor activation</small></span><span><strong>{percent(PARTNER_COMMISSION_RATES_BPS.ACTIVATION[1])} / {percent(PARTNER_COMMISSION_RATES_BPS.ACTIVATION[2])} / {percent(PARTNER_COMMISSION_RATES_BPS.ACTIVATION[3])}</strong></span><span><small>activation fee</small></span></div>
        <div className="admin-insight-row" role="row"><span><strong>Subscription</strong><small>cleared monthly / annual subscription</small></span><span><strong>{percent(PARTNER_COMMISSION_RATES_BPS.SUBSCRIPTION[1])} / {percent(PARTNER_COMMISSION_RATES_BPS.SUBSCRIPTION[2])} / {percent(PARTNER_COMMISSION_RATES_BPS.SUBSCRIPTION[3])}</strong></span><span><small>subscription revenue</small></span></div>
        <div className="admin-insight-row" role="row"><span><strong>Marketplace</strong><small>after an eligible order/platform fee event</small></span><span><strong>{percent(PARTNER_COMMISSION_RATES_BPS.PLATFORM_COMMISSION[1])} / {percent(PARTNER_COMMISSION_RATES_BPS.PLATFORM_COMMISSION[2])} / {percent(PARTNER_COMMISSION_RATES_BPS.PLATFORM_COMMISSION[3])}</strong></span><span><small>KONTA MOY fee revenue — never GMV</small></span></div>
        <div className="admin-insight-row" role="row"><span><strong>After month 24</strong><small>direct relationship only</small></span><span><strong>{percent(PARTNER_COMMISSION_RATES_BPS.DIRECT_RENEWAL[1])} / — / —</strong></span><span><small>eligible renewal revenue</small></span></div>
      </div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Ranks" title="Performance unlocks network depth" note="Hub Partner remains a manual commercial approval even after the performance floor is met." />
      <div className="partner-workflow-grid">
        {Object.entries(PARTNER_RANK_RULES).map(([rank, rule]) => <div className="partner-workflow-card" key={rank}><span>{rule.unlockedLevels} level{rule.unlockedLevels > 1 ? "s" : ""}</span><strong>{rank.replaceAll("_", " ")}</strong><p>{rule.minPersonalActivePaidVendors} personal paid active{rule.minTeamActivePaidVendors ? ` · ${rule.minTeamActivePaidVendors} team active` : ""}{rule.minRetentionBps ? ` · ${percent(rule.minRetentionBps)} retention` : ""}</p><i>{rule.manualReviewRequired ? "manual approval" : "automatic qualification candidate"}</i></div>)}
      </div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Performance accelerator" title="Non-cumulative monthly bonus" note="Only verified, paid, non-refunded new vendors qualify. The highest reached tier is used once per month." />
      <div className="partner-workflow-grid">{PARTNER_BONUS_TIERS.map((tier) => <div className="partner-workflow-card" key={tier.paidNewVendors}><span>{tier.paidNewVendors} vendors</span><strong>{formatEuroCents(tier.amountCents)}</strong><p>Highest qualifying monthly tier</p><i>not cumulative</i></div>)}</div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Controls" title="Hard guardrails" note="These are program invariants, not optional sales guidance." />
      <div className="partner-workflow-grid">
        <div className="partner-workflow-card"><span>Recruitment</span><strong>€0</strong><p>No joining fee, no starter-pack requirement and no commission merely for adding a Partner.</p><i>hard-coded program config</i></div>
        <div className="partner-workflow-card"><span>Attribution</span><strong>One vendor</strong><p>Only one active attribution per vendor/subject. The hierarchy is snapshotted when the vendor converts.</p><i>anti-poaching / anti-cookie override</i></div>
        <div className="partner-workflow-card"><span>Ledger</span><strong>Append + reverse</strong><p>Financial event fields are immutable. Refunds and chargebacks create clawbacks instead of rewriting history.</p><i>idempotency key required</i></div>
        <div className="partner-workflow-card"><span>Payout</span><strong>Held first</strong><p>Cleared revenue enters a hold before becoming payable. Payout items are linked one-to-one to earning events.</p><i>audit-friendly settlement</i></div>
      </div>
      <div className="workspace-action-bar"><span>Vendor operations stay in the existing Partners workspace; this area governs acquisition-network economics.</span><Link className="button button-secondary" href="/admin/partners">Vendor Partners</Link></div>
    </div></section>
  </main>;
}
