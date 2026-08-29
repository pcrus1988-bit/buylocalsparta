import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { AdminAiProductImportForm } from "../../../../components/AdminAiProductImportForm";
import { AdminCatalogueImportForm } from "../../../../components/AdminCatalogueImportForm";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCatalogueImportWorkspace } from "../../../../lib/admin-catalogue-import";
import { adminOpenIcecatIngestionStatus } from "../../../../lib/admin-open-icecat-ingestion";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · AI Product Import", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const [data, icecat] = await Promise.all([
    adminCatalogueImportWorkspace(principal),
    adminOpenIcecatIngestionStatus(principal)
  ]);
  const current = data.payloads.find((item) => item.sourceCode === data.contract.sourceCode && item.expectedSourceSha256 === data.contract.expectedSourceSha256 && item.importerVersion === data.contract.importerVersion);
  const latestIcecat = icecat.runs[0];

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
      { label: "Trusted payload", value: current?.status ?? "not staged", tone: current?.status === "staging" ? "attention" : "default" },
      { label: "Open Icecat", value: latestIcecat?.status ?? "not started", tone: latestIcecat?.status === "failed" ? "attention" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Open Icecat · resumable bulk index" title="Ingestion status" note="The cursor counts terminal source rows, including rejected and filtered rows. Each checkpoint is committed atomically with index staging, so a failed batch resumes from the last durable source row instead of replaying the entire accepted-entry history." />
      <div className="workspace-inline-note">Index ingestion is operational staging only. A successful run does not publish a product: full product evidence must still enter the existing source-product workflow and pass the Greek-quality gate before any governed canonical publication can be considered.</div>
      {icecat.runs.length === 0 ? <WorkspaceEmptyState title="No Open Icecat bulk run has been recorded yet." body="The first full or daily index run will appear here after migration 0160 is applied and the ingestion worker starts." /> : <div className="workspace-queue-list">{icecat.runs.map((run) => <article className="workspace-queue-card" key={run.runId}>
        <div className="workspace-queue-head"><div><strong>{run.sourceName} · {run.importKind.toUpperCase()}</strong><small>{run.sourceCode} · started {when(run.startedAt)}</small></div><span className="status-pill">{run.status}</span></div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Durable checkpoint</strong><span>{formatCount(run.checkpoint)} source rows</span></div>
          <div className="workspace-compact-row"><strong>Index writes</strong><span>{formatCount(run.persisted)} staged · {formatCount(run.removed)} removed</span></div>
          <div className="workspace-compact-row"><strong>Not staged</strong><span>{formatCount(run.rejected)} rejected · {formatCount(run.filtered)} filtered</span></div>
          <div className="workspace-compact-row"><strong>Current index</strong><span>{formatCount(run.activeIndexProducts)} active · {formatCount(run.removedIndexProducts)} removed</span></div>
          <div className="workspace-compact-row"><strong>Fingerprint</strong><span title={run.sourceFingerprint}>{compactFingerprint(run.sourceFingerprint)}</span></div>
          <div className="workspace-compact-row"><strong>Last update</strong><span>{when(run.updatedAt)}</span></div>
          {run.completedAt && <div className="workspace-compact-row"><strong>Completed</strong><span>{when(run.completedAt)}</span></div>}
          {run.failedAt && <div className="workspace-compact-row"><strong>Failed</strong><span>{when(run.failedAt)}</span></div>}
          {run.lastError && <div className="workspace-compact-row"><strong>Last error</strong><span>{run.lastError}</span></div>}
        </div>
      </article>)}</div>}
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

function formatCount(value: number): string { return new Intl.NumberFormat("el-GR").format(value); }
function compactFingerprint(value: string): string { return value.length > 32 ? `${value.slice(0, 29)}…` : value; }
function when(value: number): string { return new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value)); }
