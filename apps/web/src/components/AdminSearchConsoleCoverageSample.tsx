"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminSearchConsoleCoverageSample({ csrfToken, enabled }: { csrfToken: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function runSample() {
    if (!enabled || busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/seo/search-console/index-coverage/run", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ limit: 10 }),
        cache: "no-store"
      });
      const payload = await response.json() as { result?: { attempted: number; succeeded: number; failed: number }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Index coverage sample failed.");
      setMessage(`Inspected ${payload.result.attempted} governed URLs: ${payload.result.succeeded} saved · ${payload.result.failed} failed.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Index coverage sample failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="workspace-action-bar">
    <span>Inspect up to 10 governed indexable canonical URLs, prioritizing routes with no evidence, stale evidence, or current attention signals. No arbitrary URL input is accepted.</span>
    <div className="workspace-action-buttons"><button type="button" className="button" onClick={runSample} disabled={!enabled || busy}>{busy ? "Inspecting Google…" : "Run 10-URL sample"}</button></div>
    {!enabled && <small>Search Console readiness, PostgreSQL evidence storage and <code>content.write</code> permission are required.</small>}
    {message && <small role="status">{message}</small>}
    {error && <small className="form-error" role="alert">{error}</small>}
  </div>;
}
