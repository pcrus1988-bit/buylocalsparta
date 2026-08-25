import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCatalogueIntakeWorkspace } from "../../../../lib/admin-catalogue-intake";
import { adminCatalogueAttributeMappingWorkspace, bulkConfirmHighConfidenceAttributeMappings, confirmCatalogueAttributeMapping } from "../../../../lib/admin-catalogue-attribute-mapping";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Attribute Mapper", robots: { index: false, follow: false, nocache: true } };

type Params = { snapshot?: string; mapped?: string; rules?: string; bulkMapped?: string; error?: string };

async function confirmMappingAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const snapshot = String(formData.get("snapshot") ?? "").trim();
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const sourceKey = String(formData.get("sourceKey") ?? "").trim();
  const sourceUnit = String(formData.get("sourceUnit") ?? "").trim() || undefined;
  const attributeId = String(formData.get("attributeId") ?? "").trim();
  const methodRaw = String(formData.get("method") ?? "manual");
  const method = ["exact_code", "historical", "fuzzy"].includes(methodRaw) ? methodRaw as "exact_code" | "historical" | "fuzzy" : "manual";
  const confidenceRaw = Number(formData.get("confidence") ?? 1);
  try {
    const result = await confirmCatalogueAttributeMapping(principal, {
      sourceId, sourceKey, sourceUnit, attributeId, method,
      confidence: Number.isFinite(confidenceRaw) ? confidenceRaw : 1,
      reasons: ["admin_confirmed_from_attribute_mapper"]
    });
    revalidatePath("/admin/catalogue-intake");
    revalidatePath("/admin/catalogue-intake/attributes");
    const search = new URLSearchParams({ snapshot, mapped: String(result.mapped) });
    redirect(`/admin/catalogue-intake/attributes?${search.toString()}`);
  } catch (error) {
    const search = new URLSearchParams({ snapshot, error: errorMessage(error) });
    redirect(`/admin/catalogue-intake/attributes?${search.toString()}`);
  }
}

async function bulkMappingAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const snapshot = String(formData.get("snapshot") ?? "").trim();
  try {
    const result = await bulkConfirmHighConfidenceAttributeMappings(principal, snapshot);
    revalidatePath("/admin/catalogue-intake");
    revalidatePath("/admin/catalogue-intake/attributes");
    const search = new URLSearchParams({ snapshot, rules: String(result.rules), bulkMapped: String(result.mapped) });
    redirect(`/admin/catalogue-intake/attributes?${search.toString()}`);
  } catch (error) {
    const search = new URLSearchParams({ snapshot, error: errorMessage(error) });
    redirect(`/admin/catalogue-intake/attributes?${search.toString()}`);
  }
}

