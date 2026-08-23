"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type StepState = "idle" | "running" | "success" | "error";
type Step = Readonly<{
  id: "registry" | "crawl" | "sitemap" | "gsc" | "coverage";
  label: string;
  endpoint: string;
  body: string;
}>;

const STEPS: readonly Step[] = [
  { id: "registry", label: "URL registry", endpoint: "/api/admin/seo/pages/sync", body: "{}" },
  { id: "crawl", label: "Production crawl + schema", endpoint: "/api/admin/seo/crawl/run", body: JSON.stringify({ limit: 100 }) },
  { id: "sitemap", label: "Production sitemap", endpoint: "/api/admin/seo/sitemaps/capture", body: "{}" },
  { id: "gsc", label: "Search Console performance", endpoint: "/api/admin/seo/search-console/sync", body: "{}" },
  { id: "coverage", label: "Google index coverage", endpoint: "/api/admin/seo/search-console/index-coverage/run", body: JSON.stringify({ limit: 10 }) }
] as const;

const IDLE_STATES: Record<Step["id"], StepState> = { registry: "idle", crawl: "idle", sitemap: "idle", gsc: "idle", coverage: "idle" };

export function AdminSeoEvidenceRefresh({ csrfToken, enabled }: { csrfToken: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [states, setStates] = useState<Record<Step["id"], StepState>>(IDLE_STATES);
  const [details, setDetails] = useState<Record<string, string>>({});

  function setStep(id: Step["id"], state: StepState, detail?: string) {
    setStates((current) => ({ ...current, [id]: state }));
    if (detail) setDetails((current) => ({ ...current, [id]: detail }));
  }

  async function runStep(step: Step) {
    setStep(step.id, "running");
    try {
      const response = await fetch(step.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: step.body,
        cache: "no-store"
      });
      const payload = await response.json() as { error?: string; warning?: string; result?: { attempted?: number; succeeded?: number; failed?: number } };
      if (!response.ok) throw new Error(payload.error ?? `${step.label} refresh failed.`);
      const coverageDetail = step.id === "coverage" && payload.result
        ? `Inspected ${payload.result.attempted ?? 0} · ${payload.result.succeeded ?? 0} saved · ${payload.result.failed ?? 0} failed.`
        : undefined;
      setStep(step.id, "success", coverageDetail ?? (payload.warning ? `Completed with warning: ${payload.warning}` : "Evidence refreshed."));
    } catch (cause) {
      setStep(step.id, "error", cause instanceof Error ? cause.message : `${step.label} refresh failed.`);
    }
  }

  async function refreshAll() {
    if (!enabled || busy) return;
    setBusy(true);
    setStates({ ...IDLE_STATES });
    setDetails({});
    try {
      for (const step of STEPS) await runStep(step);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return <div className="workspace-tool-panel" style={{ marginTop: 16 }}>
    <div className="workspace-tool-body">
      <div className="workspace-action-bar">
        <span>Refresh the governed URL registry, up to 100 indexable production URLs (including JSON-LD evidence), the production sitemap, Search Console performance and a final bounded 10-URL Google index coverage sample. Each endpoint keeps its own RBAC, CSRF, audit, quota and persistence controls.</span>
        <div className="workspace-action-buttons"><button type="button" className="button" onClick={refreshAll} disabled={!enabled || busy}>{busy ? "Refreshing evidence…" : "Refresh evidence pack"}</button></div>
      </div>
      <div className="workspace-compact-list" style={{ marginTop: 12 }}>
        {STEPS.map((step) => <div className="workspace-compact-row" key={step.id}>
          <strong>{step.label}</strong>
          <span>{states[step.id] === "idle" ? "Not run" : states[step.id] === "running" ? "Running…" : states[step.id] === "success" ? "Refreshed" : "Failed"}{details[step.id] ? ` · ${details[step.id]}` : ""}</span>
        </div>)}
      </div>
      {!enabled && <small>content.write permission is required to refresh operational evidence.</small>}
    </div>
  </div>;
}
