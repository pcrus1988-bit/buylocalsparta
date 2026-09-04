import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { AdminAiProductImportForm } from "../../../../components/AdminAiProductImportForm";
import { AdminCatalogueImportForm } from "../../../../components/AdminCatalogueImportForm";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCatalogueImportWorkspace } from "../../../../lib/admin-catalogue-import";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · AI Product Import", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminCatalogueImportWorkspace(principal);
  const current = data.payloads.find((item) => item.sourceCode === data.contract.sourceCode && item.expectedSourceSha256 === data.contract.expectedSourceSha256 && item.importerVersion === data.contract.importerVersion);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} entityLabel="AI Product Import" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Catalog · product intelligence</div><h1>AI Product Import</h1><p className="lead">Upload supplier CSV/TSV data in different schemas. Product Intelligence detects the file structure, proposes canonical field mappings, scores product identity and separates safe matching candidates from rows that need review or quarantine.</p></div>
      <aside className="dashboard-health-card"><span>Current capability</span><strong>Analyze first · write later</strong><p>Generic files are not allowed to create products until their mapping and identity evidence pass the governed promotion lifecycle.</p></aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Generic formats", value: "CSV · TSV · GZIP" },
      { label: "Inference engine", value: "v1" },
      { label: "Automatic writes", value: "disabled", tone: "attention" },
      { label: "Trusted adapter", value: "Nikolaou v2" },
      { label: "Trusted payload", value: current?.status ?? "not staged", tone: current?.status === "staging" ? "attention" : "default" }
    ]} />

    <section className="shell">
      <div className="workspace-action-bar"><span>Open Icecat ingestion, enrichment health and live worker settings now live in their dedicated workspace.</span><Link className="button button-secondary" href="/admin/icecat">Open Icecat Control Center</Link></div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Step 1 · understand any supplier file" title="Schema & identity analysis" note="The inference layer is deliberately source-agnostic. It detects delimiters, profiles values, understands common Greek/English commerce headers, validates GTINs and scores whether each row has enough identity evidence to enter canonical matching." />
      <AdminAiProductImportForm csrfToken={data.csrfToken} />
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Trusted source adapters" title="Nikolaou master · v2" note="Existing supplier-specific adapters remain available as high-trust contracts. Nikolaou is now treated as one governed adapter, not as the architecture of the importer itself." />
      <WorkspaceRecordDetails label="Immutable Nikolaou source contract">
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Raw filename</strong><span>{data.contract.sourceFilename}</span></div>
          <div className="workspace-compact-row"><strong>Importer</strong><span>{data.contract.importerVersion}</span></div>
          <div className="workspace-compact-row"><strong>Raw SHA-256</strong><span>{data.contract.expectedSourceSha256}</span></div>
          <div className="workspace-compact-row"><strong>Gzip SHA-256</strong><span>{data.contract.expectedCompressedSha256}</span></div>
          <div className="workspace-compact-row"><strong>Expected rows</strong><span>{data.contract.expectedRowCount}</span></div>
        </div>
      </WorkspaceRecordDetails>
      <AdminCatalogueImportForm csrfToken={data.csrfToken} expectedCompressedBytes={data.contract.expectedCompressedBytes} maxCompressedBytes={data.limits.maxCompressedBytes} />
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Governed evidence" title="Private import payloads" note="Trusted source bytes are never rendered in Admin. Checksum-sealed payloads remain immutable evidence and are promoted separately into the PIM." />
      {data.payloads.length === 0 ? <WorkspaceEmptyState title="No trusted source payload has been staged yet." /> : <div className="workspace-queue-list">{data.payloads.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.sourceCode}</strong><small>{item.sourceFilename} · {item.importerVersion}</small></div><span className="status-pill">{item.status}</span></div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Staged bytes</strong><span>{new Intl.NumberFormat("el-GR").format(item.stagedBytes)}</span></div>
          <div className="workspace-compact-row"><strong>Sealed size</strong><span>{item.compressedSize === undefined ? "—" : new Intl.NumberFormat("el-GR").format(item.compressedSize)}</span></div>
          <div className="workspace-compact-row"><strong>Rows</strong><span>{item.expectedRowCount}</span></div>
          <div className="workspace-compact-row"><strong>Raw hash</strong><span title={item.expectedSourceSha256}>{item.expectedSourceSha256.slice(0, 20)}…</span></div>
          <div className="workspace-compact-row"><strong>Updated</strong><span>{when(item.updatedAt)}</span></div>
          {item.importedSnapshotId && <div className="workspace-compact-row"><strong>Snapshot</strong><span>{item.importedSnapshotId}</span></div>}
          {item.failureReason && <div className="workspace-compact-row"><strong>Failure</strong><span>{item.failureReason}</span></div>}
        </div>
      </article>)}</div>}
      <div className="workspace-action-bar"><span>Imported evidence remains separate from canonical products and vendor assortment.</span><Link className="button button-secondary" href="/admin/catalogue-intake">Open Supplier PIM Intake</Link></div>
    </section>
  </main>;
}

function when(value: number): string { return new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value)); }
