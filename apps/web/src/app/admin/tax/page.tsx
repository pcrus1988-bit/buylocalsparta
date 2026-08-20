import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { MyDataConnectivityButton } from "../../../components/MyDataConnectivityButton";
import { MyDataReportingReconciliation } from "../../../components/MyDataReportingReconciliation";
import { TaxConfigurationEditor } from "../../../components/TaxConfigurationEditor";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminAccountingPolicyWorkspace } from "../../../lib/admin-tax-policy-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { configuredMyDataService, myDataAdminRuntimeConfig, myDataReadiness } from "../../../lib/mydata-runtime";

export const metadata: Metadata = { title: "Admin · Accounting, Tax, AADE / myDATA", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const [diagnostics, policyData, runtimeConfig, myDataService] = await Promise.all([
    myDataReadiness(),
    adminAccountingPolicyWorkspace(principal).catch(() => undefined),
    myDataAdminRuntimeConfig(),
    configuredMyDataService().catch(() => undefined)
  ]);
  if (!policyData) redirect("/admin");
  const data = myDataService ? await myDataService.workspace(principal) : { environment: runtimeConfig.environment, specVersion: runtimeConfig.specVersion, issuanceEnabled: runtimeConfig.issuanceEnabled, approvedMappingVersion: undefined, deploymentMappingPin: runtimeConfig.mappingVersionPin, documents: [] as const };
  const policy = policyData.policy;
  const coverage = policyData.taxProfileCoverage;
  const configured = diagnostics.configured;
  const diagnosticEnvironment = "environment" in diagnostics && typeof diagnostics.environment === "string" ? diagnostics.environment : runtimeConfig.environment;
  const diagnosticSpecVersion = "specVersion" in diagnostics && typeof diagnostics.specVersion === "string" ? diagnostics.specVersion : runtimeConfig.specVersion;
  const credentialSource = "credentialSource" in diagnostics && typeof diagnostics.credentialSource === "string" ? diagnostics.credentialSource : undefined;
  const probe = "probe" in diagnostics && diagnostics.probe && typeof diagnostics.probe === "object" ? diagnostics.probe : undefined;
  const readyDocuments = data.documents.filter(document => document.transmissionStatus === "ready").length;
  const acceptedDocuments = data.documents.filter(document => document.transmissionStatus === "accepted").length;
  const failedDocuments = data.documents.filter(document => Boolean(document.lastError)).length;
  const editablePolicy = Boolean(policy && ["draft", "review"].includes(policy.status));

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section id="tax-overview" className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Finance & Tax · AADE ERP bridge</div><h1>Tax & myDATA</h1><p className="lead">Λογιστική πολιτική, mappings, ΦΠΑ, AADE credentials, reconciliation και runtime fiscalisation σε ένα workspace με σαφείς τοπικές ενότητες.</p></div></section>
    <section className="shell admin-local-tabs-shell"><nav className="admin-local-tabs" aria-label="Tax workspace sections"><a href="#tax-overview">Overview</a><a href="#tax-connection">AADE Connection</a><a href="#tax-reconciliation">Reconciliation</a><a href="#tax-configuration">Configuration</a><a href="#tax-policy">Accounting Policy</a><a href="#tax-vat">VAT</a></nav></section>
    <WorkspaceMetricStrip items={[
      { label: "AADE environment", value: diagnosticEnvironment },
      { label: "Credentials", value: configured ? "configured" : "missing", tone: configured ? "positive" : "attention", hint: credentialSource === "supabase_vault" ? "encrypted Vault" : credentialSource },
      { label: "Policy", value: policy ? `v${policy.version} · ${policy.status}` : "missing", tone: policy?.status === "approved" ? "positive" : "attention" },
      { label: "Fiscal route", value: policy?.fiscalisationRoute ?? "unselected", tone: policy?.fiscalisationRoute && policy.fiscalisationRoute !== "unselected" ? "positive" : "attention" },
      { label: "VAT coverage", value: `${coverage.coveredVariants}/${coverage.activeVariants}`, tone: coverage.missingVariants ? "attention" : "positive", hint: coverage.missingVariants ? `${coverage.missingVariants} missing` : "approved active products" },
      { label: "Issuance switch", value: runtimeConfig.issuanceEnabled ? "ON" : "OFF", tone: runtimeConfig.issuanceEnabled ? "attention" : "default" },
      { label: "Ready / accepted", value: `${readyDocuments} / ${acceptedDocuments}` },
      { label: "Transmission errors", value: failedDocuments, tone: failedDocuments ? "attention" : "positive" }
    ]} />

    <section id="tax-connection" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="AADE Connection" title="AADE / myDATA diagnostics" note="Credentials και operational settings διαχειρίζονται από εδώ. Read-only connectivity probe δεν αποτελεί φορολογική διαβίβαση." />
      <div className="workspace-inline-note">Runtime spec: <strong>{diagnosticSpecVersion}</strong> · Admin configuration source: database · AADE secret source: <strong>{credentialSource ?? "not configured"}</strong>.</div>
      {probe && "state" in probe && <div className="workspace-inline-note">Production connectivity probe: <strong>{String(probe.state)}</strong>{"checkedAt" in probe && typeof probe.checkedAt === "number" ? ` · ${new Date(probe.checkedAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}` : ""}.</div>}
      <div className="workspace-action-bar"><span>{diagnostics.message}</span><div className="workspace-action-buttons"><MyDataConnectivityButton csrfToken={principal.csrfToken} /></div></div>
      <div className="workspace-action-bar"><span>Invoice / receipt records are grouped under the vendor that fulfilled the order.</span><div className="workspace-action-buttons"><Link className="button button-secondary" href="/admin/vendors">Open vendor invoices</Link></div></div>
    </section>

    <section id="tax-reconciliation" className="vendor-section section-tint admin-anchor-section"><div className="shell"><WorkspaceSectionHeading eyebrow="Reconciliation" title="Compare local fiscal MARKs with AADE VAT / E3 reporting" note="Checks the selected fiscal period without changing, resending or correcting any document. An incomplete AADE result can never be shown as clean." /><MyDataReportingReconciliation /></div></section>

    <section id="tax-configuration" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Configuration" title="Fiscal mappings & runtime configuration" note="Approved Accounting Policies remain immutable. Any policy change after approval is made through a new auditable revision; secrets are never returned to the browser." />
      <TaxConfigurationEditor csrfToken={principal.csrfToken} policy={policy} documentMappings={policyData.documentMappings} paymentMappings={policyData.paymentMappings} series={policyData.series} vatCategories={policyData.vatCategories} runtimeConfig={runtimeConfig} credentialsConfigured={configured} credentialSource={credentialSource} />
    </section>

    {policy ? <>
      <section id="tax-policy" className="shell vendor-section admin-anchor-section">
        <WorkspaceSectionHeading eyebrow="Accounting Policy" title="Accounting / tax sign-off" note="Runtime configuration can be edited by authorised Admin, but production policy approval still requires every required accounting decision and evidence." />
        <div className="workspace-queue-list"><article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>{policy.sellerLegalName}</strong><small>ΑΦΜ {policy.sellerTaxNumber} · Mapping v{policy.version} · target {policy.compatibilityTarget}</small></div><span className="status-pill">{policy.status}</span></div><div className="workspace-queue-primary"><span>Route: {policy.fiscalisationRoute}</span><span>Seller of record: {policy.sellerOfRecord ? "YES" : "NO"}</span>{policy.policyHash && <span>Hash {policy.policyHash.slice(0,12)}…</span>}</div>{policyData.productionReady ? <p className="workspace-inline-note">Η συγκεκριμένη policy revision είναι production-ready.</p> : <WorkspaceRecordDetails label={`Policy blockers (${policyData.blockers.length})`}><div className="workspace-compact-list">{policyData.blockers.map(blocker => <div className="workspace-compact-row" key={blocker}><strong>Blocked</strong><span>{blocker}</span></div>)}</div></WorkspaceRecordDetails>}{editablePolicy && <div className="workspace-action-bar"><span>Final approval locks this revision. Further changes require a new version.</span><div className="workspace-action-buttons"><AdminActionButton label="Final accountant approval" endpoint="/api/admin/tax/policy" csrfToken={principal.csrfToken} body={{action:"approve_policy",policyId:policy.id}} reasonPrompt="Τελική αιτιολογία / scope έγκρισης" extraPrompt={{field:"accountantName",message:"Ονοματεπώνυμο λογιστή που εγκρίνει την πολιτική"}} /></div></div>}</article></div>
        <div className="workspace-queue-list">{policyData.checks.map(check => <article className="workspace-queue-card" key={check.code}><div className="workspace-queue-head"><div><strong>{check.label}</strong><small>{check.code} · {check.required ? "required" : "optional"}</small></div><span className="status-pill">{check.status}</span></div>{check.evidence && <p className="workspace-queue-summary">{check.evidence}</p>}{editablePolicy && check.code !== "fiscalisation_channel" && <div className="workspace-action-buttons"><AdminActionButton label="Approve" endpoint="/api/admin/tax/policy" csrfToken={principal.csrfToken} body={{action:"decide_check",policyId:policy.id,checkCode:check.code,status:"approved"}} extraPrompt={{field:"evidence",message:"Evidence / λογιστική αιτιολόγηση"}} /><AdminActionButton label="N/A" endpoint="/api/admin/tax/policy" csrfToken={principal.csrfToken} body={{action:"decide_check",policyId:policy.id,checkCode:check.code,status:"not_applicable"}} extraPrompt={{field:"evidence",message:"Αιτιολόγηση not applicable"}} /><AdminActionButton label="Reject" endpoint="/api/admin/tax/policy" csrfToken={principal.csrfToken} body={{action:"decide_check",policyId:policy.id,checkCode:check.code,status:"rejected"}} extraPrompt={{field:"evidence",message:"Αιτιολογία απόρριψης"}} danger /></div>}</article>)}</div>
      </section>
      <section id="tax-vat" className="vendor-section section-tint admin-anchor-section"><div className="shell"><WorkspaceSectionHeading eyebrow="VAT" title="VAT profiles per sellable product" note="Product VAT mapping is separate from the catalogue's commerce tax hint and must be explicitly proposed/approved." /><WorkspaceMetricStrip items={[{label:"Active variants",value:coverage.activeVariants},{label:"Approved coverage",value:coverage.coveredVariants,tone:coverage.missingVariants?"attention":"positive"},{label:"Missing",value:coverage.missingVariants,tone:coverage.missingVariants?"attention":"positive"},{label:"Unapproved profiles",value:coverage.unapprovedProfiles,tone:coverage.unapprovedProfiles?"attention":"default"}]} /><div className="workspace-action-bar"><span>Assign and approve the exact AADE VAT category for every active canonical variant.</span><div className="workspace-action-buttons"><Link className="button button-secondary" href="/admin/finance/mydata/products">Manage product VAT profiles</Link></div></div></div></section>
    </> : <section id="tax-policy" className="shell vendor-section admin-anchor-section"><WorkspaceEmptyState title="No accounting policy exists." body="Install/create an Accounting Policy before enabling fiscal issuance." /></section>}
  </main>;
}
