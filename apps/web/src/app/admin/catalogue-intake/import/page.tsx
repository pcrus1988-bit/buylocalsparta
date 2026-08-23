import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { AdminCatalogueImportForm } from "../../../../components/AdminCatalogueImportForm";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCatalogueImportWorkspace } from "../../../../lib/admin-catalogue-import";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Supplier Source Import", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminCatalogueImportWorkspace(principal);
  const current = data.payloads.find((item) => item.sourceCode === data.contract.sourceCode && item.expectedSourceSha256 === data.contract.expectedSourceSha256 && item.importerVersion === data.contract.importerVersion);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} entityLabel="Supplier Source Import" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Catalog · controlled write boundary</div><h1>Supplier Source Import</h1><p className="lead">Governed upload point για το επαληθευμένο Nikolaou master. Το gzip ελέγχεται cryptographically, αποσυμπιέζεται με bounded output και σφραγίζεται ως private source payload πριν επιτραπεί οποιοδήποτε PIM import.</p></div>
      <aside className="dashboard-health-card"><span>Write boundary</span><strong>Stage + seal only</strong><p>No offers, stock, assortments, canonical products or public listings are created here.</p></aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Expected rows", value: data.contract.expectedRowCount },
      { label: "Expected gzip", value: `${new Intl.NumberFormat("el-GR").format(data.contract.expectedCompressedBytes)} B` },
      { label: "Current state", value: current?.status ?? "not staged", tone: current?.status === "staging" ? "attention" : "default" },
      { label: "Staged bytes", value: current?.stagedBytes ?? 0 },
      { label: "Max upload", value: `${Math.round(data.limits.maxCompressedBytes / 1024 / 1024)} MB` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Fixed import contract" title="Nikolaou master · v2" note="The contract is server-owned. Operators upload bytes only; source code, importer version, expected row count and SHA-256 values cannot be overridden from the browser." />
      <WorkspaceRecordDetails label="Expected source evidence" open>
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
      <WorkspaceSectionHeading eyebrow="Operational state" title="Private import payloads" note="Payload bytes are never rendered in Admin. Once a staged payload is checksum-sealed it becomes ready for the separate governed PIM promotion step." />
      {data.payloads.length === 0 ? <WorkspaceEmptyState title="No source payload has been staged yet." /> : <div className="workspace-queue-list">{data.payloads.map((item) => <article className="workspace-queue-card" key={item.id}>
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
      <div className="workspace-action-bar"><span>Review of imported source evidence remains read-only and separate from this write boundary.</span><Link className="button button-secondary" href="/admin/catalogue-intake">Open Supplier PIM Intake</Link></div>
    </section>
  </main>;
}

function when(value: number): string { return new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value)); }
