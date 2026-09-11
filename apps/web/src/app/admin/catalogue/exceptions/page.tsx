import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminActionButton } from "../../../../components/AdminActionButton";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import {
  WorkspaceEmptyState,
  WorkspaceMetricStrip,
  WorkspaceRecordDetails,
  WorkspaceSectionHeading,
  WorkspaceStatusBadge
} from "../../../../components/WorkspacePagePrimitives";
import {
  adminCatalogueExceptionsWorkspace,
  type CatalogueExceptionReason
} from "../../../../lib/admin-catalogue-exceptions-runtime";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = {
  title: "Admin · Catalogue Identity Exceptions",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

function reasonLabel(reason: string) {
  return reason === "material_variant_conflict"
    ? "Material variant conflict"
    : "Ambiguous canonical identity";
}

function createdLabel(value: string) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("el-GR");
}

function exceptionReason(value: string | undefined): CatalogueExceptionReason | undefined {
  return value === "canonical_identity_ambiguous" || value === "material_variant_conflict"
    ? value
    : undefined;
}

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ q?: string; reason?: string; exception?: string }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const params = await searchParams;
  const query = params.q?.trim() || undefined;
  const reason = exceptionReason(params.reason?.trim());

  let data;
  try {
    data = await adminCatalogueExceptionsWorkspace(principal, {
      query,
      reasonCode: reason
    });
  } catch {
    redirect("/admin/catalogue");
  }

  const selected = data.exceptions.find((item) => item.id === params.exception) ?? data.exceptions[0];

  const hrefFor = (exceptionId: string) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (reason) search.set("reason", reason);
    search.set("exception", exceptionId);
    return `/admin/catalogue/exceptions?${search.toString()}`;
  };

  return <main className="vendor-app admin-app admin-catalogue-exceptions">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue · human fallback</div>
        <h1>Identity Exceptions</h1>
        <p className="lead">Μόνο πραγματικές συγκρούσεις ισχυρής ταυτότητας προϊόντος. Missing taxonomy, incomplete attributes και routine supplier duplicates δεν εμφανίζονται εδώ.</p>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Open exceptions", value: data.totalOpen, tone: data.totalOpen ? "attention" : "positive" },
      { label: "Ambiguous identity", value: data.ambiguousIdentity, tone: data.ambiguousIdentity ? "attention" : "default" },
      { label: "Material conflicts", value: data.materialConflicts, tone: data.materialConflicts ? "attention" : "default" },
      { label: "Queue policy", value: "Strong ID only", hint: "routine organisation stays automated" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Exception queue"
        title="Source identity conflicts"
        note="Η ουρά αυτή χρησιμοποιεί ακριβώς το ίδιο dataset με το Exceptions metric του Catalogue dashboard."
      />

      <form method="get" className="admin-directory-filters">
        <label><span>Search</span><input name="q" defaultValue={query ?? ""} placeholder="Product, source, canonical ID…" /></label>
        <label><span>Reason</span><select name="reason" defaultValue={reason ?? ""}><option value="">All strong-ID conflicts</option><option value="canonical_identity_ambiguous">Ambiguous canonical identity</option><option value="material_variant_conflict">Material variant conflict</option></select></label>
        <div><button className="button button-secondary" type="submit">Filter</button>{(query || reason) && <Link className="text-link" href="/admin/catalogue/exceptions">Clear</Link>}</div>
      </form>

      {data.truncated && <div className="workspace-inline-note">Showing the oldest 250 of {data.filteredTotal} matching identity exceptions.</div>}

      {data.exceptions.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν open catalogue identity exceptions με αυτά τα φίλτρα." /> : <div className="admin-split-workspace">
        <div className="admin-triage-list" aria-label="Catalogue identity exceptions">
          {data.exceptions.map((item) => <Link href={hrefFor(item.id)} key={item.id} className={`admin-triage-row${selected?.id === item.id ? " is-selected" : ""}`}>
            <span><strong>{item.title || item.sourceProductKey}</strong><small>{item.sourceName || item.sourceCode} · {item.sourceProductKey}</small></span>
            <span className="admin-triage-meta"><b>{reasonLabel(item.reasonCode)}</b><small>{createdLabel(item.createdAt)}</small></span>
            <i aria-hidden="true">›</i>
          </Link>)}
        </div>

        {selected && <article className="admin-decision-panel">
          <div className="admin-decision-head">
            <div><span>Selected exception</span><h2>{selected.title || selected.sourceProductKey}</h2><p>{selected.sourceName || selected.sourceCode} · source key {selected.sourceProductKey}</p></div>
            <WorkspaceStatusBadge status="attention" label={reasonLabel(selected.reasonCode)} />
          </div>
          <div className="admin-decision-summary">
            <div><span>Source product</span><strong>{selected.sourceProductId}</strong></div>
            <div><span>Candidate canonical</span><strong>{selected.candidateVariantId ?? "No unique candidate"}</strong></div>
            <div><span>Created</span><strong>{createdLabel(selected.createdAt)}</strong></div>
          </div>
          <WorkspaceRecordDetails label="Identity evidence" open>
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Reason</strong><span>{selected.reasonCode}</span></div>
              <div className="workspace-compact-row"><strong>Source</strong><span>{selected.sourceCode}</span></div>
              <div className="workspace-compact-row"><strong>Candidate category</strong><span>{selected.candidateCategoryCode ?? selected.candidateCategoryId ?? "—"}</span></div>
              <div className="workspace-compact-row"><strong>Candidate canonical</strong><span>{selected.candidateVariantSlug ?? selected.candidateVariantId ?? "—"}</span></div>
            </div>
          </WorkspaceRecordDetails>
          <WorkspaceRecordDetails label="Raw review details">
            <pre>{JSON.stringify(selected.details, null, 2)}</pre>
          </WorkspaceRecordDetails>
          <div className="workspace-action-bar">
            <span>Manual resolution still re-checks market, strong identifier and material-variant safety before approving a canonical link.</span>
            <div className="workspace-action-buttons">
              {selected.candidateVariantId && <AdminActionButton
                label="Resolve to candidate"
                endpoint="/api/admin/catalogue/exceptions/action"
                csrfToken={data.csrfToken}
                body={{
                  kind: "resolve_to_canonical",
                  exceptionId: selected.id,
                  canonicalVariantId: selected.candidateVariantId
                }}
                reasonPrompt="Why is this canonical the correct identity?"
              />}
              <AdminActionButton
                label="Resolve to canonical ID"
                endpoint="/api/admin/catalogue/exceptions/action"
                csrfToken={data.csrfToken}
                body={{ kind: "resolve_to_canonical", exceptionId: selected.id }}
                reasonPrompt="Why is this canonical the correct identity?"
                extraPrompt={{
                  field: "canonicalVariantId",
                  message: "Canonical variant UUID"
                }}
              />
              <AdminActionButton
                label="Ignore exception"
                endpoint="/api/admin/catalogue/exceptions/action"
                csrfToken={data.csrfToken}
                body={{ kind: "ignore", exceptionId: selected.id }}
                reasonPrompt="Why should this strong-identity exception be ignored?"
                danger
              />
              <Link className="button button-secondary" href="/admin/catalogue">Back to Catalogue</Link>
            </div>
          </div>
        </article>}
      </div>}
    </section>
  </main>;
}
