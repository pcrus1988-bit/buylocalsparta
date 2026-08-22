import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminActionButton } from "../../../components/AdminActionButton";
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
  const expired = currentBuild.filter((row) => Boolean(row.expiresAt && row.expiresAt <= now)).length;
  const failed = currentBuild.filter((row) => row.status === "failed").length;
  const blocked = currentBuild.filter((row) => row.status === "blocked").length;
  const skipped = currentBuild.filter((row) => row.status === "skipped").length;
  const canRun = principal.roles.includes("super_admin");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Platform · release gates · Activation evidence</div><h1>Launch Readiness</h1><p className="lead">Φρέσκο evidence από πραγματικούς, read-only ελέγχους των production providers. Disabled υπηρεσίες καταγράφονται ως skipped — ποτέ ως passed.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Current build", value: WEB_BUILD_VERSION },
      { label: "Fresh passed", value: freshPassed.length, tone: freshPassed.length ? "positive" : "attention" },
      { label: "Failed / blocked", value: failed + blocked, tone: failed + blocked ? "attention" : "positive", hint: `${failed} failed · ${blocked} blocked` },
      { label: "Skipped / expired", value: skipped + expired, tone: expired ? "attention" : "default", hint: `${skipped} skipped · ${expired} expired` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Production verification" title="Run fresh provider checks" note="Ελέγχει PostgreSQL, Viva, AADE myDATA, Resend, search, object storage, BOX NOW και το deployed web. Δεν δημιουργεί πληρωμή, τιμολόγιο, email ή αποστολή." />
      {canRun ? <div className="workspace-inline-actions">
        <AdminActionButton label="Run production readiness checks" endpoint="/api/admin/activation/run" csrfToken={data.csrfToken} />
      </div> : <p className="workspace-muted">Η εκτέλεση και καταγραφή production evidence επιτρέπεται μόνο σε super admin. Το evidence παραμένει διαθέσιμο για ανάγνωση σύμφωνα με τα admin permissions.</p>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Durable evidence" title="Provider checks" note="Κάθε εκτέλεση γράφει append-only, build-scoped evidence με expiry και SHA-256 digest. Secrets και credentials δεν αποθηκεύονται στα details." />
      {data.evidence.length === 0 ? <WorkspaceEmptyState title="Δεν έχει καταγραφεί launch readiness evidence." body="Ο super admin μπορεί να εκτελέσει τους production readiness checks από την ενότητα παραπάνω. Μόνο οι έλεγχοι που εκτελέστηκαν επιτυχώς καταγράφονται ως passed." /> : <div className="workspace-queue-list">{data.evidence.map((row) => {
        const isExpired = Boolean(row.expiresAt && row.expiresAt <= now);
        const isCurrent = row.buildVersion === WEB_BUILD_VERSION;
        const details = Object.entries(row.details ?? {}).filter(([, value]) => value !== undefined && value !== null);
        return <article className="workspace-queue-card" key={row.id}>
          <div className="workspace-queue-head"><div><strong>{row.provider} · {row.checkName}</strong><small>{row.environment} · {isCurrent ? "current build" : `build ${row.buildVersion}`}</small></div><span className="status-pill">{row.status}{isExpired ? " · expired" : ""}</span></div>
          <div className="workspace-queue-primary"><span>{row.checkKind}</span><span>{new Date(row.observedAt).toLocaleString("el-GR")}</span>{row.expiresAt && <span>Expires {new Date(row.expiresAt).toLocaleString("el-GR")}</span>}</div>
          <WorkspaceRecordDetails label="Evidence details & digest"><div className="workspace-compact-list">
            {details.map(([key, value]) => <div className="workspace-compact-row" key={key}><strong>{key}</strong><span>{String(value)}</span></div>)}
            <div className="workspace-compact-row"><strong>Evidence digest</strong><span>{row.evidenceDigest}</span></div>
            <div className="workspace-compact-row"><strong>Build</strong><span>{row.buildVersion}</span></div>
            <div className="workspace-compact-row"><strong>Evidence ID</strong><span>{row.id}</span></div>
          </div></WorkspaceRecordDetails>
        </article>;
      })}</div>}
    </section>
  </main>;
}