export default async function AttributeMapperPage({ searchParams }: { searchParams: Promise<Params> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const intake = await adminCatalogueIntakeWorkspace(principal, { snapshotId: params.snapshot });
  const mapper = await adminCatalogueAttributeMappingWorkspace(principal, intake.effectiveSnapshotId);
  const snapshot = intake.snapshots.find((item) => item.id === intake.effectiveSnapshotId);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={mapper.csrfToken} entityLabel="Attribute Mapper" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Catalog · intelligent normalization</div><h1>Attribute Mapper</h1><p className="lead">Μετατρέπει επαναλαμβανόμενα supplier/crawler attribute names σε governed canonical attributes, χρησιμοποιώντας προηγούμενες επιβεβαιωμένες αντιστοιχίσεις, normalized key similarity, units και value types.</p></div>
      <aside className="dashboard-health-card"><span>Safety mode</span><strong>Suggest → confirm → reuse</strong><p>Low-confidence mappings δεν εφαρμόζονται αυτόματα. Κάθε επιβεβαιωμένος κανόνας αποθηκεύεται, κάνει backfill στα υπάρχοντα observations και εφαρμόζεται αυτόματα σε μελλοντικές εισαγωγές του ίδιου source.</p></aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Unmapped observations", value: mapper.totalUnmapped, tone: mapper.totalUnmapped ? "attention" : "positive" },
      { label: "Grouped keys", value: mapper.groups.length },
      { label: "High-confidence groups", value: mapper.highConfidenceGroups, tone: mapper.highConfidenceGroups ? "positive" : "default" },
      { label: "Canonical attributes", value: mapper.attributes.length }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Scope" title="Choose the Supplier PIM snapshot" note="The queue groups thousands of raw observations into reusable source-key rules. Mapping a key updates matching observations for the same catalogue source across snapshots, so the system learns instead of repeating manual work." />
      <form method="get" className="admin-directory-filters">
        <label><span>Snapshot</span><select name="snapshot" defaultValue={intake.effectiveSnapshotId ?? ""}>
          {intake.snapshots.map((item) => <option key={item.id} value={item.id}>{item.sourceName} · {item.productCount.toLocaleString("el-GR")} products · {item.unmappedAttributes.toLocaleString("el-GR")} unmapped</option>)}
        </select></label>
        <div><button className="button button-secondary" type="submit">Load snapshot</button></div>
      </form>
      {snapshot && <div className="workspace-inline-note">Working on <strong>{snapshot.sourceName}</strong> · {snapshot.sourceFilename ?? snapshot.sourceCode}. Suggestions are ranked by evidence; only explicit Admin confirmation creates an approved mapping rule.</div>}
      {params.mapped && <div className="workspace-queue-card" role="status"><strong>Attribute mapping saved</strong><p>{Number(params.mapped).toLocaleString("el-GR")} existing observations were mapped and future matching source keys will reuse the rule automatically.</p></div>}
      {params.rules && <div className="workspace-queue-card" role="status"><strong>High-confidence mappings confirmed</strong><p>{Number(params.rules).toLocaleString("el-GR")} reusable rules approved · {Number(params.bulkMapped ?? 0).toLocaleString("el-GR")} observations backfilled.</p></div>}
      {params.error && <div className="workspace-queue-card" role="alert"><strong>Mapping could not be saved</strong><p>{params.error}</p></div>}
      {intake.effectiveSnapshotId && mapper.highConfidenceGroups > 0 && <form action={bulkMappingAction} className="workspace-action-bar">
        <input type="hidden" name="snapshot" value={intake.effectiveSnapshotId} />
        <span>Approve only suggestions that pass the strict high-confidence + ambiguity-margin gate. Fuzzy suggestions require an even higher threshold.</span>
        <button className="button button-primary" type="submit">Confirm {mapper.highConfidenceGroups} high-confidence mappings</button>
      </form>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Mapping queue" title="Repeated raw attributes, grouped intelligently" note="Largest repeated keys come first. Confirm the suggested canonical attribute or override it manually. A mapping is source-scoped, unit-aware and audit logged." />
      {mapper.groups.length === 0 ? <WorkspaceEmptyState title="No unmapped attributes remain in this snapshot." body="New imports will reuse the approved mapping rules automatically." /> : <div className="workspace-queue-list">{mapper.groups.map((group) => {
        const best = group.candidates[0];
        return <article className="workspace-queue-card" key={`${group.sourceId}:${group.sourceKey}:${group.sourceUnit ?? ""}`}>
          <div className="workspace-queue-head"><div><strong>{group.sourceKey}</strong><small>{group.sourceName}{group.sourceUnit ? ` · unit ${group.sourceUnit}` : ""} · {group.occurrenceCount.toLocaleString("el-GR")} observations</small></div><span className={`status-pill${group.safeForBulk ? " is-positive" : ""}`}>{best ? `${Math.round(best.confidence * 100)}%` : "manual"}</span></div>
          <div className="workspace-queue-primary"><span>{best ? `Suggested: ${best.attributeCode}` : "No reliable suggestion"}</span><span>{best ? best.method.replaceAll("_", " ") : "manual review"}</span><span>{group.safeForBulk ? "Safe for bulk confirmation" : "Needs individual confirmation"}</span></div>
          <div className="workspace-inline-note"><strong>Examples:</strong> {group.examples.map(compactValue).join(" · ") || "—"}</div>
          {best && <WorkspaceRecordDetails label="Why this suggestion?"><div className="workspace-compact-list">{group.candidates.map((candidate) => <div className="workspace-compact-row" key={candidate.attributeId}><strong>{candidate.attributeCode}</strong><span>{Math.round(candidate.confidence * 100)}% · {candidate.dataType}{candidate.unit ? ` · ${candidate.unit}` : ""}</span><small>{candidate.reasons.join(" · ") || candidate.method}</small></div>)}</div></WorkspaceRecordDetails>}
          <form action={confirmMappingAction} className="admin-directory-filters">
            <input type="hidden" name="snapshot" value={intake.effectiveSnapshotId ?? ""} />
            <input type="hidden" name="sourceId" value={group.sourceId} />
            <input type="hidden" name="sourceKey" value={group.sourceKey} />
            <input type="hidden" name="sourceUnit" value={group.sourceUnit ?? ""} />
            <input type="hidden" name="method" value={best?.method ?? "manual"} />
            <input type="hidden" name="confidence" value={best?.confidence ?? 1} />
            <label><span>Map to canonical attribute</span><select name="attributeId" defaultValue={best?.attributeId ?? ""} required>
              <option value="" disabled>Select attribute</option>
              {mapper.attributes.map((attribute) => <option key={attribute.id} value={attribute.id}>{attribute.code} · {attribute.dataType}{attribute.unit ? ` · ${attribute.unit}` : ""}</option>)}
            </select></label>
            <div><button className="button button-secondary" type="submit">Confirm mapping</button></div>
          </form>
        </article>;
      })}</div>}
      {mapper.totalUnmapped > mapper.groups.reduce((sum, group) => sum + group.occurrenceCount, 0) && <div className="workspace-inline-note">The page prioritizes the highest-volume groups. Confirmed mappings immediately reduce the queue; reload to continue through the next groups.</div>}
    </section>
  </main>;
}

function compactValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value.length > 70 ? `${value.slice(0, 67)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { const text = JSON.stringify(value); return text.length > 70 ? `${text.slice(0, 67)}…` : text; } catch { return "[value]"; }
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message.slice(0, 300) : "Unexpected mapping error"; }
