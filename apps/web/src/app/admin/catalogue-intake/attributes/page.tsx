import Link from "next/link";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCatalogueIntakeWorkspace } from "../../../../lib/admin-catalogue-intake";
import {
  adminCatalogueAttributeMappingWorkspace,
  resolveCatalogueAttributeMapping,
  type CatalogueAttributeQueueStatus
} from "../../../../lib/admin-catalogue-attribute-mapping";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = {
  title: "Admin · Attribute Mapping Centre",
  robots: { index: false, follow: false, nocache: true }
};

type Params = {
  snapshot?: string;
  status?: string;
  saved?: string;
  affected?: string;
  attribute?: string;
  error?: string;
};

async function resolveAttributeAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const snapshot = String(formData.get("snapshot") ?? "").trim();
  const status = queueStatus(String(formData.get("queueStatus") ?? ""));
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const sourceAttributeKey = String(formData.get("sourceAttributeKey") ?? "").trim();
  const sourceTaxonomyNodeId = String(formData.get("sourceTaxonomyNodeId") ?? "").trim() || undefined;
  const sourceUnit = String(formData.get("sourceUnit") ?? "").trim() || undefined;
  const attributeId = String(formData.get("attributeId") ?? "").trim() || undefined;
  const decision = String(formData.get("decision") ?? "").trim();

  if (decision !== "mapped" && decision !== "review_required" && decision !== "rejected") {
    redirect(mappingHref({ snapshot, status, error: "Unsupported attribute mapping decision" }));
  }

  try {
    const result = await resolveCatalogueAttributeMapping(principal, {
      sourceId,
      sourceAttributeKey,
      sourceTaxonomyNodeId,
      sourceUnit,
      attributeId,
      decision
    });
    revalidatePath("/admin/catalogue-intake");
    revalidatePath("/admin/catalogue-intake/attributes");
    redirect(mappingHref({
      snapshot,
      status,
      saved: result.decision,
      affected: String(result.affectedObservations),
      attribute: result.canonicalAttributeCode
    }));
  } catch (error) {
    redirect(mappingHref({ snapshot, status, error: errorMessage(error) }));
  }
}

