import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminCrawlerDashboard, cancelAdminCrawlerJob, createAdminCrawlerProfile, promoteAdminCrawlerJob, queueAdminCrawlerJob, queueAdminUniversalCrawlerJob } from "../../../lib/admin-catalogue-crawler";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Catalogue Crawler", robots: { index: false, follow: false, nocache: true } };

type CrawlerSearchParams = Promise<Record<string, string | string[] | undefined>>;

async function universalQueueAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession(); if (!principal) redirect("/admin/login");
  const rawUrl = String(formData.get("rootUrl") ?? "").trim();
  const mode = String(formData.get("mode") ?? "full");
  try {
    await queueAdminUniversalCrawlerJob(principal, {
      rootUrl: normalizeWebsiteInput(rawUrl),
      mode
    });
  } catch (error) {
    redirect(`/admin/catalogue-crawler?crawlError=${encodeURIComponent(errorMessage(error))}&crawlUrl=${encodeURIComponent(rawUrl)}&crawlMode=${encodeURIComponent(mode)}`);
  }
  revalidatePath("/admin/catalogue-crawler");
  redirect("/admin/catalogue-crawler?crawlQueued=1");
}
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
  const jobId = String(formData.get("jobId") ?? "").trim();
  let promotionError: string | undefined;
  try {
    await promoteAdminCrawlerJob(principal, jobId);
  } catch (error) {
    promotionError = errorMessage(error);
  }
  if (promotionError) redirect(`/admin/catalogue-crawler?promotionError=${encodeURIComponent(promotionError)}&promotionJob=${encodeURIComponent(jobId)}`);
  revalidatePath("/admin/catalogue-crawler");
  revalidatePath("/admin/catalogue-intake");
  redirect(`/admin/catalogue-crawler?promotionImported=1&promotionJob=${encodeURIComponent(jobId)}`);
}

