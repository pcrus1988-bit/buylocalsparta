import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { MyDataConnectivityButton } from "../../../components/MyDataConnectivityButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminTaxWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { myDataReadiness } from "../../../lib/mydata-runtime";

export const metadata: Metadata = { title: "Admin · Tax / myDATA", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminTaxWorkspace(principal); } catch { redirect("/admin"); }
  const diagnostics = await myDataReadiness();
  const ready = data.documents.filter((document) => document.transmissionStatus === "ready").length;
  const failed = data.documents.filter((document) => Boolean(document.lastError)).length;
  const configured = diagnostics.configured;
  const diagnosticEnvironment = "environment" in diagnostics && typeof diagnostics.environment === "string" ? diagnostics.environment : data.environment;
  const diagnosticSpecVersion = "specVersion" in diagnostics && typeof diagnostics.specVersion === "string" ? diagnostics.specVersion : data.specVersion;
  const credentialSource = "credentialSource" in diagnostics && typeof diagnostics.credentialSource === "string" ? diagnostics.credentialSource : undefined;
  const probe = "probe" in diagnostics && diagnostics.probe && typeof diagnostics.probe === "object" ? diagnostics.probe : undefined;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">AADE ERP bridge</div><h1>Tax / myDATA</h1><p className="lead">Η σύνδεση με AADE μπορεί να ελεγχθεί με read-only αίτημα ανεξάρτητα από την έκδοση. Η πραγματική διαβίβαση παραμένει κλειδωμένη μέχρι να εγκριθεί το accounting mapping.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Environment", value: diagnosticEnvironment },
      { label: "Credentials", value: configured ? "configured" : "missing", tone: configured ? "positive" : "attention", hint: credentialSource === "supabase_vault" ? "encrypted Vault" : undefined },
      { label: "Issuance", value: data.issuanceEnabled ? "enabled" : "gated", tone: data.issuanceEnabled ? "positive" : "default" },
      { label: "Ready documents", value: ready, tone: ready && data.issuanceEnabled ? "attention" : "default" },
      { label: "Transmission errors", value: failed, tone: failed ? "attention" : "positive", hint: data.approvedMappingVersion ? `mapping ${data.approvedMappingVersion}` : "mapping not approved" }
    ]} />

    <section className="shell vendor-section">
      <div className="workspace-inline-note">AADE spec: {diagnosticSpecVersion || "not configured"} · Approved mapping: {data.approvedMappingVersion ?? "not approved"}. Configuration alone is not treated as transmitted tax evidence.</div>
      {probe && "state" in probe && <div className="workspace-inline-note">Production connectivity probe: <strong>{String(probe.state)}</strong>{"checkedAt" in probe && typeof probe.checkedAt === "number" ? ` · ${new Date(probe.checkedAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}` : ""}. Η δοκιμή είναι read-only και δεν αποτελεί φορολογική διαβίβαση.</div>}
      <div className="workspace-action-bar"><span>Read-only connectivity check: verifies endpoint and AADE API credentials without transmitting an invoice.</span><div className="workspace-action-buttons"><MyDataConnectivityButton csrfToken={principal.csrfToken} /></div></div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Tax documents" title="Transmission queue" note="MARK, UID, mapping και minor-unit internals μεταφέρονται σε expandable detail ώστε το transmission state να μένει πρώτο." />
      {data.documents.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν prepared tax documents." body="Αυτό είναι αναμενόμενο μέχρι το approved accounting mapping να δημιουργήσει document snapshots." /> : <div className="workspace-queue-list">{data.documents.map((document) => <article className="workspace-queue-card" key={document.id}>
        <div className="workspace-queue-head"><div><strong>{document.documentNumber ?? document.id}</strong><small>{document.type} · {document.orderId ?? "no order"}</small></div><span className="status-pill">{document.transmissionStatus}</span></div>
        <div className="workspace-queue-primary"><span>{document.grossMinor} {document.currency} minor units</span>{document.aadeMark && <span>MARK recorded</span>}{document.aadeUid && <span>UID recorded</span>}</div>
        {document.lastError && <p className="workspace-queue-summary">{document.lastError}</p>}
        <WorkspaceRecordDetails label="AADE & mapping references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Document ID</strong><span>{document.id}</span></div><div className="workspace-compact-row"><strong>Mapping / invoice type</strong><span>{document.mappingVersion ?? "—"} · {document.invoiceTypeCode ?? "—"}</span></div><div className="workspace-compact-row"><strong>MARK / UID</strong><span>{document.aadeMark ?? "—"} · {document.aadeUid ?? "—"}</span></div></div></WorkspaceRecordDetails>
        {document.transmissionStatus === "ready" && data.issuanceEnabled && <div className="workspace-action-bar"><span>Prepared and eligible for AADE transmission.</span><div className="workspace-action-buttons"><AdminActionButton label="Transmit to AADE" endpoint="/api/admin/tax/transmit" csrfToken={principal.csrfToken} body={{ documentId: document.id }} /></div></div>}
      </article>)}</div>}
    </div></section>
  </main>;
}
