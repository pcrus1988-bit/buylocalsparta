"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminSearchConsoleSitemap({ csrfToken, enabled, submitted }: { csrfToken: string; enabled: boolean; submitted: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    if (!enabled || busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/seo/search-console/sitemap/submit", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: "{}",
        cache: "no-store"
      });
      const payload = await response.json() as { result?: { sitemapUrl: string; submittedAt: string }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Sitemap submission failed.");
      setMessage(`Submission accepted for ${payload.result.sitemapUrl}. Google may need time to download and process it.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sitemap submission failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="workspace-action-bar">
    <span>Submit only the governed production sitemap. Submission asks Google to process the sitemap; it does not guarantee crawling or indexing.</span>
    <div className="workspace-action-buttons"><button type="button" className="button" onClick={submit} disabled={!enabled || busy}>{busy ? "Submitting…" : submitted ? "Resubmit sitemap" : "Submit sitemap"}</button></div>
    {!enabled && <small>Search Console readiness and <code>content.write</code> permission are required.</small>}
    {message && <small role="status">{message}</small>}
    {error && <small className="form-error" role="alert">{error}</small>}
  </div>;
}
