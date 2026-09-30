"use client";

import { FormEvent, useRef, useState } from "react";

type Mapping = Readonly<{
  sourceColumn: string;
  canonicalField: string;
  confidence: number;
  method: string;
  evidence: readonly string[];
}>;

type Analysis = Readonly<{
  engineVersion: string;
  sourceFilename: string;
  sourceSha256: string;
  delimiter: string;
  headers: readonly string[];
  rowCount: number;
  mappings: readonly Mapping[];
  unmappedColumns: readonly string[];
  ambiguousColumns: readonly string[];
  readiness: Readonly<{
    mappedCoverage: number;
    identityCoverage: number;
    readyRows: number;
    reviewRows: number;
    quarantineRows: number;
    criticalIssues: readonly string[];
  }>;
  transport: Readonly<{
    uploadedFilename: string;
    compressed: boolean;
    uploadedBytes: number;
    sourceBytes: number;
  }>;
}>;

type StageResult = Readonly<{
  status: string;
  runId: string;
  profileId: string;
  profileStatus: string;
  sourceCode: string;
  sourceSha256: string;
  rowCount: number;
  readyRows: number;
  reviewRows: number;
  quarantineRows: number;
  duplicateSourceKeys: number;
  mappedCoverage: number;
  identityCoverage: number;
}>;

type PromotionResult = Readonly<{
  status: string;
  runId: string;
  sourceId: string;
  snapshotId: string;
  importedRows: number;
  quarantinedRows: number;
  taxonomyNodes: number;
  approvedCategoryMappings: number;
  candidateCategoryMappings: number;
  unmappedTaxonomyLeaves: number;
  attributeObservations: number;
  priceObservations: number;
  compatibilityClaims: number;
}>;

