"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminSeoRegistryActions({ csrfToken, canWrite, action }: { csrfToken: string; canWrite: boolean; action: "sync" | "capture" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isSync = action === "sync";

  async function run() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(isSync ? "/api/admin/seo/pages/sync" : "/api/admin/seo/sitemaps/capture", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: "{}"
      });
      const payload = await response.json() as { result?: { synced?: number; deactivated?: number; id?: string; entryCount?: number; valid?: boolean; error?: string }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "SEO operation failed.");
      if (isSync) setMessage(`Registry refreshed: ${payload.result.synced ?? 0} governed URLs · ${payload.result.deactivated ?? 0} deactivated.`);
      else setMessage(payload.result.valid ? `Sitemap snapshot ${payload.result.id} captured with ${payload.result.entryCount ?? 0} URLs.` : `Sitemap snapshot captured as invalid: ${payload.result.error ?? "review evidence"}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SEO operation failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="workspace-action-bar">
    <span>{isSync ? "Derived registry only; SEO policy remains authoritative." : "Captures the live production sitemap as immutable evidence."}</span>
    <div className="workspace-action-buttons">
      <button className="button" type="button" onClick={run} disabled={!canWrite || busy}>{busy ? (isSync ? "Syncing…" : "Capturing…") : (isSync ? "Refresh URL registry" : "Capture production sitemap")}</button>
    </div>
    {!canWrite && <small><code>content.write</code> permission is required.</small>}
    {message && <small role="status">{message}</small>}
    {error && <small className="form-error" role="alert">{error}</small>}
  </div>;
}
