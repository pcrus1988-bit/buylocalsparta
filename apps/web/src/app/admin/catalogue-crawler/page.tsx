import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminCrawlerDashboard, cancelAdminCrawlerJob, createAdminCrawlerProfile, promoteAdminCrawlerJob, queueAdminCrawlerJob } from "../../../lib/admin-catalogue-crawler";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Catalogue Crawler", robots: { index: false, follow: false, nocache: true } };

async function createProfileAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession(); if (!principal) redirect("/admin/login");
  await createAdminCrawlerProfile(principal, {
    sourceId: String(formData.get("sourceId") ?? ""), profileCode: String(formData.get("profileCode") ?? "main"), rootUrl: String(formData.get("rootUrl") ?? ""),
    allowedHosts: String(formData.get("allowedHosts") ?? ""), maxPages: numberValue(formData.get("maxPages")), maxDepth: numberValue(formData.get("maxDepth")), requestsPerSecond: numberValue(formData.get("requestsPerSecond"))
  });
  revalidatePath("/admin/catalogue-crawler");
}
async function queueAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession(); if (!principal) redirect("/admin/login");
  await queueAdminCrawlerJob(principal, { profileId: String(formData.get("profileId") ?? ""), mode: String(formData.get("mode") ?? "full"), seedUrl: String(formData.get("seedUrl") ?? "") || undefined });
  revalidatePath("/admin/catalogue-crawler");
}
async function cancelAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession(); if (!principal) redirect("/admin/login");
  await cancelAdminCrawlerJob(principal, String(formData.get("jobId") ?? ""));
  revalidatePath("/admin/catalogue-crawler");
}
async function promoteAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession(); if (!principal) redirect("/admin/login");
  await promoteAdminCrawlerJob(principal, String(formData.get("jobId") ?? ""));
  revalidatePath("/admin/catalogue-crawler"); revalidatePath("/admin/catalogue-intake");
}

