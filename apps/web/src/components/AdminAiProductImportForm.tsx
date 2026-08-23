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

export function AdminAiProductImportForm({ csrfToken }: { csrfToken: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | undefined>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choose a CSV, TSV or gzip product file."); return; }
    setBusy(true);
    setError("");
    setAnalysis(undefined);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/admin/catalogue-intake/analyze", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        body,
        cache: "no-store"
      });
      const payload = await response.json() as Analysis & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Product import analysis failed.");
      setAnalysis(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return <div className="workspace-form-stack">
    <form className="workspace-form-stack" onSubmit={submit}>
      <label className="workspace-field">
        <span>Supplier product file</span>
        <input ref={fileRef} type="file" name="file" accept=".csv,.tsv,.txt,.gz,text/csv,text/tab-separated-values,application/gzip,application/x-gzip" required disabled={busy} />
        <small>CSV, semicolon CSV, TSV and gzip are supported. The engine detects the delimiter, profiles values and proposes a canonical product schema without writing catalogue data.</small>
      </label>
      <div className="workspace-inline-note"><strong>Safe analysis mode.</strong> No canonical products, vendor offers, stock, assortment or public listings are created from this step.</div>
      <div className="workspace-action-bar">
        <span>Admin permission <code>catalog.write</code> and CSRF protection are required.</span>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Analyzing…" : "Analyze with Product Intelligence"}</button>
      </div>
      {error && <div className="workspace-inline-note" role="alert"><strong>Analysis rejected:</strong> {error}</div>}
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
        <div className="workspace-compact-list">
          {analysis.mappings.map((mapping) => <div className="workspace-compact-row" key={`${mapping.sourceColumn}-${mapping.canonicalField}`}>
            <strong>{mapping.sourceColumn} → {mapping.canonicalField}</strong>
            <span>{Math.round(mapping.confidence * 100)}% · {mapping.method.replaceAll("_", " ")}{mapping.evidence[0] ? ` · ${mapping.evidence[0]}` : ""}</span>
          </div>)}
        </div>
      </details>

      <details className="workspace-record-details">
        <summary>Columns requiring operator attention</summary>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Ambiguous</strong><span>{analysis.ambiguousColumns.join(" · ") || "None"}</span></div>
          <div className="workspace-compact-row"><strong>Unmapped</strong><span>{analysis.unmappedColumns.join(" · ") || "None"}</span></div>
        </div>
      </details>

      <div className="workspace-inline-note"><strong>Next lifecycle:</strong> operator confirms/overrides mappings → source snapshot → identity matching → auto-link / auto-create candidate / exception queue → vendor assortment assignment.</div>
    </section>}
  </div>;
}

function pct(value: number): string { return `${Math.round(value * 100)}%`; }
function labelDelimiter(value: string): string { return value === "\t" ? "TAB" : value === ";" ? "semicolon" : value === "," ? "comma" : "pipe"; }
