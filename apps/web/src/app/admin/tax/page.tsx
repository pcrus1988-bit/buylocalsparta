import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { AdminTaxReconcileForm } from "../../../components/AdminTaxReconcileForm";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminTaxWorkspace } from "../../../lib/admin-tax-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Tax / myDATA", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminTaxWorkspace(principal); } catch { redirect("/admin"); }
  const pendingTimologio = data.documents.filter((document) => !document.aadeMark && (document.type === "retail_receipt" || document.type === "customer_invoice")).length;
  const reconciled = data.documents.filter((document) => Boolean(document.aadeMark)).length;
  const failed = data.documents.filter((document) => Boolean(document.lastError)).length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">AADE / timologio</div><h1>Tax / myDATA</h1><p className="lead">Το timologio παραμένει το κανάλι έκδοσης. Το KONTA MOY χρησιμοποιεί το myDATA REST API για ασφαλή ανάγνωση, συμφωνία και καταγραφή των επίσημων στοιχείων χωρίς να εκδίδει παραστατικό από το ERP API.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "AADE environment", value: data.environment },
      { label: "Issuance channel", value: data.issuanceChannel },
      { label: "Awaiting timologio", value: pendingTimologio, tone: pendingTimologio ? "attention" : "positive" },
      { label: "Reconciled", value: reconciled, tone: "positive", hint: failed ? `${failed} reconciliation errors` : "no reconciliation errors" }
    ]} />

    <section className="shell vendor-section">
      <div className="workspace-inline-note">AADE spec: {data.specVersion || "not configured"}. Η δοκιμή σύνδεσης είναι μόνο ανάγνωσης (RequestMyIncome) και δεν δημιουργεί, μεταδίδει ή ακυρώνει φορολογικό παραστατικό.</div>
      {data.environment !== "not_configured" && data.environment !== "development" && <div className="workspace-action-bar"><span>Έλεγχος των server-side AADE credentials χωρίς μεταβολή φορολογικών δεδομένων.</span><div className="workspace-action-buttons"><AdminActionButton label="Έλεγχος σύνδεσης AADE" endpoint="/api/admin/tax/connectivity" csrfToken={principal.csrfToken} successMessage="Η σύνδεση με την AADE επιβεβαιώθηκε (read-only)." /></div></div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Tax documents" title="Fiscal reconciliation queue" note="Κάθε πληρωμένο order δημιουργεί εσωτερική fiscal εργασία. Η έκδοση γίνεται στο timologio και μετά καταχωρίζονται εδώ ο επίσημος αριθμός, MARK, UID και QR." />
      {data.documents.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ακόμη fiscal work items." body="Τα πληρωμένα orders δημιουργούν εσωτερική fiscal εργασία, ενώ η νόμιμη έκδοση παραμένει στο timologio." /> : <div className="workspace-queue-list">{data.documents.map((document) => <article className="workspace-queue-card" key={document.id}>
        <div className="workspace-queue-head"><div><strong>{document.documentNumber ?? document.id}</strong><small>{document.type === "retail_receipt" ? "Απόδειξη" : document.type === "customer_invoice" ? "Τιμολόγιο" : document.type} · {document.orderId ?? "no order"}</small></div><span className="status-pill">{document.aadeMark ? "reconciled" : document.transmissionStatus}</span></div>
        <div className="workspace-queue-primary"><span>{document.grossMinor} {document.currency} minor units</span>{document.aadeMark && <span>MARK {document.aadeMark}</span>}{document.aadeUid && <span>UID recorded</span>}</div>
        {document.lastError && <p className="workspace-queue-summary">{document.lastError}</p>}
        <WorkspaceRecordDetails label="AADE & mapping references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Document ID</strong><span>{document.id}</span></div><div className="workspace-compact-row"><strong>Mapping / invoice type</strong><span>{document.mappingVersion ?? "—"} · {document.invoiceTypeCode ?? "—"}</span></div><div className="workspace-compact-row"><strong>MARK / UID</strong><span>{document.aadeMark ?? "—"} · {document.aadeUid ?? "—"}</span></div>{document.qrUrl && <div className="workspace-compact-row"><strong>QR</strong><a href={document.qrUrl} target="_blank" rel="noreferrer">Άνοιγμα επίσημου QR</a></div>}</div></WorkspaceRecordDetails>
        {!document.aadeMark && (document.type === "retail_receipt" || document.type === "customer_invoice") && <AdminTaxReconcileForm documentId={document.id} csrfToken={principal.csrfToken} />}
      </article>)}</div>}
    </div></section>
  </main>;
}
