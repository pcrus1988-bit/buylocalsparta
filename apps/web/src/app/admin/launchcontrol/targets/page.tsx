import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { normalizeLaunchControlFilters } from "../../../../lib/admin-launch-control";
import { adminLaunchControlIntegrityWorkspace } from "../../../../lib/admin-launch-control-integrity";
import {
  buildLaunchControlTargetProgress,
  type LaunchControlTargetProgress,
  type LaunchControlTargetStatus
} from "../../../../lib/admin-launch-control-target-progress";
import { getAdminSession } from "../../../../lib/admin-session";
import { TargetEditor } from "./TargetEditor";
import styles from "./targets.module.css";

export const metadata: Metadata = { title: "Admin · Launch Targets", robots: { index: false, follow: false } };

function valueLabel(item: LaunchControlTargetProgress, value: number | undefined): string {
  if (value === undefined) return "—";
  if (item.unit === "money_minor") return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
  if (item.unit === "ratio") return `${(value * 100).toFixed(1)}%`;
  return Math.round(value).toLocaleString("el-GR");
}

function paceLabel(item: LaunchControlTargetProgress, value: number | undefined): string {
  if (value === undefined) return "—";
  if (item.unit === "money_minor") return `${new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)}/day`;
  if (item.unit === "ratio") return `${(value * 100).toFixed(2)} pp/day`;
  return `${value.toFixed(2)}/day`;
}

function statusLabel(status: LaunchControlTargetStatus): string {
  return status.replaceAll("_", " ");
}

function statusNote(item: LaunchControlTargetProgress): string {
  switch (item.status) {
    case "unset": return "No governed target. This metric remains informational only.";
    case "unavailable": return "The authoritative current metric is unavailable, so no pace classification is made.";
    case "tracking": return "Baseline captured. At least one full day of observed change is required before classifying pace.";
    case "on_track": return `Observed trajectory projects ${valueLabel(item, item.projectedAtDeadline)} by the deadline.`;
    case "at_risk": return `Observed trajectory projects ${valueLabel(item, item.projectedAtDeadline)} by the deadline, below target.`;
    case "achieved": return "Current authoritative value has reached or exceeded the governed target.";
    case "overdue": return "Deadline has passed while the authoritative current value remains below target.";
  }
}

export default async function LaunchControlTargetsPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!principal.roles.includes("super_admin")) redirect("/admin");

  const data = await adminLaunchControlIntegrityWorkspace(principal, normalizeLaunchControlFilters({}));
  const settings = data.targetSettings;
  const progress = settings ? buildLaunchControlTargetProgress(data, settings) : [];
  const configured = progress.filter((item) => item.status !== "unset" && item.status !== "unavailable").length;
  const atRisk = progress.filter((item) => item.status === "at_risk" || item.status === "overdue").length;
  const achieved = progress.filter((item) => item.status === "achieved").length;

  return <main className={`vendor-app admin-app admin-launch-control ${styles.targetsPage}`}>
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined lc-target-hero">
      <div>
        <div className="eyebrow">Launch Control · Governed business targets</div>
        <h1>Targets & pace-to-target</h1>
        <p className="lead">Define explicit Sparta targets without changing the underlying KPI truth. Each target records its authoritative baseline when saved, then compares observed change with the pace required to reach the deadline.</p>
        <div className="lc-link-row"><Link href="/admin/launchcontrol/overview">← Command Center</Link><Link href="/admin/analytics">Analytics →</Link><Link href="/admin/partners">Partners →</Link></div>
      </div>
      <aside className="lc-target-hero-summary">
        <span>Governed targets</span><strong>{configured}/6</strong>
        <small>{achieved} achieved · {atRisk} at risk/overdue</small>
      </aside>
    </section>

    {!settings ? <section className="shell vendor-section"><div className="lc-unavailable-panel"><strong>Target configuration unavailable</strong><span>The governed system-settings source could not be loaded. No empty or zero target is inferred.</span></div></section> : <>
      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Configuration" title="Set only targets you actually govern" note={`Sparta target document version ${settings.version}. Clearing both fields removes a target. Changes are super-admin-only, CSRF protected, version checked and recorded in the Admin audit trail.`} />
        <TargetEditor csrfToken={principal.csrfToken} settings={settings} />
      </section>

      <section className="vendor-section section-tint"><div className="shell">
        <WorkspaceSectionHeading eyebrow="Trajectory" title="Current → target → deadline → pace" note="Actual pace is change per day since the target baseline was captured. Required pace is the remaining gap divided by remaining calendar days. Rolling 30-day metrics are therefore trajectory signals, not a substitute for detailed finance or analytics reports." />
        <div className="lc-target-grid">{progress.map((item) => <article className={`lc-target-card is-${item.status}`} key={item.key}>
          <div className="lc-target-card-head"><div><span>{item.label}</span><small>{item.description}</small></div><b className={`lc-target-status is-${item.status}`}>{statusLabel(item.status)}</b></div>
          <div className="lc-target-values"><div><span>Current</span><strong>{valueLabel(item, item.current)}</strong></div><div><span>Target</span><strong>{valueLabel(item, item.target)}</strong></div><div><span>Remaining</span><strong>{valueLabel(item, item.remaining)}</strong></div></div>
          <div className="lc-target-progress"><i style={{ width: `${Math.round((item.completion ?? 0) * 100)}%` }} /></div>
          <div className="lc-target-meta"><div><span>Deadline</span><strong>{item.deadline ?? "—"}</strong></div><div><span>Days left</span><strong>{item.daysRemaining ?? "—"}</strong></div><div><span>Observed pace</span><strong>{paceLabel(item, item.actualDailyChange)}</strong></div><div><span>Required pace</span><strong>{paceLabel(item, item.requiredDailyChange)}</strong></div></div>
          <p>{statusNote(item)}</p>
          {item.baselineAt ? <small className="lc-target-baseline">Baseline {valueLabel(item, item.baselineValue)} · {new Date(item.baselineAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}</small> : null}
        </article>)}</div>
      </div></section>
    </>}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Governance" title="What a target does—and does not do" note="Targets never rewrite transactions, analytics, SEO eligibility or forecasts. They provide a governed denominator and trajectory layer above authoritative sources." />
      <div className="lc-target-rules"><div><strong>Readiness</strong><span>Active Vendors becomes measurable only when its target exists.</span></div><div><strong>Baselines</strong><span>A changed value or deadline captures a fresh current-value baseline automatically.</span></div><div><strong>Concurrency</strong><span>Version conflicts are rejected instead of silently overwriting another Admin session.</span></div><div><strong>Audit</strong><span>Every successful target-document write records a Launch Control Admin audit event.</span></div></div>
    </section>
  </main>;
}