export default async function Page() {
  const principal = await getAdminSession(); if (!principal) redirect("/admin/login");
  const data = await adminCrawlerDashboard(principal);
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} entityLabel="Catalogue Crawler" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Catalog · acquisition infrastructure</div><h1>Catalogue Crawler</h1><p className="lead">Governed acquisition queue for supplier websites. Jobs run only in the isolated crawler worker; Admin requests never perform crawling inside the web process.</p></div>
      <aside className="dashboard-health-card"><span>Execution model</span><strong>Isolated worker</strong><p>Robots, host allowlists, leases, retries, cancellation and immutable PIM promotion remain enforced server-side.</p></aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label:"Ready queue", value:data.health.queuedReady }, { label:"Running", value:data.health.running },
      { label:"Cancel requested", value:data.health.cancellationRequested, tone:data.health.cancellationRequested?"attention":"default" },
      { label:"Expired leases", value:data.health.expiredLeases, tone:data.health.expiredLeases?"attention":"default" },
      { label:"Completed 24h", value:data.health.completedLast24h }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Source boundary" title="Crawl profiles" note="A profile freezes the safe crawl boundary. HTTPS, robots compliance and explicit host allowlists are the default." />
      <form action={createProfileAction} className="admin-directory-filters">
        <label><span>Catalog source</span><select name="sourceId" required defaultValue=""><option value="" disabled>Select source</option>{data.sources.map((s)=><option key={s.id} value={s.id}>{s.name} · {s.code}</option>)}</select></label>
        <label><span>Profile code</span><input name="profileCode" defaultValue="main" required /></label>
        <label><span>Root URL</span><input name="rootUrl" type="url" placeholder="https://supplier.example/" required /></label>
        <label><span>Allowed hosts</span><input name="allowedHosts" placeholder="supplier.example,www.supplier.example" /></label>
        <label><span>Max pages</span><input name="maxPages" type="number" min="1" max="250000" defaultValue="10000" /></label>
        <label><span>Max depth</span><input name="maxDepth" type="number" min="0" max="64" defaultValue="12" /></label>
        <label><span>Requests / sec</span><input name="requestsPerSecond" type="number" min="0.01" max="20" step="0.01" defaultValue="1" /></label>
        <div><button className="button button-secondary" type="submit">Create safe profile</button></div>
      </form>
      {data.profiles.length===0 ? <WorkspaceEmptyState title="No crawler profiles configured." body="Create one from an existing catalogue source before queueing acquisition work."/> : <div className="workspace-queue-list">{data.profiles.map((p)=><article key={p.id} className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>{p.sourceName} · {p.profileCode}</strong><small>{p.rootUrl}</small></div><span className="status-pill">{p.active?"active":"disabled"}</span></div><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Allowlist</strong><span>{p.allowedHosts.join(", ")}</span></div><div className="workspace-compact-row"><strong>Policy</strong><span>{p.maxPages} pages · depth {p.maxDepth} · {p.requestsPerSecond}/s · robots {p.obeyRobots?"on":"off"}</span></div></div></article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Durable queue" title="Queue acquisition" note="This only creates a database job. The persistent crawler worker claims it with a crash-recovery lease." />
      <form action={queueAction} className="admin-directory-filters">
        <label><span>Profile</span><select name="profileId" required defaultValue=""><option value="" disabled>Select profile</option>{data.profiles.filter((p)=>p.active).map((p)=><option key={p.id} value={p.id}>{p.sourceName} · {p.profileCode}</option>)}</select></label>
        <label><span>Mode</span><select name="mode" defaultValue="full"><option value="discovery">Discovery</option><option value="full">Full</option><option value="category">Category</option><option value="single">Single page</option></select></label>
        <label><span>Optional seed URL</span><input name="seedUrl" type="url" placeholder="Profile root when blank" /></label>
        <div><button className="button button-primary" type="submit">Queue crawl job</button></div>
      </form>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Operations" title="Recent crawl jobs" note="Promotion is explicit and only available after a succeeded or partial acquisition. It creates immutable supplier PIM evidence, not offers or public products." />
      {data.jobs.length===0 ? <WorkspaceEmptyState title="No crawler jobs yet."/> : <div className="workspace-queue-list">{data.jobs.map((job)=><article key={job.id} className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>{job.sourceName} · {job.crawlMode}</strong><small>{job.seedUrl??job.profileCode} · created {when(job.createdAt)}</small></div><span className="status-pill">{job.status.replaceAll("_"," ")}</span></div><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Pages</strong><span>{job.fetched} fetched · {job.skipped} skipped · {job.failed} failed · {job.discovered} discovered</span></div><div className="workspace-compact-row"><strong>Products</strong><span>{job.extracted} extracted · {job.review} review · {job.promoted} promoted</span></div><div className="workspace-compact-row"><strong>Worker</strong><span>{job.claimedBy??"not leased"}{job.lastHeartbeatAt?` · heartbeat ${when(job.lastHeartbeatAt)}`:""}{job.cancelRequestedAt?" · cancellation requested":""}</span></div>{job.failureReason&&<div className="workspace-compact-row"><strong>Failure</strong><span>{job.failureReason}</span></div>}</div><div className="workspace-action-bar"><span>Attempt {job.attemptCount}{job.completedAt?` · completed ${when(job.completedAt)}`:""}</span><div>{(["queued","running"] as const).includes(job.status as any)&&<form action={cancelAction} style={{display:"inline"}}><input type="hidden" name="jobId" value={job.id}/><button className="button button-secondary" type="submit">Cancel</button></form>} {(["succeeded","partial"] as const).includes(job.status as any)&&<form action={promoteAction} style={{display:"inline"}}><input type="hidden" name="jobId" value={job.id}/><button className="button button-primary" type="submit">Promote to PIM</button></form>}</div></div></article>)}</div>}
      <div className="workspace-action-bar"><span>Promoted crawl evidence appears in Supplier PIM Intake for review and canonical matching.</span><Link className="button button-secondary" href="/admin/catalogue-intake">Open Supplier PIM Intake</Link></div>
    </section>
  </main>;
}

function numberValue(value: FormDataEntryValue | null): number | undefined { if(value==null||String(value).trim()==="") return undefined; const n=Number(value); return Number.isFinite(n)?n:undefined; }
function when(value:number):string { return new Intl.DateTimeFormat("el-GR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Athens"}).format(new Date(value)); }