export default async function Page({ searchParams }: { searchParams: CrawlerSearchParams }) {
  const principal = await getAdminSession(); if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const crawlError = one(params.crawlError);
  const crawlUrl = one(params.crawlUrl) ?? "";
  const requestedMode = one(params.crawlMode);
  const crawlMode = requestedMode === "single" || requestedMode === "discovery" ? requestedMode : "full";
  const crawlQueued = one(params.crawlQueued) === "1";
  const promotionError = one(params.promotionError);
  const promotionImported = one(params.promotionImported) === "1";
  const promotionJob = one(params.promotionJob);
  const data = await adminCrawlerDashboard(principal);
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} entityLabel="Catalogue Crawler" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue · product acquisition</div>
        <h1>Add products from any website</h1>
        <p className="lead">Paste an online shop URL. KONTA MOU creates the protected source boundary automatically, discovers catalogue pages and extracts product data into the Supplier PIM review pipeline.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Normal workflow</span>
        <strong>URL → Crawl → PIM</strong>
        <p>No crawler profile setup is required. Robots compliance, host restrictions, rate limits and isolated worker execution remain enforced automatically.</p>
      </aside>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Start here" title="Crawl an online shop" note="Paste a shop address with or without https://. For one specific product, paste its product page and choose Single page." />
      {crawlError&&<div className="workspace-queue-card" role="alert" style={{marginBottom:"1rem"}}>
        <strong>Could not start this crawl</strong>
        <p>{crawlError}</p>
        <small>Your entry was kept below so you can correct it and try again.</small>
      </div>}
      {crawlQueued&&<div className="workspace-queue-card" role="status" style={{marginBottom:"1rem"}}>
        <strong>Crawl queued successfully</strong>
        <p>The crawler worker will pick it up automatically. Progress appears in Recent catalogue crawls below.</p>
      </div>}
      <form action={universalQueueAction} className="admin-directory-filters">
        <label style={{gridColumn:"1 / -1"}}>
          <span>Website URL</span>
          <input name="rootUrl" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="polo.gr or https://www.polo.gr/" defaultValue={crawlUrl} required />
        </label>
        <label>
          <span>What do you want to crawl?</span>
          <select name="mode" defaultValue={crawlMode}>
            <option value="full">Entire catalogue · recommended</option>
            <option value="single">Only this exact product/page</option>
            <option value="discovery">Discovery scan only</option>
          </select>
        </label>
        <div>
          <button className="button button-primary" type="submit">Start catalogue crawl</button>
        </div>
      </form>
      <div className="workspace-action-bar">
        <span>The crawler automatically attempts titles, descriptions, GTIN/EAN, SKU/MPN, brand/model, categories, images, prices and variant attributes when the source exposes them.</span>
        <Link className="button button-secondary" href="/admin/catalogue-intake">Open Supplier PIM</Link>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label:"Ready queue", value:data.health.queuedReady }, { label:"Running", value:data.health.running },
      { label:"Completed 24h", value:data.health.completedLast24h },
      { label:"Failed 24h", value:data.health.failedLast24h, tone:data.health.failedLast24h?"attention":"default" },
      { label:"Expired leases", value:data.health.expiredLeases, tone:data.health.expiredLeases?"attention":"default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Progress" title="Recent catalogue crawls" note="A completed full crawl can be imported into Supplier PIM only when the same server-side readiness gate used by the import action is green. Canonical matching, taxonomy and duplicate review continue in Supplier PIM instead of publishing raw crawl data directly." />
      {promotionError&&<div className="workspace-queue-card" role="alert" style={{marginBottom:"1rem"}}>
        <strong>Could not import this crawl into Supplier PIM</strong>
        <p>{promotionError}</p>
        <small>{promotionJob?`Crawl job ${promotionJob}. `:""}The crawl evidence remains intact; nothing was published or deleted.</small>
      </div>}
      {promotionImported&&<div className="workspace-queue-card" role="status" style={{marginBottom:"1rem"}}>
        <strong>Products imported to Supplier PIM</strong>
        <p>The crawl evidence was normalized and promoted successfully. You can now review the imported catalogue or assign the snapshot to a vendor.</p>
        {promotionJob&&<small>Crawl job {promotionJob}</small>}
      </div>}
      {data.jobs.length===0 ? <WorkspaceEmptyState title="No catalogue crawls yet." body="Paste a shop URL above to start the first crawl."/> : <div className="workspace-queue-list">{data.jobs.map((job)=>{
        const promotionCandidate = isPromotionCandidate(job.status, job.crawlMode, job.promoted);
        return <article key={job.id} className="workspace-queue-card">
          <div className="workspace-queue-head">
            <div><strong>{job.sourceName}</strong><small>{job.seedUrl??job.rootUrl} · {humanMode(job.crawlMode)} · created {when(job.createdAt)}</small></div>
            <span className="status-pill">{humanStatus(job.status)}</span>
          </div>
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Pages</strong><span>{job.fetched} fetched · {job.skipped} skipped · {job.failed} failed · {job.discovered} discovered</span></div>
            <div className="workspace-compact-row"><strong>Products</strong><span>{job.extracted} extracted · {job.review} need review · {job.promoted} imported to PIM</span></div>
            {promotionCandidate&&<div className="workspace-compact-row">
              <strong>PIM import readiness</strong>
              <span>{job.promotionReadiness.ready
                ? `${job.promotionReadiness.acceptedProductCount} accepted product${job.promotionReadiness.acceptedProductCount===1?"":"s"} · ready to import`
                : `Blocked · ${job.promotionReadiness.blockers.map((blocker)=>blocker.message).join(" ")}`}</span>
            </div>}
            {job.failureReason&&<div className="workspace-compact-row"><strong>Problem</strong><span>{job.failureReason}</span></div>}
          </div>
          <div className="workspace-action-bar">
            <span>{job.completedAt?`Completed ${when(job.completedAt)}`:`Attempt ${job.attemptCount}${job.lastHeartbeatAt?` · active ${when(job.lastHeartbeatAt)}`:""}`}</span>
            <div>
              {(["queued","running"] as const).includes(job.status as any)&&<form action={cancelAction} style={{display:"inline"}}><input type="hidden" name="jobId" value={job.id}/><button className="button button-secondary" type="submit">Cancel</button></form>}
              {promotionCandidate&&job.promotionReadiness.ready&&<form action={promoteAction} style={{display:"inline"}}><input type="hidden" name="jobId" value={job.id}/><button className="button button-primary" type="submit">Import products to PIM</button></form>}
              {promotionCandidate&&!job.promotionReadiness.ready&&<button className="button button-secondary" type="button" disabled title={job.promotionReadiness.blockers.map((blocker)=>blocker.message).join(" ")}>Import blocked</button>}
              {job.promoted>0&&<Link className="button button-secondary" href="/admin/catalogue-intake">Review imported products</Link>}
            </div>
          </div>
        </article>;
      })}</div>}
    </section>

    <section className="shell vendor-section">
      <details className="workspace-queue-card">
        <summary><strong>Advanced crawler settings</strong> · profiles, allowlists and manual queue controls</summary>
        <div style={{marginTop:"1rem"}}>
          <WorkspaceSectionHeading eyebrow="Advanced" title="Crawler safety profiles" note="These controls remain available for exceptional sources. The normal URL-first crawler above creates and reuses safe profiles automatically." />
          <form action={createProfileAction} className="admin-directory-filters">
            <label><span>Catalog source</span><select name="sourceId" required defaultValue=""><option value="" disabled>Select source</option>{data.sources.map((s)=><option key={s.id} value={s.id}>{s.name} · {s.code}</option>)}</select></label>
            <label><span>Profile code</span><input name="profileCode" defaultValue="main" required /></label>
            <label><span>Root URL</span><input name="rootUrl" type="url" placeholder="https://supplier.example/" required /></label>
            <label><span>Allowed hosts</span><input name="allowedHosts" placeholder="supplier.example,www.supplier.example" /></label>
            <label><span>Max pages</span><input name="maxPages" type="number" min="1" max="250000" defaultValue="10000" /></label>
            <label><span>Max depth</span><input name="maxDepth" type="number" min="0" max="64" defaultValue="12" /></label>
            <label><span>Requests / sec</span><input name="requestsPerSecond" type="number" min="0.01" max="20" step="0.01" defaultValue="1" /></label>
            <div><button className="button button-secondary" type="submit">Create manual profile</button></div>
          </form>
          {data.profiles.length===0 ? <WorkspaceEmptyState title="No crawler profiles configured."/> : <div className="workspace-queue-list">{data.profiles.map((p)=><article key={p.id} className="workspace-queue-card">
            <div className="workspace-queue-head"><div><strong>{p.sourceName} · {p.profileCode}</strong><small>{p.rootUrl}</small></div><span className="status-pill">{p.active?"active":"disabled"}</span></div>
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Allowlist</strong><span>{p.allowedHosts.join(", ")}</span></div>
              <div className="workspace-compact-row"><strong>Policy</strong><span>{p.maxPages} pages · depth {p.maxDepth} · {p.requestsPerSecond}/s · robots {p.obeyRobots?"on":"off"}</span></div>
            </div>
          </article>)}</div>}

          <WorkspaceSectionHeading eyebrow="Advanced" title="Manual queue" note="Use this only when you intentionally need an existing profile, category seed or other controlled acquisition mode." />
          <form action={queueAction} className="admin-directory-filters">
            <label><span>Profile</span><select name="profileId" required defaultValue=""><option value="" disabled>Select profile</option>{data.profiles.filter((p)=>p.active).map((p)=><option key={p.id} value={p.id}>{p.sourceName} · {p.profileCode}</option>)}</select></label>
            <label><span>Mode</span><select name="mode" defaultValue="full"><option value="discovery">Discovery</option><option value="full">Full</option><option value="category">Category</option><option value="single">Single page</option></select></label>
            <label><span>Optional seed URL</span><input name="seedUrl" type="url" placeholder="Profile root when blank" /></label>
            <div><button className="button button-secondary" type="submit">Queue manual crawl</button></div>
          </form>
        </div>
      </details>
    </section>
  </main>;
}

function normalizeWebsiteInput(value: string): string {
  const raw = value.trim();
  if (!raw) return raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return `https://${raw.replace(/^\/+/, "")}`;
  const url = new URL(raw);
  if (url.protocol === "http:") url.protocol = "https:";
  return url.toString();
}
function isPromotionCandidate(status:string,crawlMode:string,promoted:number):boolean { return (status==="succeeded"||status==="partial")&&crawlMode!=="discovery"&&promoted===0; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error || "Something went wrong"); }
function one(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
function numberValue(value: FormDataEntryValue | null): number | undefined { if(value==null||String(value).trim()==="") return undefined; const n=Number(value); return Number.isFinite(n)?n:undefined; }
function when(value:number):string { return new Intl.DateTimeFormat("el-GR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Athens"}).format(new Date(value)); }
function humanMode(value:string):string { return value==="full"?"full catalogue":value==="single"?"single page":value==="discovery"?"discovery scan":value; }
function humanStatus(value:string):string { return value.replaceAll("_"," "); }