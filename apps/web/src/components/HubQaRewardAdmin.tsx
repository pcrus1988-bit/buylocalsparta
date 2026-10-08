"use client";
import { useCallback, useEffect, useState } from "react";

type QaEntry = {
  id: string; status: string; created_at: string; expires_at: string;
  redeemed_at?: string; qa_reference?: string;
  setup_fee_original_cents?: number; setup_fee_payable_cents?: number;
};

export function HubQaRewardAdmin({ csrfToken }: { csrfToken: string }) {
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [items, setItems] = useState<QaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/research/qa-codes", { cache: "no-store" });
      const data = await response.json() as { items?: QaEntry[]; error?: string };
      if (!response.ok) throw new Error(data.error || "QA list unavailable");
      setItems(data.items || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load QA history.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function action(payload: Record<string, string>) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/research/qa-codes", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(payload)
      });
      const result = await response.json() as { code?: string; expiresAt?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "QA action failed");
      if (result.code) { setCode(result.code); setExpiresAt(result.expiresAt || ""); setCopied(false); }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "QA action failed");
    } finally {
      setLoading(false);
    }
  }

  function revoke(id: string) {
    if (!window.confirm("Revoke this unredeemed QA code?")) return;
    void action({ action: "revoke", id });
  }

  return <section className="workspace-queue-card" style={{ marginTop: 16 }}>
    <div className="eyebrow">Only for controlled testing</div>
    <h2>Admin-generated QA code</h2>
    <p>Generate a <strong>single-use 48-hour QA26</strong> code to check the 50% one-time onboarding-fee offer on <a href="/hubs/join#reward-code" target="_blank" rel="noreferrer">/hubs/join</a>. Previewing prices does not consume it. Submitting a form with the QA code records only a QA redemption: no real business application, survey response, trial or email is created.</p>
    <div className="workspace-action-buttons">
      <button type="button" className="button" disabled={loading}
        onClick={() => void action({ action: "generate", confirm: "GENERATE ONE QA CODE" })}>
        {loading ? "Processing…" : "Generate one QA test code"}
      </button>
      <button type="button" className="button button-secondary" disabled={loading} onClick={() => void refresh()}>Refresh QA history</button>
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {code && <div className="workspace-inline-note" role="status" style={{ marginTop: 16 }}>
      <strong>New QA code — shown only now</strong>
      <p><code style={{ fontSize: "1.2rem", fontWeight: 700, letterSpacing: "0.04em" }}>{code}</code></p>
      <small>Expires {new Date(expiresAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}. Copy before leaving; only its SHA-256 hash is stored.</small>
      <div style={{ marginTop: 10 }}>
        <button type="button" className="button button-secondary" onClick={() => {
          void navigator.clipboard.writeText(code).then(() => setCopied(true)).catch(() => setError("Copy manually from the code above."));
        }}>{copied ? "Copied" : "Copy code"}</button>
      </div>
    </div>}
    <h3 style={{ marginTop: 24 }}>Recent QA codes</h3>
    <p><small>Last 25 entries. Plaintext codes cannot be recovered. This history is separate from genuine Research rewards.</small></p>
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 680, textAlign: "left" }}>
        <thead><tr><th>Created</th><th>Status</th><th>Expires</th><th>QA reference / fee</th><th>Action</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}>
          <td>{new Date(item.created_at).toLocaleString("el-GR")}</td>
          <td><strong>{item.status}</strong></td>
          <td>{new Date(item.expires_at).toLocaleString("el-GR")}</td>
          <td>{item.qa_reference ? <><code>{item.qa_reference}</code> · {new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format((item.setup_fee_payable_cents || 0) / 100)}</> : "—"}</td>
          <td>{item.status === "issued" ? <button type="button" className="button button-secondary" disabled={loading} onClick={() => revoke(item.id)}>Revoke</button> : "—"}</td>
        </tr>)}</tbody>
      </table>
      {items.length === 0 && <p>No QA codes yet.</p>}
    </div>
  </section>;
}
