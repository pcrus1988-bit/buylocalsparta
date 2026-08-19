import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { MyDataConnectivityButton } from "../../../components/MyDataConnectivityButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminTaxWorkspace } from "../../../lib/admin-runtime";
import { adminAccountingPolicyWorkspace } from "../../../lib/admin-tax-policy-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { myDataReadiness } from "../../../lib/mydata-runtime";

export const metadata: Metadata = { title: "Admin · Accounting Mapping / myDATA", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminTaxWorkspace(principal); } catch { redirect("/admin"); }
  const [diagnostics, policyData] = await Promise.all([myDataReadiness(), adminAccountingPolicyWorkspace(principal).catch(() => undefined)]);
  const ready = data.documents.filter((document) => document.transmissionStatus === "ready").length;
  const failed = data.documents.filter((document) => Boolean(document.lastError)).length;
  const configured = diagnostics.configured;
  const diagnosticEnvironment = "environment" in diagnostics && typeof diagnostics.environment === "string" ? diagnostics.environment : data.environment;
  const diagnosticSpecVersion = "specVersion" in diagnostics && typeof diagnostics.specVersion === "string" ? diagnostics.specVersion : data.specVersion;
  const credentialSource = "credentialSource" in diagnostics && typeof diagnostics.credentialSource === "string" ? diagnostics.credentialSource : undefined;
  const probe = "probe" in diagnostics && diagnostics.probe && typeof diagnostics.probe === "object" ? diagnostics.probe : undefined;
  const policy = policyData?.policy;
  const coverage = policyData?.taxProfileCoverage;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Accounting Policy · AADE ERP bridge</div><h1>Tax / myDATA</h1><p className="lead">Το Accounting Mapping είναι versioned φορολογική πολιτική. Η σύνδεση AADE, η λογιστική έγκριση και η τεχνική δυνατότητα fiscalisation είναι ανεξάρτητα gates.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Environment", value: diagnosticEnvironment },
      { label: "Credentials", value: configured ? "configured" : "missing", tone: configured ? "positive" : "attention", hint: credentialSource === "supabase_vault" ? "encrypted Vault" : undefined },
      { label: "Policy", value: policy ? `v${policy.version} · ${policy.status}` : "not installed", tone: policy?.status === "approved" ? "positive" : "attention" },
      { label: "Fiscal route", value: policy?.fiscalisationRoute ?? "unselected", tone: policy?.fiscalisationRoute && policy.fiscalisationRoute !== "unselected" ? "positive" : "attention" },
      { label: "VAT coverage", value: coverage ? `${coverage.coveredVariants}/${coverage.activeVariants}` : "—", tone: coverage?.missingVariants ? "attention" : "positive", hint: coverage?.missingVariants ? `${coverage.missingVariants} missing` : "approved active products" },
      { label: "Ready documents", value: ready, tone: ready && data.issuanceEnabled ? "attention" : "default" },
      { label: "Transmission errors", value: failed, tone: failed ? "attention" : "positive" }
    ]} />

    <section className="shell vendor-section">
      <div className="workspace-inline-note">AADE runtime spec: {diagnosticSpecVersion || "not configured"} · Policy compatibility target: {policy?.compatibilityTarget ?? "—"} · Published production schema recorded in policy: {policy?.productionPublishedSchema ?? "—"}.</div>
      {probe && "state" in probe && <div className="workspace-inline-note">Production connectivity probe: <strong>{String(probe.state)}</strong>{"checkedAt" in probe && typeof probe.checkedAt === "number" ? ` · ${new Date(probe.checkedAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}` : ""}. Η δοκιμή είναι read-only και δεν αποτελεί φορολογική διαβίβαση.</div>}
      <div className="workspace-action-bar"><span>Read-only connectivity check: endpoint + credentials only. Δεν εγκρίνει mapping, ΦΠΑ ή POS fiscalisation.</span><div className="workspace-action-buttons"><MyDataConnectivityButton csrfToken={principal.csrfToken} /></div></div>
    </section>

    {policyData && policy ? <>
      <section className="vendor-section section-tint"><div className="shell">
        <WorkspaceSectionHeading eyebrow="Accounting Mapping v1.0" title="Production policy gate" note="Seller-of-record, fiscalisation route, accountant decisions και τεχνικά capabilities αξιολογούνται χωριστά." />
        <div className="workspace-queue-list">
          <article className="workspace-queue-card">
            <div className="workspace-queue-head"><div><strong>{policy.sellerLegalName}</strong><small>ΑΦΜ {policy.sellerTaxNumber} · seller of record: {policy.sellerOfRecord ? "YES" : "NO"}</small></div><span className="status-pill">{policy.status}</span></div>
            <div className="workspace-queue-primary"><span>Target {policy.compatibilityTarget}</span><span>Route: {policy.fiscalisationRoute}</span>{policy.policyHash && <span>Hash {policy.policyHash.slice(0,12)}…</span>}</div>
            {policyData.productionReady ? <p className="workspace-inline-note">Η πολιτική είναι λογιστικά και τεχνικά production-ready.</p> : <WorkspaceRecordDetails label={`Production blockers (${policyData.blockers.length})`}><div className="workspace-compact-list">{policyData.blockers.map((blocker) => <div className="workspace-compact-row" key={blocker}><strong>Blocked</strong><span>{blocker}</span></div>)}</div></WorkspaceRecordDetails>}
            {policy.status !== "approved" && <div className="workspace-action-bar"><span>Επιλέξτε ακριβώς ένα fiscalisation channel. Η επιλογή route δεν ενεργοποιεί από μόνη της έκδοση.</span><div className="workspace-action-buttons">
              <AdminActionButton label="Viva Fiscal provider" endpoint="/api/admin/tax/policy" csrfToken={principal.csrfToken} body={{action:"set_route",policyId:policy.id,route:"viva_fiscal_provider"}} reasonPrompt="Αιτιολογία επιλογής Viva Fiscal/provider" />
              <AdminActionButton label="AADE Direct ERP" endpoint="/api/admin/tax/policy" csrfToken={principal.csrfToken} body={{action:"set_route",policyId:policy.id,route:"aade_direct_erp"}} reasonPrompt="Αιτιολογία επιλογής direct ERP / ECRToken" />
            </div></div>}
            <WorkspaceRecordDetails label="Technical route capabilities"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Direct ERP ECRToken</strong><span>{policyData.technicalCapabilities.directErpEcrToken ? "enabled" : "NOT enabled"}</span></div><div className="workspace-compact-row"><strong>Viva Fiscal provider</strong><span>{policyData.technicalCapabilities.vivaFiscalProvider ? "enabled" : "NOT enabled"}</span></div></div></WorkspaceRecordDetails>
            {policy.status !== "approved" && <div className="workspace-action-bar"><span>Final approval is refused while any required blocker remains.</span><div className="workspace-action-buttons"><AdminActionButton label="Final accountant approval" endpoint="/api/admin/tax/policy" csrfToken={principal.csrfToken} body={{action:"approve_policy",policyId:policy.id}} reasonPrompt="Τελική αιτιολογία / scope έγκρισης" extraPrompt={{field:"accountantName",message:"Ονοματεπώνυμο λογιστή που εγκρίνει την πολιτική"}} /></div></div>}
          </article>
        </div>
      </div></section>

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Approval checklist" title="Granular accountant sign-off" note="Κάθε required θέμα παραμένει ανεξάρτητο. Evidence αποθηκεύεται μαζί με την απόφαση." />
        <div className="workspace-queue-list">{policyData.checks.map((check) => <article className="workspace-queue-card" key={check.code}>
          <div className="workspace-queue-head"><div><strong>{check.label}</strong><small>{check.code} · {check.required ? "required" : "optional"}</small></div><span className="status-pill">{check.status}</span></div>
          {check.evidence && <p className="workspace-queue-summary">{check.evidence}</p>}
          {policy.status !== "approved" && check.code !== "fiscalisation_channel" && <div className="workspace-action-buttons">
            <AdminActionButton label="Approve" endpoint="/api/admin/tax/policy" csrfToken={principal.csrfToken} body={{action:"decide_check",policyId:policy.id,checkCode:check.code,status:"approved"}} extraPrompt={{field:"evidence",message:"Evidence / λογιστική αιτιολόγηση"}} />
            <AdminActionButton label="Reject" endpoint="/api/admin/tax/policy" csrfToken={principal.csrfToken} body={{action:"decide_check",policyId:policy.id,checkCode:check.code,status:"rejected"}} extraPrompt={{field:"evidence",message:"Αιτιολογία απόρριψης"}} danger />
          </div>}
        </article>)}</div>
      </section>

      <section className="vendor-section section-tint"><div className="shell">
        <WorkspaceSectionHeading eyebrow="Document mappings" title="Sales, services & credit documents" note="Domestic production mappings require explicit approval. EU/third-country remain future; 5.2 remains exception-only." />
        <div className="workspace-queue-list">{policyData.documentMappings.map((mapping) => <article className="workspace-queue-card" key={mapping.eventCode}>
          <div className="workspace-queue-head"><div><strong>{mapping.eventCode}</strong><small>{mapping.customerKind} · {mapping.itemKind} · {mapping.geography} · {mapping.direction}</small></div><span className="status-pill">{mapping.status}</span></div>
          <div className="workspace-queue-primary"><span>myDATA {mapping.invoiceType}</span><span>{mapping.incomeCategory ?? "negative original"}</span><span>{mapping.e3Code ?? "negative original E3"}</span><span>{mapping.seriesCode}</span></div>
          {mapping.notes && <p className="workspace-queue-summary">{mapping.notes}</p>}
          {policy.status !== "approved" && mapping.status === "proposed" && <div className="workspace-action-buttons"><AdminActionButton label="Approve mapping" endpoint="/api/admin/tax/policy" csrfToken={principal.csrfToken} body={{action:"document_mapping",policyId:policy.id,eventCode:mapping.eventCode,status:"approved"}} reasonPrompt="Λογιστική αιτιολόγηση έγκρισης mapping" /></div>}
        </article>)}</div>
      </div></section>

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Payment mappings" title="Processor ≠ myDATA payment type" note="Το VIVA παραμένει processor. Το myDATA payment type αποθηκεύεται ξεχωριστά." />
        <div className="workspace-queue-list">{policyData.paymentMappings.map((mapping) => <article className="workspace-queue-card" key={`${mapping.processor}:${mapping.processorMethod}`}>
          <div className="workspace-queue-head"><div><strong>{mapping.processor} / {mapping.processorMethod}</strong><small>myDATA payment type {mapping.mydataPaymentType}</small></div><span className="status-pill">{mapping.status}</span></div>
          <div className="workspace-queue-primary">{mapping.requiresTransactionId && <span>transactionId required</span>}{mapping.erpRequiresEcrToken && <span>ERP: ECRToken</span>}{mapping.providerSignatureRoute && <span>Provider: signature route</span>}</div>
          {mapping.notes && <p className="workspace-queue-summary">{mapping.notes}</p>}
          {policy.status !== "approved" && mapping.status === "proposed" && <div className="workspace-action-buttons"><AdminActionButton label="Approve payment mapping" endpoint="/api/admin/tax/policy" csrfToken={principal.csrfToken} body={{action:"payment_mapping",policyId:policy.id,processor:mapping.processor,processorMethod:mapping.processorMethod,status:"approved"}} reasonPrompt="Λογιστική/τεχνική αιτιολόγηση έγκρισης payment mapping" /></div>}
        </article>)}</div>
      </section>

      <section className="vendor-section section-tint"><div className="shell">
        <WorkspaceSectionHeading eyebrow="VAT profiles" title="Product-level tax coverage" note="Το παλιό tax_rate_bps είναι μόνο hint. Δεν μετατρέπεται αυτόματα σε AADE vatCategory." />
        <WorkspaceMetricStrip items={[{label:"Active variants",value:coverage?.activeVariants ?? 0},{label:"Approved coverage",value:coverage?.coveredVariants ?? 0,tone:coverage?.missingVariants ? "attention":"positive"},{label:"Missing",value:coverage?.missingVariants ?? 0,tone:coverage?.missingVariants ? "attention":"positive"},{label:"Unapproved profiles",value:coverage?.unapprovedProfiles ?? 0,tone:coverage?.unapprovedProfiles ? "attention":"default"}]} />
        <WorkspaceRecordDetails label="AADE VAT category catalogue"><div className="workspace-compact-list">{policyData.vatCategories.map((vat)=><div className="workspace-compact-row" key={vat.code}><strong>{vat.code}</strong><span>{vat.label}</span><small>{(vat.rateBps/100).toLocaleString("el-GR")}%{vat.specialCategory?" · special":""}</small></div>)}</div></WorkspaceRecordDetails>
        <div className="workspace-inline-note">Για vatCategory 7 απαιτείται exemption category. Η κάλυψη προϊόντων πρέπει να ολοκληρωθεί πριν από final approval.</div>
      </div></section>

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Fiscal series" title="Independent AA sequences" note="Το order id δεν χρησιμοποιείται ως fiscal AA. Κάθε σειρά διατηρεί ανεξάρτητο atomic counter." />
        <div className="workspace-queue-list">{policyData.series.map((s)=><article className="workspace-queue-card" key={s.series}><div className="workspace-queue-head"><div><strong>{s.series}</strong><small>{s.purpose} · type {s.invoiceType}</small></div><span className="status-pill">{s.locked?"locked":"open"}</span></div><div className="workspace-queue-primary"><span>Next AA {s.nextAa}</span><span>Last {s.lastIssuedAa ?? "—"}</span><span>MARK {s.lastMark ?? "—"}</span></div></article>)}</div>
      </section>
    </> : <section className="shell vendor-section"><WorkspaceEmptyState title="Accounting Mapping v1.0 schema is not installed yet." body="The application branch contains the versioned policy migration; production remains untouched until the migration is reviewed and deployed." /></section>}

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Tax documents" title="Transmission queue" note="MARK, UID, mapping και minor-unit internals παραμένουν δεμένα με ένα tax-document lifecycle." />
      {data.documents.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν prepared tax documents." body="Successful captured orders can create a pending fiscal snapshot, but transmission remains blocked until the policy and route are production-ready." /> : <div className="workspace-queue-list">{data.documents.map((document) => <article className="workspace-queue-card" key={document.id}>
        <div className="workspace-queue-head"><div><strong>{document.documentNumber ?? document.id}</strong><small>{document.type} · {document.orderId ?? "no order"}</small></div><span className="status-pill">{document.transmissionStatus}</span></div>
        <div className="workspace-queue-primary"><span>{document.grossMinor} {document.currency} minor units</span>{document.aadeMark && <span>MARK recorded</span>}{document.aadeUid && <span>UID recorded</span>}</div>
        {document.lastError && <p className="workspace-queue-summary">{document.lastError}</p>}
        <WorkspaceRecordDetails label="AADE & mapping references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Document ID</strong><span>{document.id}</span></div><div className="workspace-compact-row"><strong>Mapping / invoice type</strong><span>{document.mappingVersion ?? "—"} · {document.invoiceTypeCode ?? "—"}</span></div><div className="workspace-compact-row"><strong>MARK / UID</strong><span>{document.aadeMark ?? "—"} · {document.aadeUid ?? "—"}</span></div></div></WorkspaceRecordDetails>
        {document.transmissionStatus === "ready" && data.issuanceEnabled && policyData?.productionReady && policy?.fiscalisationRoute === "aade_direct_erp" && <div className="workspace-action-bar"><span>Prepared and eligible for direct AADE ERP transmission.</span><div className="workspace-action-buttons"><AdminActionButton label="Transmit to AADE" endpoint="/api/admin/tax/transmit" csrfToken={principal.csrfToken} body={{ documentId: document.id }} /></div></div>}
      </article>)}</div>}
    </div></section>
  </main>;
}
