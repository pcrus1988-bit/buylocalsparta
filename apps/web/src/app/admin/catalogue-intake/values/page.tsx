import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { mapCatalogueSourceAttributeValue } from "../../../../lib/admin-catalogue-attribute-value-mapping";
import { adminCatalogueControlledValueQueue } from "../../../../lib/admin-catalogue-controlled-value-queue";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = {
  title: "Admin · Supplier PIM Controlled Values",
  robots: { index: false, follow: false, nocache: true }
};

type Params = {
  mapped?: string;
  mappedRows?: string;
  mappedKey?: string;
  mappedValue?: string;
  mappedTarget?: string;
  error?: string;
};

async function mapControlledValueAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const sourceProductId = String(formData.get("sourceProductId") ?? "").trim();
  const sourceAttributeKey = String(formData.get("sourceAttributeKey") ?? "").trim();
  const attributeValueId = String(formData.get("attributeValueId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  let result;
  try {
    result = await mapCatalogueSourceAttributeValue(principal, {
      sourceProductId,
      sourceAttributeKey,
      attributeValueId,
      reason
    });
  } catch (error) {
    const search = new URLSearchParams({ error: errorMessage(error) });
    redirect(`/admin/catalogue-intake/values?${search.toString()}`);
  }

  revalidatePath("/admin/catalogue-intake/values");
  revalidatePath("/admin/catalogue-intake");
  const search = new URLSearchParams({
    mapped: "1",
    mappedRows: String(result.mappedObservations),
    mappedKey: result.sourceAttributeKey,
    mappedValue: result.sourceValue,
    mappedTarget: `${result.attributeCode} / ${result.attributeValueCode}`
  });
  redirect(`/admin/catalogue-intake/values?${search.toString()}`);
}

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const queue = await adminCatalogueControlledValueQueue(principal);
  const totalOccurrences = queue.reduce((sum, item) => sum + item.occurrences, 0);
  const sourceCount = new Set(queue.map((item) => item.sourceName)).size;
  const attributeCount = new Set(queue.map((item) => `${item.productTypeId}:${item.attributeId}`)).size;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Supplier PIM Controlled Values" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalog · controlled source values</div>
        <h1>Controlled value review</h1>
        <p className="lead">Approve exact external enum values once per supplier context and reuse that decision across matching observations. Unknown values remain review-required; no fuzzy guessing or automatic publication is allowed.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Normalization boundary</span>
        <strong>Source evidence only</strong>
        <p>Approvals attach canonical controlled-value IDs to Supplier PIM observations. They do not write canonical product attributes, offers, stock, prices or public catalogue state.</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Value groups awaiting review", value: queue.length, tone: queue.length ? "attention" : "default" },
      { label: "Affected observations", value: totalOccurrences, tone: totalOccurrences ? "attention" : "default" },
      { label: "Sources", value: sourceCount },
      { label: "Product Type attributes", value: attributeCount }
    ]} />

    <section className="shell vendor-section">
      <div className="workspace-action-bar" style={{marginBottom:"1rem"}}>
        <span>Attribute meaning is reviewed first in Supplier PIM Intake; controlled values are resolved here only after that mapping exists.</span>
        <Link className="button button-secondary" href="/admin/catalogue-intake">Back to Supplier PIM Intake</Link>
      </div>

      {params.mapped === "1" && <div className="workspace-queue-card" role="status" style={{marginBottom:"1rem"}}>
        <strong>Controlled value alias approved</strong>
        <p>{params.mappedKey} · “{params.mappedValue}” → {params.mappedTarget} · {Number(params.mappedRows ?? 0).toLocaleString("el-GR")} observations resolved.</p>
        <small>The exact value rule will also apply to future observations in the same source context. Raw supplier evidence remains unchanged.</small>
      </div>}
      {params.error && <div className="workspace-queue-card" role="alert" style={{marginBottom:"1rem"}}>
        <strong>Could not approve controlled value</strong>
        <p>{params.error}</p>
      </div>}

      <WorkspaceSectionHeading
        eyebrow="Review queue"
        title="Repeated enum values"
        note="The queue groups equivalent external scalar values by approved source-attribute rule. Higher-frequency values appear first so one reviewed alias can clear the largest amount of evidence safely."
      />

      {queue.length === 0 ? <WorkspaceEmptyState
        title="No controlled enum values are awaiting review."
        body="Once an enum source attribute is mapped to a Product Type attribute, new external values without an approved alias will appear here."
      /> : <div className="workspace-queue-list">{queue.map((item) => <article className="workspace-queue-card" key={`${item.mappingRuleId}:${item.sourceValueKey}`}>
        <div className="workspace-queue-head">
          <div>
            <strong>“{item.sourceValue}”</strong>
            <small>{item.sourceName} · {item.sourceAttributeKey} → {item.productTypeCode} / {item.attributeCode}</small>
          </div>
          <span className="status-pill">{item.occurrences.toLocaleString("el-GR")} observations</span>
        </div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Exact-match key</strong><span>{item.sourceValueKey}</span></div>
          <div className="workspace-compact-row"><strong>Rule scope</strong><span>{item.scopeKind.replaceAll("_", " ")} · {shortScope(item.scopeKey)}</span></div>
          <div className="workspace-compact-row"><strong>Allowed targets</strong><span>{item.options.length.toLocaleString("el-GR")} active canonical values</span></div>
        </div>
        <form action={mapControlledValueAction} className="admin-directory-filters" style={{marginTop:"0.9rem"}}>
          <input type="hidden" name="sourceProductId" value={item.representativeSourceProductId} />
          <input type="hidden" name="sourceAttributeKey" value={item.sourceAttributeKey} />
          <label>
            <span>Canonical controlled value</span>
            <select name="attributeValueId" required defaultValue="">
              <option value="" disabled>Select value…</option>
              {item.options.map((option) => <option key={option.id} value={option.id}>{option.label}{option.label !== option.code ? ` · ${option.code}` : ""}</option>)}
            </select>
          </label>
          <label>
            <span>Review note</span>
            <input name="reason" maxLength={240} placeholder="Why this exact value is equivalent (optional)" />
          </label>
          <div><button className="button button-primary" type="submit" disabled={item.options.length === 0}>Approve exact value alias</button></div>
        </form>
      </article>)}</div>}

      <div className="workspace-inline-note">Only exact scalar enum aliases are automated in this phase. Multienum splitting, fuzzy synonyms and unit conversion deliberately remain review-required until they have their own explicit governance rules.</div>
    </section>
  </main>;
}

function shortScope(value: string): string {
  return value.length > 32 ? `${value.slice(0, 14)}…${value.slice(-8)}` : value;
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "Controlled value action failed");
}
