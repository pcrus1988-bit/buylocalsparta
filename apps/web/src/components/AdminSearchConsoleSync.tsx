"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminSearchConsoleSync({ csrfToken, enabled }: { csrfToken: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function sync() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/seo/search-console/sync", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: "{}"
      });
      const payload = await response.json() as { result?: { id: string; startDate: string; endDate: string; pageRows: number; queryRows: number }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Search Console sync failed.");
      setMessage(`Saved ${payload.result.startDate} → ${payload.result.endDate}: ${payload.result.pageRows} page rows · ${payload.result.queryRows} privacy-safe query rows.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search Console sync failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="workspace-action-bar">
    <span>Fetch final Google Search Analytics data and preserve it as immutable aggregate evidence.</span>
    <div className="workspace-action-buttons"><button type="button" className="button" onClick={sync} disabled={!enabled || busy}>{busy ? "Syncing…" : "Sync Search Console"}</button></div>
    {!enabled && <small>Search Console must be ready and <code>content.write</code> permission is required.</small>}
    {message && <small role="status">{message}</small>}
    {error && <small className="form-error" role="alert">{error}</small>}
  </div>;
}
