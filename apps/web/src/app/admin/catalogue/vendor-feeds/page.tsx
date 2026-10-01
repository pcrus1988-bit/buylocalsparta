import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import {
  adminForceVendorProductFeedSync,
  adminSetVendorProductFeedStatus,
  adminVendorProductFeedWorkspace
} from "../../../../lib/admin-vendor-product-feed-service";
import { getAdminSession } from "../../../../lib/admin-session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SearchParams = {
  q?: string;
  status?: string;
  saved?: string;
  error?: string;
};

async function manageFeed(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const feedId = String(formData.get("feedId") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  if (!feedId) redirect("/admin/catalogue/vendor-feeds?error=missing_feed");

  let saved = "";
  let error = "";
  try {
    if (action === "sync") {
      await adminForceVendorProductFeedSync(principal, feedId);
      saved = "synced";
    } else if (action === "pause") {
      await adminSetVendorProductFeedStatus(principal, feedId, "paused");
      saved = "paused";
    } else if (action === "resume") {
      await adminSetVendorProductFeedStatus(principal, feedId, "active");
      saved = "resumed";
    } else {
      throw new Error("Άγνωστη ενέργεια feed.");
    }
    revalidatePath("/admin/catalogue/vendor-feeds");
  } catch (cause) {
    error = cause instanceof Error ? cause.message.slice(0, 240) : "Η ενέργεια απέτυχε.";
  }

  const search = new URLSearchParams();
  if (saved) search.set("saved", saved);
  if (error) search.set("error", error);
  redirect(`/admin/catalogue/vendor-feeds?${search.toString()}`);
}

const when = (value?: number) => value
  ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value))
  : "—";

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const params = await searchParams;
  const data = await adminVendorProductFeedWorkspace(principal);
  const query = params.q?.trim().toLocaleLowerCase("el-GR") ?? "";
  const status = params.status?.trim() ?? "all";
  const feeds = data.feeds.filter((feed) => {
    if (status !== "all" && feed.status !== status) return false;
    if (!query) return true;
    return [feed.vendorName, feed.vendorId, feed.name, feed.sourceUrl, feed.sourceFilename]
      .some((value) => value?.toLocaleLowerCase("el-GR").includes(query));
  });

  const active = data.feeds.filter((feed) => feed.status === "active").length;
  const errorFeeds = data.feeds.filter((feed) => feed.errorCount > 0 || Boolean(feed.lastError)).length;
  const linkedOffers = data.feeds.reduce((sum, feed) => sum + feed.linkedOffers, 0);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} entityLabel="Vendor XML Feeds" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue · Vendor Product Feeds</div>
        <h1>XML Feed control centre</h1>
        <p className="lead">Παρακολούθησε vendor XML feeds, errors, reconciliation και sync history. Force sync και pause/resume παραμένουν governed Admin actions και δεν παρακάμπτουν το canonical product workflow.</p>
        <div className="workspace-action-buttons">
          <Link className="button button-secondary" href="/admin/catalogue">← Catalogue Operations</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Feeds", value: data.feeds.length },
      { label: "Active URL feeds", value: active, tone: active ? "positive" : "default" },
      { label: "Feeds with issues", value: errorFeeds, tone: errorFeeds ? "attention" : "positive" },
      { label: "Linked offers", value: linkedOffers }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Filters"
        title="Vendor feeds"
        note="Search by vendor, feed name or source. The list is bounded to the 250 most recently relevant feeds."
      />
      <form className="workspace-action-bar" method="get">
        <input className="workspace-input" name="q" defaultValue={params.q ?? ""} placeholder="Vendor, feed, URL…" />
        <select className="workspace-select" name="status" defaultValue={status}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Upload completed</option>
          <option value="error">Error</option>
        </select>
        <button className="button button-secondary" type="submit">Filter</button>
      </form>

      {params.saved && <div className="workspace-inline-note" role="status"><strong>Feed updated.</strong> {params.saved === "synced" ? "Ο συγχρονισμός ολοκληρώθηκε." : params.saved === "paused" ? "Το automatic sync σταμάτησε." : "Το automatic sync ενεργοποιήθηκε."}</div>}
      {params.error && <div className="workspace-inline-note" role="alert"><strong>Η ενέργεια απέτυχε.</strong> {params.error}</div>}

      <div className="workspace-queue-list">
        {feeds.map((feed) => <article className="workspace-queue-card" key={feed.id}>
          <div className="workspace-queue-head">
            <div>
              <strong>{feed.vendorName} · {feed.name}</strong>
              <small>{feed.id} · {feed.sourceType === "url" ? `κάθε ${feed.syncIntervalMinutes / 60}h` : "one-time upload"}</small>
            </div>
            <span className="status-pill">{feed.status}</span>
          </div>

          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Feed products</strong><span>{feed.productCount.toLocaleString("el-GR")} · {feed.readyCount.toLocaleString("el-GR")} ready · {feed.errorCount.toLocaleString("el-GR")} errors</span></div>
            <div className="workspace-compact-row"><strong>Reconciliation</strong><span>{feed.presentItems.toLocaleString("el-GR")} present · {feed.missingItems.toLocaleString("el-GR")} missing · {feed.retiredItems.toLocaleString("el-GR")} retired</span></div>
            <div className="workspace-compact-row"><strong>Canonical / offers</strong><span>{feed.linkedOffers.toLocaleString("el-GR")} feed items linked to vendor offers</span></div>
            <div className="workspace-compact-row"><strong>Last sync</strong><span>{when(feed.lastSyncAt)} · next {when(feed.nextSyncAt)}</span></div>
          </div>

          {feed.lastError && <div className="workspace-inline-note" role="alert"><strong>Last error:</strong> {feed.lastError}</div>}

          <WorkspaceRecordDetails label="Feed source">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Vendor</strong><span>{feed.vendorId}</span></div>
              <div className="workspace-compact-row"><strong>Last successful sync</strong><span>{when(feed.lastSuccessAt)}</span></div>
              <div className="workspace-compact-row"><strong>Source</strong><span>{feed.sourceUrl ?? feed.sourceFilename ?? "—"}</span></div>
            </div>
          </WorkspaceRecordDetails>

          <div className="workspace-action-bar">
            <span>Admin actions are audited.</span>
            <div className="workspace-action-buttons">
              {feed.sourceUrl && <a className="button button-secondary" href={feed.sourceUrl} target="_blank" rel="noreferrer">View feed</a>}
              {feed.sourceType === "url" && <form action={manageFeed}><input type="hidden" name="feedId" value={feed.id} /><input type="hidden" name="action" value="sync" /><button className="button button-secondary" type="submit">Force sync</button></form>}
              {feed.sourceType === "url" && feed.status === "active" && <form action={manageFeed}><input type="hidden" name="feedId" value={feed.id} /><input type="hidden" name="action" value="pause" /><button className="button button-secondary" type="submit">Pause</button></form>}
              {feed.sourceType === "url" && feed.status === "paused" && <form action={manageFeed}><input type="hidden" name="feedId" value={feed.id} /><input type="hidden" name="action" value="resume" /><button className="button" type="submit">Resume</button></form>}
            </div>
          </div>
        </article>)}
        {feeds.length === 0 && <div className="workspace-empty-state"><strong>No vendor feeds match this filter.</strong><p>Connected vendor XML feeds will appear here automatically.</p></div>}
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="History" title="Recent feed runs" note="Manual, upload and scheduled runs share one audit trail." />
      <div className="workspace-queue-list">
        {data.recentRuns.map((run) => <article className="workspace-queue-card" key={run.id}>
          <div className="workspace-queue-head">
            <div><strong>{run.vendorName} · {run.feedName}</strong><small>{when(run.startedAt)} · {run.triggerType}</small></div>
            <span className="status-pill">{run.status}</span>
          </div>
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Rows</strong><span>{run.totalRows.toLocaleString("el-GR")} total · {run.validRows.toLocaleString("el-GR")} valid · {run.errorRows.toLocaleString("el-GR")} errors</span></div>
            <div className="workspace-compact-row"><strong>Catalogue</strong><span>{run.createdSubmissions.toLocaleString("el-GR")} new · {run.updatedSubmissions.toLocaleString("el-GR")} updated · {run.updatedOffers.toLocaleString("el-GR")} offer price updates</span></div>
            <div className="workspace-compact-row"><strong>Reconciliation</strong><span>{run.missingRows.toLocaleString("el-GR")} missing · {run.protectedInventoryRows.toLocaleString("el-GR")} reservation-protected</span></div>
          </div>
          {run.errorMessage && <div className="workspace-inline-note" role="alert">{run.errorMessage}</div>}
        </article>)}
      </div>
    </section>
  </main>;
}
