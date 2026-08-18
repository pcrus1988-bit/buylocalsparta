import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminMaintenanceWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminMaintenanceWorkspace(principal); } catch { redirect("/admin"); }
  const now = Date.now();
  const failing = data.jobNames.filter((job) => (job.state?.consecutiveFailures ?? 0) > 0).length;
  const due = data.jobNames.filter((job) => !job.state || job.state.nextRunAt <= now).length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">System maintenance</div><h1>Jobs & search projection</h1><p className="lead">Δες μόνο ό,τι είναι due ή failing και τρέξε maintenance μέσα από το ίδιο governed runtime contract.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Jobs", value: data.jobNames.length },
      { label: "Due", value: due, tone: due ? "attention" : "positive" },
      { label: "Failures", value: failing, tone: failing ? "attention" : "positive" },
      { label: "Indexed products", value: data.indexedDocuments.length }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Scheduler" title="Maintenance jobs" note="Production scheduling remains worker-backed; this control executes currently due maintenance using the same lease/reconcile rules." action={<AdminActionButton label="Run due maintenance" endpoint="/api/admin/maintenance/run" csrfToken={data.csrfToken} />} />
      <div className="workspace-queue-list">{data.jobNames.map((job) => {
        const isDue = !job.state || job.state.nextRunAt <= now;
        const failures = job.state?.consecutiveFailures ?? 0;
        return <article className="workspace-queue-card" key={job.name}>
          <div className="workspace-queue-head"><div><strong>{job.name}</strong><small>{job.state ? `Next ${new Date(job.state.nextRunAt).toLocaleString("el-GR")}` : "Not yet leased"}</small></div><span className="status-pill">{failures ? `${failures} failures` : isDue ? "due" : "scheduled"}</span></div>
          <WorkspaceRecordDetails label="Scheduler state"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Consecutive failures</strong><span>{failures}</span></div>{job.state && <div className="workspace-compact-row"><strong>Next run</strong><span>{new Date(job.state.nextRunAt).toLocaleString("el-GR")}</span></div>}</div></WorkspaceRecordDetails>
        </article>;
      })}</div>
    </section>

    <section className="vendor-section section-tint"><div className="shell"><WorkspaceSectionHeading eyebrow="Search projection" title="Canonical index" note="Read-only signal for the number of canonical product documents currently projected into search." /><div className="workspace-page-empty"><div><div className="eyebrow">Indexed documents</div><h3>{data.indexedDocuments.length}</h3><p>Projection count only; search provider readiness remains visible in Operations.</p></div></div></div></section>
  </main>;
}
