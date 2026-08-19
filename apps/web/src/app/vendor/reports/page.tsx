import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { ReportBuilderFields } from "../../../components/ReportBuilderFields";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { listReports, listSavedReportDefinitions, reportBuilderOptions } from "../../../lib/reporting-engine";
import { createVendorReportAction, emailVendorReportAction, saveVendorReportDefinitionAction } from "./actions";

export const metadata: Metadata = { title: "Vendor Reports", robots: { index: false, follow: false } };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function first(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] ?? "" : v ?? ""; }
function euro(minor: unknown) { const n = Number(minor ?? 0); return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format((Number.isFinite(n) ? n : 0) / 100); }

export default async function VendorReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const query = await searchParams;
  const [options, reports, saved] = await Promise.all([
    reportBuilderOptions("vendor", principal), listReports("vendor", principal), listSavedReportDefinitions("vendor", principal)
  ]);
  const ready = reports.filter(r => r.status === "ready");
  const latest = reports[0];
  const metrics = (latest?.summary?.metrics ?? {}) as Record<string, unknown>;
  const error = first(query.error);

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Reporting intelligence</div><h1>Reports</h1>
      <p className="lead">Δημιούργησε ελεγχόμενες, αναλυτικές αναφορές PDF για πωλήσεις, προμήθειες, επιστροφές, inventory, performance και Fair Vendor Exposure. Κάθε PDF ξεκινά με executive summary και συνεχίζει με τα σχετικά datasets.</p>
    </div></section>

    <WorkspaceMetricStrip items={[
      { label: "Reports", value: reports.length }, { label: "Ready PDFs", value: ready.length },
      { label: "Latest net sales", value: euro(metrics.netSalesMinor) }, { label: "Latest commission", value: euro(metrics.commissionMinor) }
    ]} />

    {error ? <section className="shell vendor-section"><article className="workspace-queue-card" style={{ borderColor: "currentColor" }}><strong>Η αναφορά δεν ολοκληρώθηκε</strong><p>{error}</p></article></section> : null}
    {first(query.created) === "1" ? <section className="shell vendor-section"><article className="workspace-queue-card"><strong>Η αναφορά δημιουργήθηκε.</strong><p>Το PDF και το audit record είναι διαθέσιμα στην ενότητα «Πρόσφατες αναφορές».</p></article></section> : null}
    {first(query.emailed) === "1" ? <section className="shell vendor-section"><article className="workspace-queue-card"><strong>Το email στάλθηκε.</strong><p>Ο σύνδεσμος παραμένει προστατευμένος και απαιτεί vendor login.</p></article></section> : null}
    {first(query.saved) === "1" ? <section className="shell vendor-section"><article className="workspace-queue-card"><strong>Το report template αποθηκεύτηκε.</strong></article></section> : null}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="New report" title="Report Builder" note="Το scope είναι πάντα κλειδωμένο στο δικό σου vendor account. Τα raw customer/competitor events δεν είναι διαθέσιμα." />
      <form action={createVendorReportAction}>
        <ReportBuilderFields admin={false} options={options} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}><button className="button" type="submit">Δημιουργία PDF report</button></div>
      </form>
      <form action={saveVendorReportDefinitionAction} className="workspace-queue-card" style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <input type="hidden" name="preset" value="full" /><input type="hidden" name="includeDetails" value="on" />
        <label style={{ flex: "1 1 260px" }}><small>Γρήγορο αποθηκευμένο template</small><input name="templateName" required placeholder="π.χ. Μηνιαία πλήρης αναφορά" style={{ width: "100%" }} /></label>
        <button className="button button-secondary" type="submit">Αποθήκευση full template</button>
      </form>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Saved" title="Αποθηκευμένα report templates" note="Τα templates αποθηκεύουν declarative ReportSpec — ποτέ SQL." />
      {saved.length ? <div className="workspace-queue-list">{saved.map(item => <article className="workspace-queue-card" key={item.publicId}>
        <div className="workspace-queue-head"><div><strong>{item.name}</strong><small>{item.spec.fromDate} → {item.spec.toDate}</small></div><span className="status-pill">{item.spec.preset}</span></div>
        <p>{item.spec.domains.join(" · ")}</p>
      </article>)}</div> : <article className="workspace-queue-card"><strong>Δεν υπάρχουν ακόμη αποθηκευμένα templates.</strong></article>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="History" title="Πρόσφατες αναφορές" note="Τα generated PDFs διατηρούνται ιδιωτικά με περιορισμένο retention και κάθε download/email καταγράφεται." />
      {reports.length ? <div className="workspace-queue-list">{reports.map(report => {
        const m = (report.summary?.metrics ?? {}) as Record<string, unknown>;
        const insights = Array.isArray(report.summary?.insights) ? report.summary.insights as string[] : [];
        return <article className="workspace-queue-card" key={report.publicId}>
          <div className="workspace-queue-head"><div><strong>{report.title}</strong><small>{new Date(report.requestedAt).toLocaleString("el-GR")} · {report.rowCount} data rows · {report.pageCount} pages</small></div><span className="status-pill">{report.status}</span></div>
          {report.status === "ready" ? <>
            <div className="workspace-queue-primary"><span>Net {euro(m.netSalesMinor)}</span><span>Commission {euro(m.commissionMinor)}</span><span>{Number(m.views ?? 0)} views</span><span>{Number(m.purchases ?? 0)} sales</span></div>
            {insights.slice(0, 2).map((x, i) => <p key={i} style={{ margin: "6px 0", opacity: .78 }}>{x}</p>)}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><a className="button" href={`/api/reports/${report.publicId}/download`}>Download PDF</a>
              <form action={emailVendorReportAction}><input type="hidden" name="reportId" value={report.publicId} /><button className="button button-secondary" type="submit">Αποστολή στο email μου</button></form></div>
          </> : report.errorMessage ? <p>{report.errorMessage}</p> : <p>Η αναφορά βρίσκεται σε επεξεργασία.</p>}
        </article>;
      })}</div> : <article className="workspace-queue-card"><strong>Δεν έχει δημιουργηθεί ακόμη αναφορά.</strong></article>}
    </section>
  </main>;
}
