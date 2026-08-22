"use client";

import { useState } from "react";

type Inspection = Readonly<{
  inspectionUrl: string;
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  lastCrawlTime?: string;
  pageFetchState?: string;
  crawledAs?: string;
  googleCanonical?: string;
  userCanonical?: string;
  sitemaps: readonly string[];
  referringUrls: readonly string[];
}>;

function value(value: string | undefined) {
  return value || "—";
}

export function AdminSearchConsoleUrlInspector({ csrfToken, defaultUrl, enabled }: { csrfToken: string; defaultUrl: string; enabled: boolean }) {
  const [inspection, setInspection] = useState<Inspection>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInspection(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/seo/search-console/inspect", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ url: String(form.get("url") ?? "") })
      });
      const payload = await response.json() as { inspection?: Inspection; error?: string };
      if (!response.ok || !payload.inspection) throw new Error(payload.error ?? "URL inspection failed.");
      setInspection(payload.inspection);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "URL inspection failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <form className="admin-json-form" onSubmit={submit}>
      <label>
        <span>Public HTTPS URL</span>
        <input name="url" type="url" defaultValue={defaultUrl} placeholder="https://kontamou.site/..." required disabled={!enabled || busy} />
      </label>
      <button className="button" disabled={!enabled || busy}>{busy ? "Inspecting…" : "Inspect with Google"}</button>
      {!enabled && <small>Connect and enable Search Console first.</small>}
      {error && <small className="form-error" role="alert">{error}</small>}
    </form>

    {inspection && <div className="workspace-queue-list" style={{ marginTop: 16 }}>
      <article className="workspace-queue-card">
        <div className="workspace-queue-head"><div><strong>{inspection.inspectionUrl}</strong><small>Google URL Inspection result</small></div><span className="status-pill">{value(inspection.verdict)}</span></div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Coverage</strong><span>{value(inspection.coverageState)}</span></div>
          <div className="workspace-compact-row"><strong>Indexing state</strong><span>{value(inspection.indexingState)}</span></div>
          <div className="workspace-compact-row"><strong>robots.txt</strong><span>{value(inspection.robotsTxtState)}</span></div>
          <div className="workspace-compact-row"><strong>Page fetch</strong><span>{value(inspection.pageFetchState)}</span></div>
          <div className="workspace-compact-row"><strong>Crawled as</strong><span>{value(inspection.crawledAs)}</span></div>
          <div className="workspace-compact-row"><strong>Last Google crawl</strong><span>{inspection.lastCrawlTime ? new Date(inspection.lastCrawlTime).toLocaleString("el-GR") : "—"}</span></div>
          <div className="workspace-compact-row"><strong>User canonical</strong><span>{value(inspection.userCanonical)}</span></div>
          <div className="workspace-compact-row"><strong>Google canonical</strong><span>{value(inspection.googleCanonical)}</span></div>
          <div className="workspace-compact-row"><strong>Sitemaps</strong><span>{inspection.sitemaps.length ? inspection.sitemaps.join(" · ") : "—"}</span></div>
          <div className="workspace-compact-row"><strong>Known referring URLs</strong><span>{inspection.referringUrls.length ? inspection.referringUrls.slice(0, 5).join(" · ") : "—"}</span></div>
        </div>
      </article>
    </div>}
  </div>;
}
