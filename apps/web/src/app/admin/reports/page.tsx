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
  const [options, reports, saved] = await Promise.all([
    reportBuilderOptions("admin", principal), listReports("admin", principal), listSavedReportDefinitions("admin", principal)
  ]);
  const ready = reports.filter(r => r.status === "ready");
  const latest = reports[0];
  const metrics = (latest?.summary?.metrics ?? {}) as Record<string, unknown>;
  const error = first(query.error);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Marketplace reporting intelligence</div><h1>Reports</h1>
      <p className="lead">Ενοποιημένο report engine για ολόκληρο το marketplace ή για οποιονδήποτε συνδυασμό vendor, category tree, product, brand και location. Συνδυάζει commerce, commissions, inventory, funnel, fairness, returns και search demand σε audit-ready PDF.</p>
    </div></section>

    <WorkspaceMetricStrip items={[
      { label: "My reports", value: reports.length }, { label: "Ready PDFs", value: ready.length },
      { label: "Latest net sales", value: euro(metrics.netSalesMinor) }, { label: "Latest commission", value: euro(metrics.commissionMinor) }
    ]} />

    {error ? <section className="shell vendor-section"><article className="workspace-queue-card" style={{ borderColor: "currentColor" }}><strong>Η αναφορά δεν ολοκληρώθηκε</strong><p>{error}</p></article></section> : null}
    {first(query.created) === "1" ? <section className="shell vendor-section"><article className="workspace-queue-card"><strong>Η αναφορά δημιουργήθηκε.</strong><p>Το PDF, η περίληψη, τα datasets και το audit trail έχουν αποθηκευτεί.</p></article></section> : null}
    {first(query.emailed) === "1" ? <section className="shell vendor-section"><article className="workspace-queue-card"><strong>Το report email στάλθηκε.</strong></article></section> : null}
    {first(query.saved) === "1" ? <section className="shell vendor-section"><article className="workspace-queue-card"><strong>Η τρέχουσα marketplace report configuration αποθηκεύτηκε.</strong></article></section> : null}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="New report" title="Marketplace Report Builder" note="Χωρίς vendor filter το scope είναι ολόκληρο το marketplace. Με vendor filter το ίδιο engine λειτουργεί ως drill-down στον συγκεκριμένο συνεργάτη." />
      <form action={createAdminReportAction}>
        <ReportBuilderFields admin options={options} />
        <article className="workspace-queue-card" style={{ marginTop: 12 }}>
          <label><small>Όνομα saved configuration — προαιρετικό</small><input name="templateName" placeholder="π.χ. Monthly marketplace board report" style={{ width: "100%" }} /></label>
          <small style={{ display: "block", marginTop: 7, opacity: .72 }}>Το «Save configuration» αποθηκεύει το πλήρες τρέχον scope: vendor/market, category tree, product, brand, location, domains, dates και comparison settings.</small>
        </article>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button className="button" type="submit">Generate comprehensive PDF</button>
          <button className="button button-secondary" type="submit" formAction={saveAdminReportDefinitionAction}>Save configuration</button>
        </div>
      </form>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Capabilities" title="Τι καταλαβαίνει το report engine" note="Ο planner επιλέγει datasets και joins από validated dimensions — όχι arbitrary SQL." />
      <div className="workspace-dual-grid">
        <article className="workspace-queue-card"><strong>Commercial</strong><p>Orders, units, gross/net sales, discounts/refunds, commission net/VAT/total και vendor proceeds από historical snapshots.</p></article>
        <article className="workspace-queue-card"><strong>Catalogue & Inventory</strong><p>Category hierarchy, products/variants, brands, vendor offers, locations, ATS stock, reservations, blocked/safety stock και freshness.</p></article>
        <article className="workspace-queue-card"><strong>Performance & Fairness</strong><p>Fair impressions → views → engagement → cart → checkout → purchase, με conversion metrics και weak-conversion detection.</p></article>
        <article className="workspace-queue-card"><strong>Demand intelligence</strong><p>Admin-only search terms, zero-result demand, clicks και average results για catalogue/acquisition decisions.</p></article>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Saved" title="Saved report definitions" note="Ιδιωτικά declarative templates για επαναλαμβανόμενες αναλύσεις και one-click rerun." />
      {saved.length ? <div className="workspace-queue-list">{saved.map(item => <article className="workspace-queue-card" key={item.publicId}>
        <div className="workspace-queue-head"><div><strong>{item.name}</strong><small>{item.spec.fromDate} → {item.spec.toDate}</small></div><span className="status-pill">{item.spec.vendorId ? "vendor drill-down" : "market"}</span></div>
        <p>{item.spec.domains.join(" · ")}</p>
        <form action={runSavedAdminReportAction}><input type="hidden" name="templateId" value={item.publicId} /><button className="button button-secondary" type="submit">Run template</button></form>
      </article>)}</div> : <article className="workspace-queue-card"><strong>Δεν υπάρχουν ακόμη saved definitions.</strong></article>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="History" title="Recent generated reports" note="Τα PDFs είναι private, έχουν retention expiry και κάθε download/email γράφεται στο delivery audit." />
      {reports.length ? <div className="workspace-queue-list">{reports.map(report => {
        const m = (report.summary?.metrics ?? {}) as Record<string, unknown>;
        const insights = Array.isArray(report.summary?.insights) ? report.summary.insights as string[] : [];
        return <article className="workspace-queue-card" key={report.publicId}>
          <div className="workspace-queue-head"><div><strong>{report.title}</strong><small>{new Date(report.requestedAt).toLocaleString("el-GR")} · {report.rowCount} rows · {report.pageCount} pages</small></div><span className="status-pill">{report.status}</span></div>
          {report.status === "ready" ? <>
            <div className="workspace-queue-primary"><span>Net {euro(m.netSalesMinor)}</span><span>Commission {euro(m.commissionMinor)}</span><span>{Number(m.views ?? 0)} views</span><span>{Number(m.outOfStock ?? 0)} OOS</span></div>
            {insights.slice(0, 3).map((x, i) => <p key={i} style={{ margin: "6px 0", opacity: .78 }}>{x}</p>)}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><a className="button" href={`/api/reports/${report.publicId}/download`}>Download PDF</a>
              <form action={emailAdminReportAction}><input type="hidden" name="reportId" value={report.publicId} /><button className="button button-secondary" type="submit">Email to my verified account</button></form></div>
          </> : report.errorMessage ? <p>{report.errorMessage}</p> : <p>Queued / processing. Με async worker ενεργό, τα heavy reports ολοκληρώνονται εκτός request cycle.</p>}
        </article>;
      })}</div> : <article className="workspace-queue-card"><strong>Δεν έχει δημιουργηθεί ακόμη admin report.</strong></article>}
    </section>
  </main>;
}
