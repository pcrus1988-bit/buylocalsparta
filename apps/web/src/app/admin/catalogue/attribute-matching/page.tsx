import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCatalogueAttributeTrainerWorkspace } from "../../../../lib/admin-catalogue-attribute-trainer";
import { mapCatalogueSourceAttribute } from "../../../../lib/admin-catalogue-attribute-mapping";
import { rejectCatalogueSourceAttribute } from "../../../../lib/admin-catalogue-attribute-rejection";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { AttributeTrainerDeck } from "./AttributeTrainerDeck";

export const metadata: Metadata = {
  title: "Admin · Attribute Matching",
  robots: { index: false, follow: false, nocache: true }
};
export const dynamic = "force-dynamic";

type Params = Readonly<{
  saved?: string;
  action?: string;
  changed?: string;
  key?: string;
  target?: string;
  error?: string;
}>;

async function approveAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const sourceProductId = String(formData.get("sourceProductId") ?? "").trim();
  const sourceAttributeKey = String(formData.get("sourceAttributeKey") ?? "").trim();
  const productTypeId = String(formData.get("productTypeId") ?? "").trim();
  const attributeId = String(formData.get("attributeId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  try {
    const result = await mapCatalogueSourceAttribute(principal, {
      sourceProductId,
      sourceAttributeKey,
      productTypeId,
      attributeId,
      reason: reason || "Confirmed from Attribute Matching trainer"
    });
    revalidateTrainerPaths();
    redirect(trainerHref({
      saved: "1",
      action: "mapped",
      changed: String(result.mappedObservations + result.reviewRequiredObservations),
      key: result.sourceAttributeKey,
      target: `${result.productTypeCode} / ${result.attributeCode}`
    }));
  } catch (error) {
    redirect(trainerHref({ error: errorMessage(error) }));
  }
}

async function rejectAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const sourceProductId = String(formData.get("sourceProductId") ?? "").trim();
  const sourceAttributeKey = String(formData.get("sourceAttributeKey") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  try {
    const result = await rejectCatalogueSourceAttribute(principal, {
      sourceProductId,
      sourceAttributeKey,
      reason: reason || "Marked as not a product attribute in Attribute Matching trainer"
    });
    revalidateTrainerPaths();
    redirect(trainerHref({
      saved: "1",
      action: "rejected",
      changed: String(result.rejectedObservations),
      key: result.sourceAttributeKey
    }));
  } catch (error) {
    redirect(trainerHref({ error: errorMessage(error) }));
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const workspace = await adminCatalogueAttributeTrainerWorkspace(principal, { limit: 18 });
  const canWrite = hasAdminPermission(principal, "catalog.write");
  const first = workspace.cards[0];
  const highConfidence = workspace.cards.filter((card) => (card.suggestions[0]?.score ?? 0) >= 0.8).length;
  const blocked = workspace.cards.filter((card) => !card.actionable).length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={workspace.csrfToken} entityLabel="Attribute Matching" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue · learning workflow</div>
        <h1>Attribute Matching</h1>
        <p className="lead">Teach KONTA MOY how to understand supplier product data. One decision applies to the whole governed source context and becomes reusable knowledge for future imports.</p>
        <div className="workspace-action-bar" style={{ marginTop: "1rem" }}>
          <Link className="button button-secondary" href="/admin/catalogue">← Catalogue</Link>
          <Link className="button button-secondary" href="/admin/catalogue-intake/intelligence">Taxonomy blockers</Link>
          <Link className="button button-secondary" href="/admin/catalogue/structure">Catalogue Structure</Link>
        </div>
      </div>
      <aside className="dashboard-health-card">
        <span>Trainer controls</span>
        <strong>← confirm · → not attribute · ↑ remap · ↓ later</strong>
        <p>Raw supplier evidence is never deleted. A “not attribute” decision stores an audited rejection rule and suppresses the same junk context on future ingestion.</p>
      </aside>
    </section>

    <WorkspaceMetricStrip ariaLabel="Attribute trainer metrics" items={[
      { label: "Unmapped observations", value: workspace.totalUnmapped, tone: workspace.totalUnmapped > 0 ? "attention" : "positive" },
      { label: "Unresolved contexts", value: workspace.unresolvedGroups, tone: workspace.unresolvedGroups > 0 ? "attention" : "positive" },
      { label: "High-confidence in batch", value: highConfidence, hint: `${workspace.cards.length} highest-impact contexts loaded` },
      { label: "Blocked in batch", value: blocked, tone: blocked > 0 ? "attention" : "default", hint: "Resolve taxonomy first" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Trainer queue"
        title="Decide once, teach the system"
        note="The queue is intentionally small and impact-ranked. It does not render the entire unresolved catalogue, which keeps this page usable even when supplier attribute evidence is massive."
      />

      {!canWrite && <div className="workspace-inline-note" style={{ marginBottom: "1rem" }}>Read-only mode: your Admin role can inspect trainer evidence but cannot save learning decisions.</div>}
      {params.error && <div className="workspace-queue-card" role="alert" style={{ marginBottom: "1rem" }}><strong>Decision was not saved</strong><p>{params.error}</p></div>}
      {params.saved === "1" && <div className="workspace-queue-card" role="status" style={{ marginBottom: "1rem" }}>
        <strong>{params.action === "rejected" ? "Reusable rejection learned" : "Canonical mapping learned"}</strong>
        <p>{params.key}{params.target ? ` → ${params.target}` : ""} · {Number(params.changed ?? 0).toLocaleString("el-GR")} observations updated.</p>
      </div>}

      {workspace.cards.length === 0
        ? <WorkspaceEmptyState title="No unmapped attribute contexts are waiting." body="New supplier evidence will automatically appear here if it cannot be resolved by the rules the system has already learned." />
        : <AttributeTrainerDeck cards={workspace.cards} targets={workspace.targets} canWrite={canWrite} approveAction={approveAction} rejectAction={rejectAction} />}

      {first?.blocker && <div className="workspace-inline-note" style={{ marginTop: "1rem" }}>The highest-impact card is currently blocked by catalogue structure. Swipe down to continue with other cards or open Taxonomy blockers.</div>}
    </section>

    <section className="vendor-section section-tint">
      <div className="shell">
        <WorkspaceSectionHeading eyebrow="Learning boundary" title="What the trainer changes" note="Confirmations create/reuse exact governed mapping rules. Rejections teach the importer to ignore identical non-attribute evidence. Manual remaps still pass the same Product Type/category governance checks as the existing catalogue workflow." />
        <div className="workspace-queue-primary">
          <span><strong>Preserved</strong> raw supplier evidence</span>
          <span><strong>Audited</strong> Admin decisions</span>
          <span><strong>Reusable</strong> exact-context rules</span>
          <span><strong>Conservative</strong> fuzzy matches stay suggestions</span>
        </div>
      </div>
    </section>
  </main>;
}

function revalidateTrainerPaths() {
  revalidatePath("/admin/catalogue");
  revalidatePath("/admin/catalogue/attribute-matching");
  revalidatePath("/admin/catalogue-intake/attributes");
  revalidatePath("/admin/catalogue-intake");
}

function trainerHref(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const suffix = query.toString();
  return `/admin/catalogue/attribute-matching${suffix ? `?${suffix}` : ""}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 360);
  return "The catalogue decision could not be saved.";
}
