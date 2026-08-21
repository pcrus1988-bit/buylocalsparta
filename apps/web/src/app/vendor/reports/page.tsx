import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReportBuilderFields } from "../../../components/ReportBuilderFields";
import { VendorActionNotice, VendorLifecycle } from "../../../components/VendorLifecycle";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { listReports, listSavedReportDefinitions, reportBuilderOptions } from "../../../lib/reporting-engine";
import { resolveReportPrincipal } from "../../../lib/reporting-principal";
import { createVendorReportAction, emailVendorReportAction, runSavedVendorReportAction, saveVendorReportDefinitionAction } from "./actions";

export const metadata: Metadata = { title: "Αναφορές", robots: { index: false, follow: false } };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function first(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] ?? "" : v ?? ""; }
function euro(minor: unknown) { const n = Number(minor ?? 0); return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format((Number.isFinite(n) ? n : 0) / 100); }

const STATUS_LABELS: Record<string, string> = {
  queued: "Περιμένει δημιουργία",
  running: "Δημιουργείται",
  ready: "Έτοιμη",
  failed: "Δεν ολοκληρώθηκε"
};

function reportSteps(status: string) {
  if (status === "ready") return [{ label: "Αίτημα", tone: "done" as const }, { label: "Δημιουργία PDF", tone: "done" as const }, { label: "Έτοιμη", tone: "done" as const }];
  if (status === "failed") return [{ label: "Αίτημα", tone: "done" as const }, { label: "Η δημιουργία απέτυχε", tone: "blocked" as const }, { label: "Έτοιμη", tone: "future" as const }];
  if (status === "running") return [{ label: "Αίτημα", tone: "done" as const }, { label: "Δημιουργία PDF", tone: "current" as const }, { label: "Έτοιμη", tone: "future" as const }];
  return [{ label: "Αίτημα", tone: "done" as const }, { label: "Περιμένει δημιουργία", tone: "waiting" as const }, { label: "Έτοιμη", tone: "future" as const }];
}

function QuickReport({ title, body, preset, domains }: { title: string; body: string; preset: string; domains?: readonly string[] }) {
  return <article className="workspace-queue-card">
    <strong>{title}</strong>
    <p className="workspace-queue-summary">{body}</p>
    <form action={createVendorReportAction}>
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="preset" value={preset} />
      {domains?.map((domain) => <input type="hidden" name="domains" value={domain} key={domain} />)}
      <button className="button" type="submit">Δημιουργία PDF</button>
    </form>
  </article>;
}

