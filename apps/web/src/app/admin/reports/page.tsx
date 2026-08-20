import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { ReportBuilderFields } from "../../../components/ReportBuilderFields";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { assertAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { listReports, listSavedReportDefinitions, reportBuilderOptions } from "../../../lib/reporting-engine";
import { resolveReportPrincipal } from "../../../lib/reporting-principal";
import { createAdminReportAction, emailAdminReportAction, runSavedAdminReportAction, saveAdminReportDefinitionAction } from "./actions";

export const metadata: Metadata = { title: "Admin Reports", robots: { index: false, follow: false } };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function first(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] ?? "" : v ?? ""; }
function euro(minor: unknown) { const n = Number(minor ?? 0); return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format((Number.isFinite(n) ? n : 0) / 100); }

export default async function AdminReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const sessionPrincipal = await getAdminSession();
  if (!sessionPrincipal) redirect("/admin/login");
  assertAdminPermission(sessionPrincipal, "analytics.market.read");
  const principal = await resolveReportPrincipal(sessionPrincipal);
  const query = await searchParams;
  const [options, reports, saved] = await Promise.all([reportBuilderOptions("admin", principal), listReports("admin", principal), listSavedReportDefinitions("admin", principal)]);
  const ready = reports.filter(r => r.status === "ready");
  const latest = reports[0];
  const metrics = (latest?.summary?.metrics ?? {}) as Record<string, unknown>;
  const error = first(query.error);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section id="reports-builder" className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Insights · reporting</div><h1>Reports</h1><p className="lead">Generate, save and revisit auditable marketplace analysis without mixing the builder, templates and report history into one undifferentiated page.</p></div></section>
    <section className="shell admin-local-tabs-shell"><nav className="admin-local-tabs" aria-label="Reports sections"><a href="#reports-builder">Builder</a><a href="#reports-saved">Saved</a><a href="#reports-history">History</a></nav></section>
    <WorkspaceMetricStrip items={[{ label: "My reports", value: reports.length }, { label: "Ready PDFs", value: ready.length }, { label: "Latest net sales", value: euro(metrics.netSalesMinor) }, { label: "Latest commission", value: euro(metrics.commissionMinor) }]} />

    {error ? <section className="shell vendor-section"><article className="workspace-inline-note"><strong>Η αναφορά δεν ολοκληρώθηκε:</strong> {error}</article></section> : null}
    {first(query.created) === "1" ? <section className="shell vendor-section"><div className="workspace-inline-note">Η αναφορά δημιουργήθηκε και αποθηκεύτηκε με summary, datasets και audit trail.</div></section> : null}
    {first(query.emailed) === "1" ? <section className="shell vendor-section"><div className="workspace-inline-note">Το report email στάλθηκε.</div></section> : null}
    {first(query.saved) === "1" ? <section className="shell vendor-section"><div className="workspace-inline-note">Η report configuration αποθηκεύτηκε.</div></section> : null}

    <section className="shell vendor-section admin-anchor-section"><WorkspaceSectionHeading eyebrow="Builder" title="Marketplace Report Builder" note="Χωρίς vendor filter το scope είναι ολόκληρο το marketplace. Με vendor filter λειτουργεί ως drill-down στον συγκεκριμένο συνεργάτη." /><form action={createAdminReportAction}><ReportBuilderFields admin options={options} /><article className="workspace-tool-panel admin-report-save"><label><span>Saved configuration name — optional</span><input name="templateName" placeholder="π.χ. Monthly marketplace board report" /></label><small>Αποθηκεύεται ολόκληρο το declarative scope: market/vendor, category tree, product, brand, location, domains, dates και comparison settings.</small></article><div className="workspace-action-buttons admin-report-builder-actions"><button className="button" type="submit">Generate comprehensive PDF</button><button className="button button-secondary" type="submit" formAction={saveAdminReportDefinitionAction}>Save configuration</button></div></form><details className="workspace-tool-panel admin-report-capabilities"><summary><span><strong>What the report engine covers</strong><small>Validated datasets and dimensions — never arbitrary SQL.</small></span></summary><div className="admin-report-capability-grid"><div><strong>Commercial</strong><span>Orders, units, sales, refunds, commissions, vendor proceeds.</span></div><div><strong>Catalogue & Inventory</strong><span>Taxonomy, products, offers, locations, ATS, reservations and freshness.</span></div><div><strong>Performance & Fairness</strong><span>Impressions → views → cart → checkout → purchase and fairness signals.</span></div><div><strong>Demand intelligence</strong><span>Search demand, zero-results and click behaviour.</span></div></div></details></section>

    <section id="reports-saved" className="vendor-section section-tint admin-anchor-section"><div className="shell"><WorkspaceSectionHeading eyebrow="Saved" title="Saved report definitions" note="Private declarative templates for repeated analyses and one-click reruns." />{saved.length ? <div className="admin-report-template-grid">{saved.map(item => <article className="admin-report-template" key={item.publicId}><span>{item.spec.vendorId ? "Vendor drill-down" : "Market"}</span><strong>{item.name}</strong><small>{item.spec.fromDate} → {item.spec.toDate}</small><p>{item.spec.domains.join(" · ")}</p><form action={runSavedAdminReportAction}><input type="hidden" name="templateId" value={item.publicId} /><button className="button button-secondary" type="submit">Run template</button></form></article>)}</div> : <div className="workspace-inline-note">Δεν υπάρχουν ακόμη saved definitions.</div>}</div></section>

    <section id="reports-history" className="shell vendor-section admin-anchor-section"><WorkspaceSectionHeading eyebrow="History" title="Generated reports" note="Private PDFs with retention expiry; each download/email is written to delivery audit." />{reports.length ? <div className="admin-directory-table admin-report-history" role="table" aria-label="Generated reports"><div className="admin-directory-head" role="row"><span>Report</span><span>Status</span><span>Rows</span><span>Pages</span><span>Net sales</span><span>Actions</span></div>{reports.map(report => { const m = (report.summary?.metrics ?? {}) as Record<string, unknown>; return <div className="admin-directory-row" role="row" key={report.publicId}><span className="admin-directory-identity"><strong>{report.title}</strong><small>{new Date(report.requestedAt).toLocaleString("el-GR")}</small></span><span><span className="status-pill">{report.status}</span></span><span>{report.rowCount}</span><span>{report.pageCount}</span><span>{report.status === "ready" ? euro(m.netSalesMinor) : "—"}</span><span className="admin-report-row-actions">{report.status === "ready" ? <><a className="text-link" href={`/api/reports/${report.publicId}/download`}>PDF</a><form action={emailAdminReportAction}><input type="hidden" name="reportId" value={report.publicId} /><button className="text-link" type="submit">Email</button></form></> : <small>{report.errorMessage ?? "Processing"}</small>}</span></div>})}</div> : <div className="workspace-inline-note">Δεν έχει δημιουργηθεί ακόμη admin report.</div>}</section>
  </main>;
}
