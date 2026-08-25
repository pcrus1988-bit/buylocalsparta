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

type CanonicalizationResult = Readonly<{
  status: string;
  runId: string;
  sourceCode: string;
  snapshotId: string;
  vendorId: string;
  locationId: string;
  result: Readonly<Record<string, unknown>>;
}>;

export function AdminAiProductImportForm({ csrfToken }: { csrfToken: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [sourceCode, setSourceCode] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState<"analyze" | "stage" | "promote" | "canonicalize" | "">("");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<Analysis>();
  const [staged, setStaged] = useState<StageResult>();
  const [promoted, setPromoted] = useState<PromotionResult>();
  const [canonicalized, setCanonicalized] = useState<CanonicalizationResult>();

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choose a CSV, TSV or gzip product file."); return; }
    setBusy("analyze"); setError(""); setAnalysis(undefined); setStaged(undefined); setPromoted(undefined); setCanonicalized(undefined);
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

  async function stage() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("The analyzed file is no longer selected."); return; }
    if (!sourceCode.trim() || !sourceName.trim()) { setError("Source code and source name are required before normalization is persisted."); return; }
    setBusy("stage"); setError(""); setPromoted(undefined); setCanonicalized(undefined);
    try {
      const body = new FormData();
      body.set("file", file); body.set("sourceCode", sourceCode); body.set("sourceName", sourceName);
      const response = await fetch("/api/admin/catalogue-intake/stage", {
        method: "POST", headers: { "x-csrf-token": csrfToken }, body, cache: "no-store"
      });
      const payload = await response.json() as StageResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Normalization staging failed.");
      setStaged(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(""); }
  }

  async function promote() {
    if (!staged?.runId) return;
    setBusy("promote"); setError(""); setCanonicalized(undefined);
    try {
      const response = await jsonPost("/api/admin/catalogue-intake/promote", { runId: staged.runId }, csrfToken);
      setPromoted(response as PromotionResult);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(""); }
  }

  async function canonicalize() {
    if (!staged?.runId || !promoted?.snapshotId) return;
    if (!vendorId.trim() || !locationId.trim()) { setError("Choose a vendor and active vendor location before canonicalization."); return; }
    setBusy("canonicalize"); setError("");
    try {
      const response = await jsonPost("/api/admin/catalogue-intake/canonicalize", {
        runId: staged.runId, vendorId: vendorId.trim(), locationId: locationId.trim()
      }, csrfToken);
      setCanonicalized(response as CanonicalizationResult);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(""); }
  }

  return <div className="workspace-form-stack">
    <form className="workspace-form-stack" onSubmit={analyze}>
      <label className="workspace-field">
        <span>Supplier product file</span>
        <input ref={fileRef} type="file" name="file" accept=".csv,.tsv,.txt,.gz,text/csv,text/tab-separated-values,application/gzip,application/x-gzip" required disabled={Boolean(busy)} />
        <small>CSV, semicolon CSV, TSV and gzip are supported. Product Intelligence detects the schema before any database write.</small>
      </label>
      <div className="workspace-inline-note"><strong>Controlled lifecycle.</strong> Analyze → persist normalized evidence → promote safe rows to PIM → governed canonicalization. No offer, live stock or public listing is created here.</div>
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
        <div><button className="button button-primary" type="button" onClick={stage} disabled={Boolean(busy)}>{busy === "stage" ? "Normalizing…" : "2 · Persist normalization"}</button></div>
      </div>
      <div className="workspace-inline-note">The source/profile identity is immutable for this file hash. Re-uploading the same source reuses the existing run instead of duplicating data.</div>
    </section>}

    {staged && <section className="workspace-form-stack" aria-live="polite">
      <div className="workspace-inline-note"><strong>{staged.status.replaceAll("_", " ")}</strong> · run {staged.runId} · profile {staged.profileStatus} · {staged.duplicateSourceKeys} duplicate source identities</div>
      <div className="workspace-metric-strip">
        <div className="workspace-metric"><span>Normalized</span><strong>{staged.rowCount.toLocaleString("en-US")}</strong></div>
        <div className="workspace-metric"><span>Ready</span><strong>{staged.readyRows.toLocaleString("en-US")}</strong></div>
        <div className="workspace-metric"><span>Review</span><strong>{staged.reviewRows.toLocaleString("en-US")}</strong></div>
        <div className="workspace-metric"><span>Quarantine</span><strong>{staged.quarantineRows.toLocaleString("en-US")}</strong></div>
      </div>
      <div className="workspace-action-bar">
        <span>Promotion writes supplier evidence only. Quarantined and duplicate identities are excluded.</span>
        <button className="button button-primary" type="button" onClick={promote} disabled={Boolean(busy)}>{busy === "promote" ? "Promoting…" : "3 · Promote safe rows to PIM"}</button>
      </div>
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
      <div className="admin-directory-filters">
        <label><span>Vendor public ID / UUID</span><input value={vendorId} onChange={(event) => setVendorId(event.target.value)} placeholder="vendor_…" disabled={Boolean(busy)} /></label>
        <label><span>Active location public ID / UUID</span><input value={locationId} onChange={(event) => setLocationId(event.target.value)} placeholder="location_…" disabled={Boolean(busy)} /></label>
        <div><button className="button button-primary" type="button" onClick={canonicalize} disabled={Boolean(busy)}>{busy === "canonicalize" ? "Canonicalizing…" : "4 · Safe canonicalization"}</button></div>
      </div>
      <div className="workspace-inline-note">The canonicalizer auto-links/creates only identity-unique, high-confidence rows and creates a <strong>candidate assortment</strong> for the selected vendor—even before vendor activation. Ambiguous rows go to the canonicalization review queue.</div>
    </section>}

    {canonicalized && <section className="workspace-form-stack" aria-live="polite">
      <div className="workspace-inline-note"><strong>{canonicalized.status.replaceAll("_", " ")}</strong> · vendor {canonicalized.vendorId} · location {canonicalized.locationId}</div>
      <details className="workspace-record-details" open><summary>Canonicalization outcome</summary><pre>{JSON.stringify(canonicalized.result, null, 2)}</pre></details>
      <div className="workspace-inline-note"><strong>Commerce remains off.</strong> This lifecycle does not approve vendor offers, invent stock, or make products public. Those remain separate governed decisions.</div>
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
