"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { OpenIcecatControlSettings } from "@buy-local-sparta/core";

type EditableSettings = Omit<OpenIcecatControlSettings, "revision">;

function seconds(ms: number): number { return Math.round(ms / 1000); }
function minutes(ms: number): number { return Math.round(ms / 60_000); }

export function IcecatSettingsForm({ csrfToken, settings, writable }: Readonly<{
  csrfToken: string;
  settings: OpenIcecatControlSettings;
  writable: boolean;
}>) {
  const router = useRouter();
  const initial = useMemo<EditableSettings>(() => ({
    indexEnabled: settings.indexEnabled,
    detailEnabled: settings.detailEnabled,
    indexIntervalMs: settings.indexIntervalMs,
    indexRetryMs: settings.indexRetryMs,
    indexBatchSize: settings.indexBatchSize,
    indexFetchTimeoutMs: settings.indexFetchTimeoutMs,
    detailPollMs: settings.detailPollMs,
    detailSyncIntervalMs: settings.detailSyncIntervalMs,
    detailBatchSize: settings.detailBatchSize,
    detailLeaseSeconds: settings.detailLeaseSeconds,
    detailRequestTimeoutMs: settings.detailRequestTimeoutMs,
    detailRateDelayMs: settings.detailRateDelayMs,
    detailMaxAttempts: settings.detailMaxAttempts,
    detailRetryBaseSeconds: settings.detailRetryBaseSeconds,
    minimumGreekScore: settings.minimumGreekScore
  }), [settings]);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function numberField(field: keyof EditableSettings, value: number) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/icecat/settings", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(form)
      });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Icecat settings update failed");
      setMessage("Αποθηκεύτηκε. Οι workers επαναδιαβάζουν τις ρυθμίσεις και εφαρμόζουν την αλλαγή live, χωρίς redeploy.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Icecat settings update failed");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = { display: "grid", gap: ".35rem" } as const;
  const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "1rem" } as const;

  return <div className="workspace-queue-card">
    <div className="workspace-queue-head">
      <div><strong>Live worker settings</strong><small>Persistence: catalog source metadata · propagation target ≤ 5 sec.</small></div>
      <span className={`status-badge ${form.indexEnabled || form.detailEnabled ? "status-active" : "status-muted"}`}>{form.indexEnabled || form.detailEnabled ? "LIVE" : "PAUSED"}</span>
    </div>

    <div style={{ ...gridStyle, marginTop: "1rem" }}>
      <label style={fieldStyle}><span>Index ingestion</span><select value={form.indexEnabled ? "on" : "off"} disabled={!writable || busy} onChange={(e) => setForm((c) => ({ ...c, indexEnabled: e.target.value === "on" }))}><option value="on">Enabled</option><option value="off">Paused</option></select></label>
      <label style={fieldStyle}><span>Detail enrichment</span><select value={form.detailEnabled ? "on" : "off"} disabled={!writable || busy} onChange={(e) => setForm((c) => ({ ...c, detailEnabled: e.target.value === "on" }))}><option value="on">Enabled</option><option value="off">Paused</option></select></label>
      <label style={fieldStyle}><span>Index cadence · minutes</span><input type="number" min={1} max={10080} value={minutes(form.indexIntervalMs)} disabled={!writable || busy} onChange={(e) => numberField("indexIntervalMs", Number(e.target.value) * 60_000)} /></label>
      <label style={fieldStyle}><span>Index retry · minutes</span><input type="number" min={1} max={1440} value={minutes(form.indexRetryMs)} disabled={!writable || busy} onChange={(e) => numberField("indexRetryMs", Number(e.target.value) * 60_000)} /></label>
      <label style={fieldStyle}><span>Index batch size</span><input type="number" min={1} max={10000} value={form.indexBatchSize} disabled={!writable || busy} onChange={(e) => numberField("indexBatchSize", Number(e.target.value))} /></label>
      <label style={fieldStyle}><span>Index fetch timeout · minutes</span><input type="number" min={1} max={360} value={minutes(form.indexFetchTimeoutMs)} disabled={!writable || busy} onChange={(e) => numberField("indexFetchTimeoutMs", Number(e.target.value) * 60_000)} /></label>
    </div>

    <hr style={{ margin: "1.25rem 0", opacity: .2 }} />

    <div style={gridStyle}>
      <label style={fieldStyle}><span>Detail poll · sec</span><input type="number" min={1} max={60} value={seconds(form.detailPollMs)} disabled={!writable || busy} onChange={(e) => numberField("detailPollMs", Number(e.target.value) * 1000)} /></label>
      <label style={fieldStyle}><span>Queue sync · minutes</span><input type="number" min={1} max={1440} value={minutes(form.detailSyncIntervalMs)} disabled={!writable || busy} onChange={(e) => numberField("detailSyncIntervalMs", Number(e.target.value) * 60_000)} /></label>
      <label style={fieldStyle}><span>Detail batch size</span><input type="number" min={1} max={50} value={form.detailBatchSize} disabled={!writable || busy} onChange={(e) => numberField("detailBatchSize", Number(e.target.value))} /></label>
      <label style={fieldStyle}><span>Rate delay · ms</span><input type="number" min={0} max={60000} step={50} value={form.detailRateDelayMs} disabled={!writable || busy} onChange={(e) => numberField("detailRateDelayMs", Number(e.target.value))} /></label>
      <label style={fieldStyle}><span>Request timeout · ms</span><input type="number" min={250} max={60000} step={250} value={form.detailRequestTimeoutMs} disabled={!writable || busy} onChange={(e) => numberField("detailRequestTimeoutMs", Number(e.target.value))} /></label>
      <label style={fieldStyle}><span>Lease · sec</span><input type="number" min={30} max={3600} value={form.detailLeaseSeconds} disabled={!writable || busy} onChange={(e) => numberField("detailLeaseSeconds", Number(e.target.value))} /></label>
      <label style={fieldStyle}><span>Max attempts</span><input type="number" min={1} max={20} value={form.detailMaxAttempts} disabled={!writable || busy} onChange={(e) => numberField("detailMaxAttempts", Number(e.target.value))} /></label>
      <label style={fieldStyle}><span>Retry base · sec</span><input type="number" min={1} max={3600} value={form.detailRetryBaseSeconds} disabled={!writable || busy} onChange={(e) => numberField("detailRetryBaseSeconds", Number(e.target.value))} /></label>
      <label style={fieldStyle}><span>Minimum Greek score</span><input type="number" min={0.9} max={1} step={0.01} value={form.minimumGreekScore} disabled={!writable || busy} onChange={(e) => numberField("minimumGreekScore", Number(e.target.value))} /></label>
    </div>

    <div className="workspace-action-bar" style={{ marginTop: "1.25rem" }}>
      <span>{writable ? "Changes are validated before persistence. Secrets remain deployment-managed." : "Read-only access. catalog.write is required to change Icecat behavior."}</span>
      {writable && <button className="button button-primary" type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save & apply live"}</button>}
    </div>
    {message && <p className="form-success" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
