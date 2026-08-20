import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminActivationWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { WEB_BUILD_VERSION } from "../../../lib/build";

export const metadata: Metadata = { title: "Admin · Launch Readiness", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminActivationWorkspace(principal);
  const now = Date.now();
  const currentBuild = data.evidence.filter((row) => row.buildVersion === WEB_BUILD_VERSION);
  const freshPassed = currentBuild.filter((row) => row.status === "passed" && (!row.expiresAt || row.expiresAt > now));
  const expired = data.evidence.filter((row) => Boolean(row.expiresAt && row.expiresAt <= now)).length;
  const failed = currentBuild.filter((row) => row.status !== "passed").length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Platform · release gates · Activation evidence</div><h1>Launch Readiness</h1><p className="lead">Δες αν το τρέχον build έχει φρέσκο, πραγματικά εκτελεσμένο provider evidence — όχι απλώς configuration. Δεν σχετίζεται με vendor activation.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Current build", value: WEB_BUILD_VERSION },
      { label: "Current-build checks", value: currentBuild.length },
      { label: "Fresh passed", value: freshPassed.length, tone: freshPassed.length ? "positive" : "attention" },
      { label: "Failed / expired", value: failed + expired, tone: failed + expired ? "attention" : "positive", hint: `${failed} failed · ${expired} expired overall` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Durable evidence" title="Provider checks" note="Technical digest και timestamps είναι διαθέσιμα χωρίς να βαραίνουν το primary launch signal." />
      {data.evidence.length === 0 ? <WorkspaceEmptyState title="Δεν έχει καταγραφεί launch readiness evidence." body="Μετά τη ρύθμιση credentials/services, εκτέλεσε το staging preflight με record mode ώστε το αποτέλεσμα να γίνει durable evidence." /> : <div className="workspace-queue-list">{data.evidence.map((row) => {
        const isExpired = Boolean(row.expiresAt && row.expiresAt <= now);
        const isCurrent = row.buildVersion === WEB_BUILD_VERSION;
        return <article className="workspace-queue-card" key={row.id}>
          <div className="workspace-queue-head"><div><strong>{row.provider} · {row.checkName}</strong><small>{row.environment} · {isCurrent ? "current build" : `build ${row.buildVersion}`}</small></div><span className="status-pill">{row.status}{isExpired ? " · expired" : ""}</span></div>
          <div className="workspace-queue-primary"><span>{row.checkKind}</span><span>{new Date(row.observedAt).toLocaleString("el-GR")}</span>{row.expiresAt && <span>Expires {new Date(row.expiresAt).toLocaleString("el-GR")}</span>}</div>
          <WorkspaceRecordDetails label="Evidence digest & record metadata"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Evidence digest</strong><span>{row.evidenceDigest}</span></div><div className="workspace-compact-row"><strong>Build</strong><span>{row.buildVersion}</span></div><div className="workspace-compact-row"><strong>Evidence ID</strong><span>{row.id}</span></div></div></WorkspaceRecordDetails>
        </article>;
      })}</div>}
    </section>
  </main>;
}
