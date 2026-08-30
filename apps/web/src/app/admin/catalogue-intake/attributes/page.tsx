import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCatalogueIntakeWorkspace } from "../../../../lib/admin-catalogue-intake";
import { adminCatalogueAttributeReviewWorkspace } from "../../../../lib/admin-catalogue-attribute-review";
import { mapCatalogueSourceAttribute } from "../../../../lib/admin-catalogue-attribute-mapping";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Attribute Review Centre", robots: { index: false, follow: false, nocache: true } };

type Params = {
  snapshot?: string;
  saved?: string;
  mapped?: string;
  review?: string;
  key?: string;
  target?: string;
  error?: string;
};

async function approveSuggestionAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const snapshotId = String(formData.get("snapshotId") ?? "").trim();
  const sourceProductId = String(formData.get("sourceProductId") ?? "").trim();
  const sourceAttributeKey = String(formData.get("sourceAttributeKey") ?? "").trim();
  const productTypeId = String(formData.get("productTypeId") ?? "").trim();
  const attributeId = String(formData.get("attributeId") ?? "").trim();
  const productTypeCode = String(formData.get("productTypeCode") ?? "").trim();
  const attributeCode = String(formData.get("attributeCode") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  let result;
  try {
    result = await mapCatalogueSourceAttribute(principal, {
      sourceProductId,
      sourceAttributeKey,
      productTypeId,
      attributeId,
      reason: reason || "Approved from grouped Supplier PIM attribute review"
    });
  } catch (error) {
    redirect(reviewHref({ snapshot: snapshotId, error: errorMessage(error) }));
  }

  revalidatePath("/admin/catalogue-intake");
  revalidatePath("/admin/catalogue-intake/attributes");
  revalidatePath("/admin/catalogue");
  redirect(reviewHref({
    snapshot: snapshotId,
    saved: "1",
    mapped: String(result.mappedObservations),
    review: String(result.reviewRequiredObservations),
    key: result.sourceAttributeKey,
    target: `${productTypeCode || result.productTypeCode} / ${attributeCode || result.attributeCode}`
  }));
}

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const snapshotId = params.snapshot?.trim() || undefined;
  const [review, intake] = await Promise.all([
    adminCatalogueAttributeReviewWorkspace(principal, { snapshotId }),
    adminCatalogueIntakeWorkspace(principal, { snapshotId })
  ]);
  const selectedSnapshot = snapshotId ? intake.snapshots.find((item) => item.id === snapshotId) : undefined;
  const canWrite = hasAdminPermission(principal, "catalog.write");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={review.csrfToken} entityLabel="Attribute Review Centre" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalog · source normalization</div>
        <h1>Attribute Review Centre</h1>
        <p className="lead">Review repeated unmapped supplier attributes once per exact source context instead of resolving the same key product by product.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Decision model</span>
        <strong>Advisory suggestions only</strong>
        <p>Scores help order plausible Product Type attributes. Nothing is approved automatically; every reusable rule requires an Admin decision.</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Unmapped observations", value: review.totalUnmapped, tone: review.totalUnmapped ? "attention" : "positive" },
      { label: "Repeated contexts", value: review.groupCount },
      { label: "Ready to review", value: review.actionableGroups, tone: review.actionableGroups ? "attention" : "default" },
      { label: "Blocked by taxonomy", value: review.blockedGroups, tone: review.blockedGroups ? "attention" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Review scope" title="Exact source context, governed Product Types" note="Groups use the same source + attribute key + taxonomy/provider-category boundary as schema 164. Taxonomy groups only suggest Product Types attached to the approved KONTAMOU category. Open Icecat/provider-only groups remain isolated by provider category." />
      <div className="workspace-action-bar">
        <span>{selectedSnapshot ? `${selectedSnapshot.sourceName} · ${selectedSnapshot.productCount.toLocaleString("el-GR")} products` : "All Supplier PIM snapshots"}</span>
        <Link className="button button-secondary" href="/admin/catalogue">Catalogue Overview</Link>
        <Link className="button button-secondary" href="/admin/catalogue-intake">Back to Supplier PIM Intake</Link>
      </div>
      <form method="get" className="admin-directory-filters">
        <label>
          <span>Snapshot</span>
          <select name="snapshot" defaultValue={snapshotId ?? ""}>
            <option value="">All snapshots</option>
            {intake.snapshots.map((item) => <option key={item.id} value={item.id}>{item.sourceName} · {item.productCount.toLocaleString("el-GR")}</option>)}
          </select>
        </label>
        <div><button className="button button-secondary" type="submit">Apply scope</button></div>
      </form>
      <div className="workspace-inline-note">Suggestions are not bulk automation. A score is evidence for review, not permission to map. The existing server mapping service re-checks category/Product Type validity, historical conflicts, and rule identity on every approval.</div>
      {!canWrite && <div className="workspace-inline-note">Read-only review mode: your Admin role can inspect mapping evidence and suggestions but cannot approve reusable mapping rules.</div>}
      {params.saved === "1" && <div className="workspace-queue-card" role="status" style={{marginTop:"1rem"}}><strong>Grouped mapping approved</strong><p>{params.key} → {params.target} · {Number(params.mapped ?? 0).toLocaleString("el-GR")} mapped · {Number(params.review ?? 0).toLocaleString("el-GR")} retained for value/unit review.</p></div>}
      {params.error && <div className="workspace-queue-card" role="alert" style={{marginTop:"1rem"}}><strong>Mapping was not approved</strong><p>{params.error}</p></div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Grouped queue" title="Repeated unmapped attributes" note="Highest-volume contexts appear first. Samples show the supplier evidence that will remain untouched after semantic mapping." />
      {review.groups.length === 0 ? <WorkspaceEmptyState title="No unmapped attribute groups in this scope." body="Future source observations that match approved schema-164 rules are handled automatically at ingestion time." /> : <div className="workspace-queue-list">{review.groups.map((group) => {
        const manual = new URLSearchParams();
        if (snapshotId) manual.set("snapshot", snapshotId);
        manual.set("product", group.representativeProductId);
        return <article className="workspace-queue-card" key={`${group.sourceId}:${group.sourceAttributeKey}:${group.scopeKind}:${group.scopeKey ?? "none"}`}>
          <div className="workspace-queue-head"><div><strong>{group.sourceAttributeKey}</strong><small>{group.sourceName} · {group.contextLabel}</small></div><span className="status-pill">{group.observationCount.toLocaleString("el-GR")} observations</span></div>
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Products</strong><span>{group.productCount.toLocaleString("el-GR")}</span></div>
            <div className="workspace-compact-row"><strong>Source units</strong><span>{group.sourceUnits.join(" · ") || "—"}</span></div>
            <div className="workspace-compact-row"><strong>Canonical category</strong><span>{group.approvedCategoryCode ?? (group.scopeKind === "source_category" ? "Provider context · explicit Product Type review" : "Not approved yet")}</span></div>
            <div className="workspace-compact-row"><strong>Sample values</strong><span>{group.samples.map((sample) => compactValue(sample.rawValue)).join(" · ") || "—"}</span></div>
            <div className="workspace-compact-row"><strong>Sample products</strong><span>{group.samples.map((sample) => sample.title).join(" · ") || "—"}</span></div>
          </div>

          {!group.actionable ? <div className="workspace-inline-note">{group.blocker}</div> : group.suggestions.length === 0 ? <div className="workspace-inline-note">No sufficiently relevant candidate could be suggested safely. Review one representative product manually.</div> : <div className="workspace-queue-list" style={{marginTop:"0.75rem"}}>{group.suggestions.map((suggestion) => <div className="workspace-queue-card" key={`${suggestion.productTypeId}:${suggestion.attributeId}`}>
            <div className="workspace-queue-head"><div><strong>{suggestion.productTypeName} · {suggestion.attributeCode}</strong><small>{suggestion.dataType}{suggestion.unit ? ` · ${suggestion.unit}` : ""} · {suggestion.reasons.join(" · ") || "candidate"}</small></div><span className="status-pill">{Math.round(suggestion.score * 100)}% advisory</span></div>
            {canWrite ? <form action={approveSuggestionAction} className="workspace-action-bar">
              <input type="hidden" name="snapshotId" value={snapshotId ?? ""} />
              <input type="hidden" name="sourceProductId" value={group.representativeProductId} />
              <input type="hidden" name="sourceAttributeKey" value={group.sourceAttributeKey} />
              <input type="hidden" name="productTypeId" value={suggestion.productTypeId} />
              <input type="hidden" name="attributeId" value={suggestion.attributeId} />
              <input type="hidden" name="productTypeCode" value={suggestion.productTypeCode} />
              <input type="hidden" name="attributeCode" value={suggestion.attributeCode} />
              <label style={{flex:"1 1 18rem"}}><span>Review note</span><input name="reason" maxLength={240} placeholder="Optional reason for this approval" /></label>
              <button className="button button-primary" type="submit">Approve this mapping</button>
            </form> : <div className="workspace-inline-note">Read-only suggestion. Approval requires catalog.write permission.</div>}
          </div>)}</div>}

          <div className="workspace-action-bar"><span>Need full product context or a different Product Type?</span><Link className="button button-secondary" href={`/admin/catalogue-intake?${manual.toString()}`}>Review representative product</Link></div>
        </article>;
      })}</div>}
      {review.groups.length >= 180 && <div className="workspace-inline-note">Showing the 180 highest-volume exact contexts. Resolve these to expose the next set.</div>}
    </section>
  </main>;
}

function reviewHref(input: { snapshot?: string; saved?: string; mapped?: string; review?: string; key?: string; target?: string; error?: string }): string {
  const search = new URLSearchParams();
  if (input.snapshot) search.set("snapshot", input.snapshot);
  if (input.saved) search.set("saved", input.saved);
  if (input.mapped) search.set("mapped", input.mapped);
  if (input.review) search.set("review", input.review);
  if (input.key) search.set("key", input.key);
  if (input.target) search.set("target", input.target);
  if (input.error) search.set("error", input.error.slice(0, 300));
  const query = search.toString();
  return `/admin/catalogue-intake/attributes${query ? `?${query}` : ""}`;
}
function compactValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value.length > 90 ? `${value.slice(0,87)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { const text=JSON.stringify(value); return text.length>90?`${text.slice(0,87)}…`:text; } catch { return "[value]"; }
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error || "Unexpected attribute mapping error"); }
