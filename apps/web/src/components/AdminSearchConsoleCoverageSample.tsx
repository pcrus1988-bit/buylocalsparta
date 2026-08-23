"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SamplingKind = "static" | "cms" | "category" | "product" | "partner_vendor" | "research_vendor";

type SamplingResult = Readonly<{
  attempted: number;
  succeeded: number;
  failed: number;
  strategy?: string;
  byKind?: Partial<Record<SamplingKind, number>>;
}>;

const KIND_LABELS: ReadonlyArray<readonly [SamplingKind, string]> = [
  ["product", "products"],
  ["partner_vendor", "partner vendors"],
  ["research_vendor", "research vendors"],
  ["category", "categories"],
  ["static", "static"],
  ["cms", "CMS"]
];

function kindSummary(byKind?: SamplingResult["byKind"]): string {
  if (!byKind) return "";
  return KIND_LABELS.map(([kind, label]) => [Number(byKind[kind] ?? 0), label] as const)
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(" · ");
}

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
      const payload = await response.json() as { result?: SamplingResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Index coverage sample failed.");
      const mix = kindSummary(payload.result.byKind);
      setMessage(`Inspected ${payload.result.attempted} governed URLs: ${payload.result.succeeded} saved · ${payload.result.failed} failed${mix ? ` · ${mix}` : ""}.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Index coverage sample failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="workspace-action-bar">
    <span>Inspect up to 10 governed indexable canonical URLs. Missing still outranks stale and attention evidence; within each priority tier the sampler round-robins products, vendor types, categories, static pages and CMS so one route family cannot consume the batch. No arbitrary URL input is accepted.</span>
    <div className="workspace-action-buttons"><button type="button" className="button" onClick={runSample} disabled={!enabled || busy}>{busy ? "Inspecting Google…" : "Run 10-URL sample"}</button></div>
    {!enabled && <small>Search Console readiness, PostgreSQL evidence storage and <code>content.write</code> permission are required.</small>}
    {message && <small role="status">{message}</small>}
    {error && <small className="form-error" role="alert">{error}</small>}
  </div>;
}