export function AdminAiProductImportForm({ csrfToken }: { csrfToken: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [sourceCode, setSourceCode] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState<"analyze" | "ingest" | "">("");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<Analysis>();
  const [staged, setStaged] = useState<StageResult>();
  const [promoted, setPromoted] = useState<PromotionResult>();

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choose a CSV, TSV or gzip product file."); return; }
    setBusy("analyze"); setError(""); setAnalysis(undefined); setStaged(undefined); setPromoted(undefined);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/admin/catalogue-intake/analyze", {
        method: "POST", headers: { "x-csrf-token": csrfToken }, body, cache: "no-store"
      });
      const payload = await response.json() as Analysis & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Product import analysis failed.");
      setAnalysis(payload);
      if (!sourceCode) setSourceCode(suggestCode(file.name));
      if (!sourceName) setSourceName(file.name.replace(/\.(?:csv|tsv|txt|gz)$/gi, "").replaceAll(/[-_]+/g, " "));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(""); }
  }

  async function ingest() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("The analyzed file is no longer selected."); return; }
    if (!sourceCode.trim() || !sourceName.trim()) { setError("Source code and source name are required before the import is persisted."); return; }
    setBusy("ingest"); setError(""); setPromoted(undefined);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("sourceCode", sourceCode);
      body.set("sourceName", sourceName);
      const stageResponse = await fetch("/api/admin/catalogue-intake/stage", {
        method: "POST", headers: { "x-csrf-token": csrfToken }, body, cache: "no-store"
      });
      const stagePayload = await stageResponse.json() as StageResult & { error?: string };
      if (!stageResponse.ok) throw new Error(stagePayload.error || "Normalization staging failed.");
      setStaged(stagePayload);

      const promotionPayload = await jsonPost(
        "/api/admin/catalogue-intake/promote",
        { runId: stagePayload.runId },
        csrfToken
      ) as PromotionResult;
      setPromoted(promotionPayload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  return <div className="workspace-form-stack">
    <form className="workspace-form-stack" onSubmit={analyze}>
      <label className="workspace-field">
        <span>Supplier product file</span>
        <input ref={fileRef} type="file" name="file" accept=".csv,.tsv,.txt,.gz,text/csv,text/tab-separated-values,application/gzip,application/x-gzip" required disabled={Boolean(busy)} />
        <small>CSV, semicolon CSV, TSV and gzip are supported. Product Intelligence detects the schema before any database write.</small>
      </label>
      <div className="workspace-inline-note"><strong>Controlled lifecycle.</strong> Analyze → one governed PIM import → automatic intelligence → one vendor assignment → automatic canonicalization. No offer, live stock or public listing is created here.</div>
      <div className="workspace-action-bar">
        <span>Admin permission <code>catalog.write</code> and CSRF protection are required.</span>
        <button className="button button-primary" type="submit" disabled={Boolean(busy)}>{busy === "analyze" ? "Analyzing…" : "1 · Analyze file"}</button>
      </div>
    </form>

    {analysis && <section className="workspace-form-stack" aria-live="polite">
      <div className="workspace-inline-note"><strong>{analysis.engineVersion}</strong> · {analysis.rowCount.toLocaleString("en-US")} rows · delimiter {labelDelimiter(analysis.delimiter)} · SHA-256 {analysis.sourceSha256.slice(0, 16)}…</div>
      <div className="workspace-metric-strip">
        <div className="workspace-metric"><span>Mapped columns</span><strong>{pct(analysis.readiness.mappedCoverage)}</strong></div>
        <div className="workspace-metric"><span>Identity coverage</span><strong>{pct(analysis.readiness.identityCoverage)}</strong></div>
        <div className="workspace-metric"><span>Ready for matching</span><strong>{analysis.readiness.readyRows.toLocaleString("en-US")}</strong></div>
        <div className="workspace-metric"><span>Needs review</span><strong>{analysis.readiness.reviewRows.toLocaleString("en-US")}</strong></div>
        <div className="workspace-metric"><span>Quarantine</span><strong>{analysis.readiness.quarantineRows.toLocaleString("en-US")}</strong></div>
      </div>
      {analysis.readiness.criticalIssues.length > 0 && <div className="workspace-inline-note"><strong>Critical findings:</strong> {analysis.readiness.criticalIssues.join(" · ")}</div>}

      <details className="workspace-record-details" open>
        <summary>Detected field mapping · {analysis.mappings.length}</summary>
        <div className="workspace-compact-list">{analysis.mappings.map((mapping) => <div className="workspace-compact-row" key={`${mapping.sourceColumn}-${mapping.canonicalField}`}>
          <strong>{mapping.sourceColumn} → {mapping.canonicalField}</strong>
          <span>{Math.round(mapping.confidence * 100)}% · {mapping.method.replaceAll("_", " ")}{mapping.evidence[0] ? ` · ${mapping.evidence[0]}` : ""}</span>
        </div>)}</div>
      </details>

      <details className="workspace-record-details">
        <summary>Columns requiring operator attention</summary>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Ambiguous</strong><span>{analysis.ambiguousColumns.join(" · ") || "None"}</span></div>
          <div className="workspace-compact-row"><strong>Unmapped</strong><span>{analysis.unmappedColumns.join(" · ") || "None"}</span></div>
        </div>
      </details>

      <div className="admin-directory-filters">
        <label><span>Source code</span><input value={sourceCode} onChange={(event) => setSourceCode(event.target.value)} placeholder="supplier-name" disabled={Boolean(busy)} /></label>
        <label><span>Source name</span><input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="Supplier / catalogue name" disabled={Boolean(busy)} /></label>
        <div><button className="button button-primary" type="button" onClick={ingest} disabled={Boolean(busy)}>{busy === "ingest" ? "Importing…" : "2 · Import safe rows to PIM"}</button></div>
      </div>
      <div className="workspace-inline-note">One confirmation now persists normalization and promotes all admissible rows to immutable Supplier PIM evidence. The source/profile identity is immutable for this file hash, so re-uploading the same source reuses the existing run instead of duplicating data.</div>
    </section>}

    {staged && !promoted && <section className="workspace-form-stack" aria-live="polite">
      <div className="workspace-inline-note"><strong>{staged.status.replaceAll("_", " ")}</strong> · run {staged.runId} · profile {staged.profileStatus}</div>
      <div className="workspace-inline-note">Normalization is persisted. PIM promotion is continuing in the same governed import action.</div>
    </section>}

    {promoted && <section className="workspace-form-stack" aria-live="polite">
      <div className="workspace-inline-note"><strong>{promoted.status.replaceAll("_", " ")}</strong> · snapshot {promoted.snapshotId} · {promoted.importedRows.toLocaleString("en-US")} source products · {promoted.quarantinedRows.toLocaleString("en-US")} excluded</div>
      <div className="workspace-metric-strip">
        <div className="workspace-metric"><span>Taxonomy nodes</span><strong>{promoted.taxonomyNodes}</strong></div>
        <div className="workspace-metric"><span>Approved category maps</span><strong>{promoted.approvedCategoryMappings}</strong></div>
        <div className="workspace-metric"><span>Candidate maps</span><strong>{promoted.candidateCategoryMappings}</strong></div>
        <div className="workspace-metric"><span>Unmapped leaves</span><strong>{promoted.unmappedTaxonomyLeaves}</strong></div>
        <div className="workspace-metric"><span>Attributes</span><strong>{promoted.attributeObservations}</strong></div>
      </div>
      <div className="workspace-action-bar">
        <span><strong>Next:</strong> deterministic intelligence is automatic. Assign this snapshot to a vendor once in Supplier PIM Intake; canonical identity resolution then runs automatically in the scheduled intake worker.</span>
        <a className="button button-primary" href={`/admin/catalogue-intake?snapshot=${encodeURIComponent(promoted.snapshotId)}`}>Open snapshot & assign vendor</a>
        <a className="button button-secondary" href="/admin/catalogue-intake/intelligence">Review exceptions</a>
      </div>
      <div className="workspace-inline-note"><strong>Commerce remains off.</strong> Automated intake can normalize, classify and canonicalize evidence, but it does not confirm stock, create a sellable vendor offer or publish a product.</div>
    </section>}

    {error && <div className="workspace-inline-note" role="alert"><strong>AI Product Import:</strong> {error}</div>}
  </div>;
}

async function jsonPost(path: string, body: Record<string, unknown>, csrfToken: string): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error || "AI Product Import action failed.");
  return payload;
}
function suggestCode(filename: string): string { return filename.replace(/\.(?:csv|tsv|txt|gz)$/gi, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "supplier-import"; }
function pct(value: number): string { return `${Math.round(value * 100)}%`; }
function labelDelimiter(value: string): string { return value === "\t" ? "TAB" : value === ";" ? "semicolon" : value === "," ? "comma" : "pipe"; }