export default async function AttributeMappingPage({ searchParams }: { searchParams: Promise<Params> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const status = queueStatus(params.status);

  const intake = await adminCatalogueIntakeWorkspace(principal, { snapshotId: params.snapshot });
  const snapshotId = params.snapshot?.trim() || undefined;
  const mapper = await adminCatalogueAttributeMappingWorkspace(principal, { snapshotId, status });
  const selectedSnapshot = snapshotId ? intake.snapshots.find((item) => item.id === snapshotId) : undefined;

  const unmappedHref = mappingHref({ snapshot: snapshotId, status: "unmapped" });
  const reviewHref = mappingHref({ snapshot: snapshotId, status: "review_required" });

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={mapper.csrfToken} entityLabel="Attribute Mapping Centre" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalog · canonical normalization</div>
        <h1>Attribute Mapping Centre</h1>
        <p className="lead">Turn repeated supplier attribute keys into reusable canonical mappings without changing the supplier evidence underneath them.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Publication boundary</span>
        <strong>Evidence mapping only</strong>
        <p>Mapping changes only canonical attribute references and mapping status. It does not publish products, create offers, or change price or stock.</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Unresolved observations", value: mapper.unresolvedObservations, tone: mapper.unresolvedObservations ? "attention" : "positive" },
      { label: status === "unmapped" ? "Unmapped groups" : "Review-later groups", value: mapper.groupCount, tone: mapper.groupCount ? "attention" : "default" },
      { label: "Affected products", value: mapper.affectedProducts },
      { label: "Review later", value: mapper.reviewRequiredObservations, tone: mapper.reviewRequiredObservations ? "attention" : "default" },
      { label: "Canonical attributes", value: mapper.definitions.length }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Scope"
        title="Resolve once, reuse on future imports"
        note="Rules are exact and source-scoped: supplier source + source attribute key + supplier taxonomy node + source unit. Future matching observations reuse the approved decision automatically; fuzzy matching is never auto-applied."
      />
      <div className="workspace-action-bar">
        <span>{selectedSnapshot ? `Snapshot: ${selectedSnapshot.sourceName} · ${selectedSnapshot.productCount.toLocaleString("el-GR")} products` : "All Supplier PIM snapshots"}</span>
        <Link className="button button-secondary" href="/admin/catalogue-intake">Back to Supplier PIM Intake</Link>
      </div>

      <form method="get" className="admin-directory-filters">
        <label>
          <span>Snapshot scope</span>
          <select name="snapshot" defaultValue={snapshotId ?? ""}>
            <option value="">All snapshots</option>
            {intake.snapshots.map((item) => <option key={item.id} value={item.id}>{item.sourceName} · {item.productCount.toLocaleString("el-GR")} products</option>)}
          </select>
        </label>
        <input type="hidden" name="status" value={status} />
        <div><button className="button button-secondary" type="submit">Apply scope</button></div>
      </form>

      <div className="workspace-action-bar">
        <span>Queue</span>
        <div>
          <Link className={`button ${status === "unmapped" ? "button-primary" : "button-secondary"}`} href={unmappedHref}>Unmapped · {mapper.unmappedObservations.toLocaleString("el-GR")}</Link>{" "}
          <Link className={`button ${status === "review_required" ? "button-primary" : "button-secondary"}`} href={reviewHref}>Review later · {mapper.reviewRequiredObservations.toLocaleString("el-GR")}</Link>
        </div>
      </div>

      {params.saved && <div className="workspace-queue-card" role="status" style={{ marginTop: "1rem" }}>
        <strong>{decisionLabel(params.saved)}</strong>
        <p>{Number(params.affected ?? 0).toLocaleString("el-GR")} matching observations updated{params.attribute ? ` · canonical ${params.attribute}` : ""}. The reusable source rule is saved for future imports.</p>
      </div>}
      {params.error && <div className="workspace-queue-card" role="alert" style={{ marginTop: "1rem" }}><strong>Mapping could not be saved</strong><p>{params.error}</p></div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow={status === "unmapped" ? "Mapping queue" : "Deferred review"}
        title={status === "unmapped" ? "Repeated raw attributes, grouped by exact source context" : "Attributes intentionally held for later review"}
        note="High-volume groups appear first. Raw values, source keys, units and source-product evidence are retained; only attribute_id and mapping_status are governed here."
      />

      {mapper.groups.length === 0 ? <WorkspaceEmptyState
        title={status === "unmapped" ? "No unmapped attribute groups in this scope." : "No attributes are waiting for later review in this scope."}
        body="New observations that match a saved rule will be resolved automatically during ingestion."
      /> : <div className="workspace-queue-list">{mapper.groups.map((group) => <article
        className="workspace-queue-card"
        key={`${group.sourceId}:${group.sourceAttributeKey}:${group.sourceTaxonomyNodeId ?? ""}:${group.sourceUnit ?? ""}`}
      >
        <div className="workspace-queue-head">
          <div>
            <strong>{group.sourceAttributeKey}</strong>
            <small>{group.sourceName} · {group.observationCount.toLocaleString("el-GR")} observations · {group.productCount.toLocaleString("el-GR")} products</small>
          </div>
          <span className="status-pill">{status === "unmapped" ? "unmapped" : "review later"}</span>
        </div>

        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Source category</strong><span>{group.categoryPath ?? "—"}</span></div>
          <div className="workspace-compact-row"><strong>Source unit</strong><span>{group.sourceUnit ?? "—"}</span></div>
          <div className="workspace-compact-row"><strong>Example values</strong><span>{group.sampleValues.map(compactValue).join(" · ") || "—"}</span></div>
          <div className="workspace-compact-row"><strong>Example products</strong><span>{group.sampleProductKeys.join(" · ") || "—"}</span></div>
          {group.suggestedAttributeCode && <div className="workspace-compact-row"><strong>Exact-key suggestion</strong><span>{group.suggestedAttributeCode}</span></div>}
        </div>

        <form action={resolveAttributeAction} className="admin-directory-filters">
          <input type="hidden" name="snapshot" value={snapshotId ?? ""} />
          <input type="hidden" name="queueStatus" value={status} />
          <input type="hidden" name="sourceId" value={group.sourceId} />
          <input type="hidden" name="sourceAttributeKey" value={group.sourceAttributeKey} />
          <input type="hidden" name="sourceTaxonomyNodeId" value={group.sourceTaxonomyNodeId ?? ""} />
          <input type="hidden" name="sourceUnit" value={group.sourceUnit ?? ""} />
          <label>
            <span>Canonical attribute</span>
            <select name="attributeId" defaultValue={group.suggestedAttributeId ?? ""}>
              <option value="">Choose canonical attribute</option>
              {mapper.definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.code} · {definition.dataType}{definition.unit ? ` · ${definition.unit}` : ""}</option>)}
            </select>
          </label>
          <div>
            <button className="button button-primary" type="submit" name="decision" value="mapped">Map</button>{" "}
            <button className="button button-secondary" type="submit" name="decision" value="review_required">Review later</button>{" "}
            <button className="button button-secondary" type="submit" name="decision" value="rejected">Ignore / reject</button>
          </div>
        </form>
      </article>)}</div>}

      {mapper.groups.length >= 200 && <div className="workspace-inline-note">Showing the 200 highest-volume groups in this scope. Resolve these groups to expose the next set.</div>}
    </section>
  </main>;
}

function queueStatus(value?: string): CatalogueAttributeQueueStatus {
  return value === "review_required" ? "review_required" : "unmapped";
}

function mappingHref(input: {
  snapshot?: string;
  status?: CatalogueAttributeQueueStatus;
  saved?: string;
  affected?: string;
  attribute?: string;
  error?: string;
}): string {
  const search = new URLSearchParams();
  if (input.snapshot) search.set("snapshot", input.snapshot);
  if (input.status) search.set("status", input.status);
  if (input.saved) search.set("saved", input.saved);
  if (input.affected) search.set("affected", input.affected);
  if (input.attribute) search.set("attribute", input.attribute);
  if (input.error) search.set("error", input.error);
  const query = search.toString();
  return `/admin/catalogue-intake/attributes${query ? `?${query}` : ""}`;
}

function decisionLabel(value: string): string {
  if (value === "mapped") return "Canonical mapping saved";
  if (value === "review_required") return "Moved to review later";
  if (value === "rejected") return "Source attribute ignored / rejected";
  return "Attribute decision saved";
}

function compactValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 77)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const text = JSON.stringify(value);
    return text.length > 80 ? `${text.slice(0, 77)}…` : text;
  } catch {
    return "[value]";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unexpected attribute mapping error";
}
