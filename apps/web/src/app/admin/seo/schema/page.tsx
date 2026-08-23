import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminActionButton } from "../../../../components/AdminActionButton";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { getSeoSchemaDiagnosticsWorkspace, type SeoSchemaDiagnosticState } from "../../../../lib/seo-schema-diagnostics";

export const metadata: Metadata = {
  title: "Structured Data · SEO Admin",
  robots: { index: false, follow: false, nocache: true }
};

function stateLabel(state: SeoSchemaDiagnosticState) {
  if (state === "healthy") return "Healthy";
  if (state === "missing") return "Missing schema";
  if (state === "invalid") return "Invalid JSON-LD";
  if (state === "unexpected") return "Unexpected schema";
  if (state === "suppressed") return "Schema suppressed";
  return "Not checked";
}

function kindLabel(kind: string) {
  if (kind === "product") return "Product";
  if (kind === "partner_vendor") return "Partner vendor";
  return "Research vendor";
}

function when(value?: string) {
  return value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value)) : "—";
}

export default async function AdminSeoSchemaPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await getSeoSchemaDiagnosticsWorkspace(principal);
  const canWrite = hasAdminPermission(principal, "content.write");
  const attention = data.metrics.missing + data.metrics.invalid + data.metrics.unexpected;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Structured Data</div>
        <h1>Structured-data diagnostics</h1>
        <p className="lead">Compare governed schema policy with immutable production JSON-LD evidence. Product and vendor pages are schema-managed; static, CMS and category pages are deliberately left unjudged until they adopt an explicit governed schema contract.</p>
      </div>
      <aside className={attention ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Managed schema URLs</span>
        <strong>{data.metrics.managed}</strong>
        <p>{attention} needing attention · {data.metrics.notChecked} awaiting fresh evidence</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="Structured-data workspace navigation">
        <Link href="/admin/seo">Overview</Link>
        <Link href="/admin/seo/pages">Pages</Link>
        <Link href="/admin/seo/schema">Structured Data</Link>
        <Link href="/admin/seo/reports">Reports</Link>
        <Link href="/admin/seo/issues">Issues</Link>
        <Link href="/admin/seo/crawl">Crawl</Link>
        <Link href="/admin/seo/search-console">Search Console</Link>
      </nav>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Schema allowed", value: data.metrics.allowed, tone: "positive" },
      { label: "Healthy evidence", value: data.metrics.healthy, tone: data.metrics.healthy ? "positive" : "default" },
      { label: "Missing / invalid", value: data.metrics.missing + data.metrics.invalid, tone: data.metrics.missing + data.metrics.invalid ? "attention" : "positive", hint: `${data.metrics.invalid} invalid JSON-LD` },
      { label: "Not checked", value: data.metrics.notChecked, tone: data.metrics.notChecked ? "attention" : "positive", hint: `${data.metrics.suppressed} intentionally suppressed` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Governed expectations" title="What each public entity should emit" note="Product pages require Product, Offer and BreadcrumbList types when schema is allowed. Vendor dossiers require LocalBusiness. An explicit entity schema-deny decision suppresses the expectation and production markup should disappear too." />
      {!data.persistenceAvailable && <div className="workspace-empty-state"><strong>Structured-data history is unavailable.</strong><span>PostgreSQL schema 122 and a fresh production crawl are required before observed JSON-LD evidence can be shown.</span></div>}
      <div className="admin-domain-card-grid" style={{ marginTop: 18 }}>
        <article className="admin-domain-card"><span>Commerce</span><strong>Product pages</strong><p>Required when schema is allowed: Product, Offer and BreadcrumbList.</p><b>3</b><i>Required types</i></article>
        <article className="admin-domain-card"><span>Local SEO</span><strong>Vendor dossiers</strong><p>Required when schema is allowed: LocalBusiness with governed public business data.</p><b>1</b><i>Required type</i></article>
        <article className="admin-domain-card"><span>Unmanaged families</span><strong>Static / CMS / category</strong><p>No automatic schema requirement is imposed until those templates adopt an explicit contract.</p><b>0</b><i>False positives avoided</i></article>
      </div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Production evidence" title="Expected versus observed JSON-LD" note="Evidence comes from the same governed production crawler used by the durable SEO issue lifecycle. A targeted recheck captures a new immutable observation and may automatically resolve prior structured-data findings when the route is clean." />
      {data.rows.length === 0 ? <div className="workspace-empty-state"><strong>No managed schema routes are currently available.</strong><span>Product and vendor entries will appear as the governed crawl graph becomes available.</span></div> : <div className="workspace-queue-list">{data.rows.map((row) => {
        const needsAttention = row.state === "missing" || row.state === "invalid" || row.state === "unexpected";
        return <article className="workspace-queue-card" key={row.route}>
          <div className="workspace-queue-head"><div><strong>{row.label}</strong><small>{kindLabel(row.kind)} · {row.route}</small></div><span className="status-pill">{stateLabel(row.state)}</span></div>
          <div className="workspace-queue-primary"><span>Expected: <strong>{row.schemaAllowed ? row.expectedTypes.join(" · ") : "suppressed by policy"}</strong> · Observed: <strong>{row.blockCount === undefined ? "no structured-data observation" : row.observedTypes.length ? row.observedTypes.join(" · ") : `${row.blockCount} block${row.blockCount === 1 ? "" : "s"}, no parsed @type`}</strong></span></div>
          <div className="workspace-compact-list" style={{ marginTop: 10 }}>
            <div className="workspace-compact-row"><strong>Index policy</strong><span>{row.indexAllowed ? "Index allowed" : "Held back"}</span></div>
            <div className="workspace-compact-row"><strong>Schema policy</strong><span>{row.schemaAllowed ? "Emit governed schema" : "Do not emit schema"}</span></div>
            <div className="workspace-compact-row"><strong>JSON-LD blocks</strong><span>{row.blockCount ?? "Not checked"}{row.parseErrorCount ? ` · ${row.parseErrorCount} parse errors` : ""}</span></div>
            <div className="workspace-compact-row"><strong>Missing required types</strong><span>{row.missingTypes.length ? row.missingTypes.join(" · ") : "None"}</span></div>
            <div className="workspace-compact-row"><strong>Evidence</strong><span>{row.runId ? `${row.runId} · ${when(row.capturedAt)}` : "No schema-aware crawl yet"}</span></div>
          </div>
          <div className="workspace-action-bar"><span>{needsAttention ? "Correct the public renderer or governed schema decision, then verify with fresh production evidence." : row.state === "not_checked" ? "Capture fresh production evidence before judging schema coverage." : "Current policy/evidence relationship is consistent."}</span><div className="workspace-action-buttons">
            {row.pageId && <Link className="text-link" href={`/admin/seo/pages/${encodeURIComponent(row.pageId)}`}>Open SEO record →</Link>}
            <Link className="text-link" href={row.route} target="_blank">Open public page ↗</Link>
            {canWrite && <AdminActionButton label="Recheck production" endpoint="/api/admin/seo/crawl/recheck" csrfToken={principal.csrfToken} body={{ route: row.route }} />}
          </div></div>
        </article>;
      })}</div>}
    </div></section>
  </main>;
}