export default async function VendorReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const sessionPrincipal = await getVendorSession();
  if (!sessionPrincipal) redirect("/vendor/login");
  const principal = await resolveReportPrincipal(sessionPrincipal);
  const query = await searchParams;
  const [options, reports, saved] = await Promise.all([
    reportBuilderOptions("vendor", principal), listReports("vendor", principal), listSavedReportDefinitions("vendor", principal)
  ]);
  const ready = reports.filter((report) => report.status === "ready");
  const latest = reports[0];
  const metrics = (latest?.summary?.metrics ?? {}) as Record<string, unknown>;
  const error = first(query.error);

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Στατιστικά · αναφορές</div><h1>Αναφορές PDF</h1>
      <p className="lead">Δημιούργησε τις συνηθισμένες αναφορές με ένα κλικ. Χρησιμοποίησε την προχωρημένη προσαρμογή μόνο όταν χρειάζεσαι συγκεκριμένο προϊόν, κατηγορία, περίοδο ή συνδυασμό δεδομένων.</p>
    </div></section>

    <WorkspaceMetricStrip items={[
      { label: "Αναφορές", value: reports.length },
      { label: "Έτοιμα PDF", value: ready.length, tone: ready.length ? "positive" : "default" },
      { label: "Τελευταίες καθαρές πωλήσεις", value: euro(metrics.netSalesMinor) },
      { label: "Τελευταία προμήθεια", value: euro(metrics.commissionMinor) }
    ]} />

    {error ? <section className="shell vendor-section"><VendorActionNotice tone="danger" title="Η αναφορά δεν ολοκληρώθηκε">Δοκίμασε ξανά. Αν το πρόβλημα συνεχίζεται, οι τεχνικές λεπτομέρειες μπορούν να δοθούν στην υποστήριξη.<WorkspaceRecordDetails label="Τεχνική λεπτομέρεια"><span className="vendor-technical-id">{error}</span></WorkspaceRecordDetails></VendorActionNotice></section> : null}
    {first(query.created) === "1" ? <section className="shell vendor-section"><VendorActionNotice tone="positive" title="Η αναφορά δημιουργήθηκε">Το PDF είναι διαθέσιμο στην ενότητα «Πρόσφατες αναφορές».</VendorActionNotice></section> : null}
    {first(query.emailed) === "1" ? <section className="shell vendor-section"><VendorActionNotice tone="positive" title="Το email στάλθηκε">Ο σύνδεσμος της αναφοράς παραμένει προστατευμένος και απαιτεί vendor login.</VendorActionNotice></section> : null}
    {first(query.saved) === "1" ? <section className="shell vendor-section"><VendorActionNotice tone="positive" title="Το πρότυπο αποθηκεύτηκε" /></section> : null}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Γρήγορες αναφορές" title="Οι πιο χρήσιμες αναφορές με ένα κλικ" note="Από προεπιλογή χρησιμοποιούνται οι τελευταίες 30 ημέρες. Μπορείς να αλλάξεις περίοδο στην προχωρημένη προσαρμογή." />
      <WorkspaceHowItWorks className="vendor-page-help">
        <p>Επίλεξε την αναφορά που θέλεις και πάτησε «Δημιουργία PDF». Η αναφορά είναι πάντα περιορισμένη στα δεδομένα του δικού σου καταστήματος.</p>
        <p>Αν χρειάζεσαι διαφορετικές ημερομηνίες, συγκεκριμένο προϊόν ή πιο σύνθετη σύγκριση, άνοιξε την «Προχωρημένη προσαρμογή» παρακάτω.</p>
      </WorkspaceHowItWorks>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
        <QuickReport title="Πωλήσεις & προμήθειες — 30 ημέρες" body="Πωλήσεις, καθαρή αξία, προμήθειες και σχετικές επιστροφές." preset="sales_commissions" />
        <QuickReport title="Απόθεμα — 30 ημέρες" body="Τρέχον stock, δεσμεύσεις, διαθέσιμα τεμάχια και κινήσεις αποθέματος." preset="inventory" />
        <QuickReport title="Απόδοση προϊόντων — 30 ημέρες" body="Προβολές, καλάθι, checkout, αγορές και απόδοση προϊόντων." preset="performance" />
        <QuickReport title="Επιστροφές — 30 ημέρες" body="Αναφορά επικεντρωμένη στις επιστροφές του καταστήματός σου." preset="custom" domains={["returns"]} />
        <QuickReport title="Πλήρης μηνιαία αναφορά" body="Συνδυασμένη εικόνα πωλήσεων, προμηθειών, αποθέματος, επιστροφών και απόδοσης." preset="full" />
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Προχωρημένα" title="Προσαρμοσμένη αναφορά" note="Χρησιμοποίησέ την όταν θέλεις να περιορίσεις την αναφορά σε συγκεκριμένη περίοδο, κατηγορία, προϊόν, μάρκα ή σημείο." />
      <details className="workspace-tool-panel">
        <summary><span><strong>Προχωρημένη προσαρμογή</strong><small>Φίλτρα, σύγκριση περιόδων και επιλογή δεδομένων.</small></span></summary>
        <div className="workspace-tool-body">
          <form action={createVendorReportAction}>
            <ReportBuilderFields admin={false} options={options} />
            <article className="workspace-queue-card" style={{ marginTop: 12 }}>
              <label><small>Όνομα αποθηκευμένου προτύπου — προαιρετικό</small><input name="templateName" placeholder="π.χ. Μηνιαία απόδοση & απόθεμα" style={{ width: "100%" }} /></label>
            </article>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <button className="button" type="submit">Δημιουργία PDF</button>
              <button className="button button-secondary" type="submit" formAction={saveVendorReportDefinitionAction}>Αποθήκευση ως πρότυπο</button>
            </div>
          </form>
        </div>
      </details>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Αποθηκευμένα" title="Τα πρότυπά σου" note="Ένα αποθηκευμένο πρότυπο θυμάται τα φίλτρα και τις επιλογές ώστε να ξαναδημιουργείς την ίδια αναφορά γρήγορα." />
      {saved.length ? <div className="workspace-queue-list">{saved.map((item) => <article className="workspace-queue-card" key={item.publicId}>
        <div className="workspace-queue-head"><div><strong>{item.name}</strong><small>{item.spec.fromDate} → {item.spec.toDate}</small></div><span className="vendor-merchant-status">Αποθηκευμένο</span></div>
        <p className="workspace-queue-summary">{item.spec.domains.length} κατηγορίες δεδομένων · {item.spec.comparePrevious ? "με σύγκριση προηγούμενης περιόδου" : "χωρίς σύγκριση"}</p>
        <form action={runSavedVendorReportAction}><input type="hidden" name="templateId" value={item.publicId} /><button className="button button-secondary" type="submit">Δημιουργία νέου PDF</button></form>
        <WorkspaceRecordDetails label="Τεχνικές επιλογές προτύπου"><span>{item.spec.preset} · {item.spec.domains.join(" · ")}</span></WorkspaceRecordDetails>
      </article>)}</div> : <article className="workspace-queue-card"><strong>Δεν υπάρχουν ακόμη αποθηκευμένα πρότυπα.</strong><p>Αποθήκευσε μία προσαρμοσμένη αναφορά αν σκοπεύεις να την επαναλαμβάνεις.</p></article>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ιστορικό" title="Πρόσφατες αναφορές" note="Κάθε κάρτα δείχνει αν η αναφορά περιμένει, δημιουργείται, ολοκληρώθηκε ή χρειάζεται επανάληψη." />
      {reports.length ? <div className="workspace-queue-list">{reports.map((report) => {
        const m = (report.summary?.metrics ?? {}) as Record<string, unknown>;
        const insights = Array.isArray(report.summary?.insights) ? report.summary.insights as string[] : [];
        return <article className="workspace-queue-card" key={report.publicId}>
          <div className="workspace-queue-head"><div><strong className="vendor-case-title">{report.title}</strong><small>{new Date(report.requestedAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}</small></div><span className="vendor-merchant-status">{STATUS_LABELS[report.status] ?? report.status}</span></div>
          <VendorLifecycle steps={reportSteps(report.status)} ariaLabel={`Κατάσταση αναφοράς ${report.title}`} />
          {report.status === "ready" ? <>
            <div className="workspace-queue-primary"><span>Καθαρές πωλήσεις {euro(m.netSalesMinor)}</span><span>Προμήθεια {euro(m.commissionMinor)}</span><span>{Number(m.views ?? 0)} προβολές</span><span>{Number(m.purchases ?? 0)} αγορές</span></div>
            {insights.slice(0, 2).map((insight, index) => <p key={index} style={{ margin: "6px 0", opacity: .78 }}>{insight}</p>)}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><a className="button" href={`/api/reports/${report.publicId}/download`}>Άνοιγμα PDF</a>
              <form action={emailVendorReportAction}><input type="hidden" name="reportId" value={report.publicId} /><button className="button button-secondary" type="submit">Αποστολή στο email μου</button></form></div>
          </> : report.status === "failed" ? <VendorActionNotice tone="danger" title="Η δημιουργία δεν ολοκληρώθηκε">Δημιούργησε ξανά την αναφορά. Αν το πρόβλημα επαναλαμβάνεται, άνοιξε τις τεχνικές λεπτομέρειες.<WorkspaceRecordDetails label="Τεχνική λεπτομέρεια"><span className="vendor-technical-id">{report.errorMessage ?? "report_generation_failed"}</span></WorkspaceRecordDetails></VendorActionNotice> : <VendorActionNotice tone="waiting" title="Η αναφορά δεν είναι ακόμη έτοιμη">Η σελίδα θα δείξει το PDF μόλις ολοκληρωθεί η δημιουργία.</VendorActionNotice>}
          <WorkspaceRecordDetails label="Τεχνικές λεπτομέρειες αναφοράς"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Report ID</strong><span className="vendor-technical-id">{report.publicId}</span></div><div className="workspace-compact-row"><strong>Μέγεθος</strong><span>{report.rowCount} γραμμές δεδομένων · {report.pageCount} σελίδες</span></div></div></WorkspaceRecordDetails>
        </article>;
      })}</div> : <article className="workspace-queue-card"><strong>Δεν έχει δημιουργηθεί ακόμη αναφορά.</strong><p>Ξεκίνα από μία από τις γρήγορες αναφορές παραπάνω.</p></article>}
    </section>
  </main>;
}
