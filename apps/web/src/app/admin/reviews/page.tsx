import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminReviewsWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminReviewsWorkspace(principal); } catch { redirect("/admin"); }
  const reviewQueue = data.reviews.filter((review) => !["published", "hidden", "rejected"].includes(review.status)).length;
  const published = data.reviews.filter((review) => review.status === "published").length;
  const openReports = data.reports.filter((report) => !["resolved", "rejected"].includes(report.status)).length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Verified interaction moderation</div><h1>Reviews</h1><p className="lead">Moderation και vendor reports είναι δύο ξεχωριστές queues με το customer-visible review content πρώτο και τα IDs δεύτερα.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Reviews", value: data.reviews.length },
      { label: "Needs moderation", value: reviewQueue, tone: reviewQueue ? "attention" : "default" },
      { label: "Published", value: published, tone: published ? "positive" : "default" },
      { label: "Open reports", value: openReports, tone: openReports ? "attention" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Moderation queue" title="Customer reviews" note="Publish, hide ή reject μόνο μετά από verified-interaction review." />
      {data.reviews.length === 0 ? <WorkspaceEmptyState title="Δεν έχουν υποβληθεί production reviews." body="Η moderation queue είναι έτοιμη για verified-review data." /> : <div className="workspace-queue-list">{data.reviews.map((review) => <article className="workspace-queue-card" key={review.id}>
        <div className="workspace-queue-head"><div><strong>{review.rating}/5 · {review.interactionType}</strong><small>{review.body ?? "Χωρίς γραπτό σχόλιο"}</small></div><span className="status-pill">{review.status}</span></div>
        <WorkspaceRecordDetails label="Vendor & product references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Review ID</strong><span>{review.id}</span></div><div className="workspace-compact-row"><strong>Vendor</strong><span>{review.vendorId}</span></div><div className="workspace-compact-row"><strong>Canonical variant</strong><span>{review.canonicalVariantId}</span></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>Current moderation state: <strong>{review.status}</strong></span><div className="workspace-action-buttons"><AdminActionButton label="Publish" endpoint="/api/admin/reviews/action" csrfToken={data.csrfToken} body={{ reviewId: review.id, status: "published" }} reasonPrompt="Moderation reason" /><AdminActionButton label="Hide" endpoint="/api/admin/reviews/action" csrfToken={data.csrfToken} body={{ reviewId: review.id, status: "hidden" }} reasonPrompt="Moderation reason" /><AdminActionButton label="Reject" endpoint="/api/admin/reviews/action" csrfToken={data.csrfToken} body={{ reviewId: review.id, status: "rejected" }} reasonPrompt="Moderation reason" danger /></div></div>
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Vendor reports" title="Reported reviews" note="Report resolution δεν αλλάζει αυτόματα fairness ή exposure weights." />
      {data.reports.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν vendor reports." /> : <div className="workspace-queue-list">{data.reports.map((report) => <article className="workspace-queue-card" key={report.id}>
        <div className="workspace-queue-head"><div><strong>{report.reason}</strong><small>{report.details}</small></div><span className="status-pill">{report.status}</span></div>
        <WorkspaceRecordDetails label="Report reference"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Report ID</strong><span>{report.id}</span></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>Report state: <strong>{report.status}</strong></span><div className="workspace-action-buttons">{report.status !== "under_review" && !["resolved", "rejected"].includes(report.status) && <AdminActionButton label="Under review" endpoint="/api/admin/reviews/report" csrfToken={data.csrfToken} body={{ reportId: report.id, status: "under_review" }} />}{!["resolved", "rejected"].includes(report.status) && <><AdminActionButton label="Resolve" endpoint="/api/admin/reviews/report" csrfToken={data.csrfToken} body={{ reportId: report.id, status: "resolved" }} reasonPrompt="Resolution" /><AdminActionButton label="Reject report" endpoint="/api/admin/reviews/report" csrfToken={data.csrfToken} body={{ reportId: report.id, status: "rejected" }} reasonPrompt="Resolution" /></>}</div></div>
      </article>)}</div>}
    </div></section>
  </main>;
}
