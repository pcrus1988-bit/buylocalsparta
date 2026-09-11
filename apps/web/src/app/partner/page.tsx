import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../components/WorkspacePagePrimitives";
import { getAccountSession } from "../../lib/account-session";
import {
  PARTNER_ATTRIBUTION_DAYS,
  PARTNER_BONUS_TIERS,
  PARTNER_COMMISSION_RATES_BPS,
  PARTNER_RANK_RULES,
  PARTNER_SUBSCRIPTION_RESIDUAL_MONTHS,
  formatEuroCents,
  referralPath
} from "../../lib/partner-network";
import { partnerDashboardForUser } from "../../lib/partner-network-runtime";

export const metadata: Metadata = { title: "KONTA MOY Partner Network", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function percent(bps: number | undefined) { return bps == null ? "—" : `${(bps / 100).toLocaleString("el-GR")}%`; }

export default async function PartnerPage() {
  const principal = await getAccountSession();
  if (!principal || !principal.roles.includes("customer")) redirect("/login?next=%2Fpartner");

  const dashboard = await partnerDashboardForUser(principal.userId).catch(() => undefined);

  if (!dashboard) {
    return <main className="vendor-app">
      <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
        <div><div className="eyebrow">KONTA MOY Partner Network</div><h1>Build the local market. Build your income.</h1><p className="lead">Το Partner Network συνδέει πραγματικές επιχειρήσεις με το ΚΟΝΤΑ ΜΟΥ. Η συμμετοχή είναι δωρεάν και δεν υπάρχει αμοιβή για απλή στρατολόγηση άλλων Partners.</p></div>
      </section>
      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Enrollment" title="Ο λογαριασμός σου δεν είναι ακόμη Partner" note="Η ενεργοποίηση Partner γίνεται μετά την αποδοχή των Partner terms και τον έλεγχο των στοιχείων πληρωμής. Δεν δημιουργούμε οικονομική υποχρέωση ή referral hierarchy χωρίς αυτό το gate." />
        <div className="workspace-action-bar"><span>Μπορείς ήδη να δεις το μοντέλο αμοιβών. Η δημόσια εγγραφή ενεργοποιείται όταν εγκριθούν οι όροι Partner/KYC.</span><Link className="button button-secondary" href="/join">Vendor plans</Link></div>
      </section>
      <ProgramRules />
    </main>;
  }

  const path = referralPath(dashboard.partnerCode);
  return <main className="vendor-app">
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">KONTA MOY Partner Network</div><h1>{dashboard.rank.replaceAll("_", " ")}</h1><p className="lead">Partner code <strong>{dashboard.partnerCode}</strong>{dashboard.homeMarketName ? ` · ${dashboard.homeMarketName}` : ""}. Οι αμοιβές προκύπτουν μόνο από πραγματικές πληρωμές/πωλήσεις vendors.</p></div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Converted vendors", value: dashboard.personalConvertedVendors, tone: dashboard.personalConvertedVendors ? "positive" : "default", hint: "direct conversions" },
      { label: "Direct team", value: dashboard.directTeamPartners, tone: dashboard.directTeamPartners ? "positive" : "default", hint: "active Partners" },
      { label: "On hold", value: formatEuroCents(dashboard.heldAmountCents), tone: dashboard.heldAmountCents ? "attention" : "default", hint: "refund / payout hold" },
      { label: "Payable", value: formatEuroCents(dashboard.payableAmountCents), tone: dashboard.payableAmountCents ? "positive" : "default", hint: `${formatEuroCents(dashboard.paidAmountCents)} paid` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Your referral" title="Invite a real business" note={`Attribution lasts up to ${PARTNER_ATTRIBUTION_DAYS} days. A referral link records intent; commission is created only after a verified vendor and eligible cleared revenue event exist.`} />
      <div className="workspace-action-bar"><span><strong>{path}</strong></span><Link className="button button-secondary" href={path}>Open referral link</Link></div>
    </section>

    <ProgramRules />
  </main>;
}

function ProgramRules() {
  return <>
    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Compensation" title="Three levels, tied to real vendor revenue" note={`Full subscription residuals run for the first ${PARTNER_SUBSCRIPTION_RESIDUAL_MONTHS} months. Platform-commission sharing is calculated from KONTA MOY's commission revenue, never from vendor GMV.`} />
      <div className="admin-insight-table" role="table" aria-label="Partner compensation rates">
        <div className="admin-insight-head" role="row"><span>Revenue event</span><span>L1 / L2 / L3</span><span>Rule</span></div>
        <div className="admin-insight-row" role="row"><span><strong>Activation</strong><small>paid activation fee</small></span><span><strong>{percent(PARTNER_COMMISSION_RATES_BPS.ACTIVATION[1])} / {percent(PARTNER_COMMISSION_RATES_BPS.ACTIVATION[2])} / {percent(PARTNER_COMMISSION_RATES_BPS.ACTIVATION[3])}</strong></span><span><small>one eligible event</small></span></div>
        <div className="admin-insight-row" role="row"><span><strong>Subscription</strong><small>cleared monthly/annual fee</small></span><span><strong>{percent(PARTNER_COMMISSION_RATES_BPS.SUBSCRIPTION[1])} / {percent(PARTNER_COMMISSION_RATES_BPS.SUBSCRIPTION[2])} / {percent(PARTNER_COMMISSION_RATES_BPS.SUBSCRIPTION[3])}</strong></span><span><small>months 1–24</small></span></div>
        <div className="admin-insight-row" role="row"><span><strong>Marketplace</strong><small>KONTA MOY commission revenue</small></span><span><strong>{percent(PARTNER_COMMISSION_RATES_BPS.PLATFORM_COMMISSION[1])} / {percent(PARTNER_COMMISSION_RATES_BPS.PLATFORM_COMMISSION[2])} / {percent(PARTNER_COMMISSION_RATES_BPS.PLATFORM_COMMISSION[3])}</strong></span><span><small>not GMV</small></span></div>
      </div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ranks" title="Unlock depth by producing real vendor value" note="Recruiting another Partner by itself earns €0. Rank qualification is based on active paid vendor production and retention." />
      <div className="partner-workflow-grid">
        {Object.entries(PARTNER_RANK_RULES).map(([rank, rule]) => <div className="partner-workflow-card" key={rank}><span>{rule.unlockedLevels} earning level{rule.unlockedLevels > 1 ? "s" : ""}</span><strong>{rank.replaceAll("_", " ")}</strong><p>{rule.minPersonalActivePaidVendors} personal active paid vendors{rule.minTeamActivePaidVendors ? ` · ${rule.minTeamActivePaidVendors} active team vendors` : ""}{rule.minRetentionBps ? ` · ${percent(rule.minRetentionBps)} retention` : ""}</p><i>{rule.manualReviewRequired ? "manual HUB approval" : "performance qualification"}</i></div>)}
      </div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Accelerator" title="Monthly performance bonus" note="The highest achieved tier applies; tiers are non-cumulative and count only verified, paid, non-refunded new vendors." />
      <div className="partner-workflow-grid">{PARTNER_BONUS_TIERS.map((tier) => <div className="partner-workflow-card" key={tier.paidNewVendors}><span>{tier.paidNewVendors} new paid vendors</span><strong>{formatEuroCents(tier.amountCents)}</strong><p>Monthly performance tier</p><i>non-cumulative</i></div>)}</div>
    </div></section>
  </>;
}
