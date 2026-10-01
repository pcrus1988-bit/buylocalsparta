"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminBulkCatalogApproval({
  csrfToken,
  query,
  status,
  filteredTotal
}: {
  csrfToken: string;
  query?: string;
  status?: string;
  filteredTotal: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!filteredTotal) return null;

  async function approve() {
    const scopeLabel = query || status ? "the full filtered result set" : "all catalogue submissions";
    if (!window.confirm(
      `Approve every eligible submission across ${scopeLabel} (${filteredTotal.toLocaleString("el-GR")} matching products)? This is not limited to the current page. Products with multiple possible matches will be skipped.`
    )) return;

    const reason = window.prompt("Approval reason", "Bulk approval by Admin");
    if (reason === null) return;

    setBusy(true);
    setMessage("");
    setError("");

    let approved = 0;
    let skipped = 0;
    let failed = 0;
    let scanned = 0;
    let cursor: string | undefined;

    try {
      for (let batch = 0; batch < 1000; batch += 1) {
        const payload = await postBulkApproval({
          csrfToken,
          body: {
            scope: "all",
            q: query,
            status,
            cursor,
            reason
          }
        });

        approved += Number(payload.approved ?? 0);
        skipped += Number(payload.skipped ?? 0);
        failed += Number(payload.failed ?? 0);
        scanned += Number(payload.scanned ?? 0);

        setMessage(
          `${scanned.toLocaleString("el-GR")} checked · ${approved.toLocaleString("el-GR")} approved${skipped ? ` · ${skipped.toLocaleString("el-GR")} skipped` : ""}${failed ? ` · ${failed.toLocaleString("el-GR")} failed` : ""}.`
        );

        if (!payload.hasMore) break;
        if (!payload.nextCursor || payload.nextCursor === cursor) {
          throw new Error("Bulk approval could not advance to the next batch.");
        }
        cursor = payload.nextCursor;

        if (batch === 999) throw new Error("Bulk approval exceeded the safe batch limit.");
      }

      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bulk approval failed.");
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel = query || status
    ? `Bulk approve all filtered (${filteredTotal.toLocaleString("el-GR")})`
    : `Bulk approve all (${filteredTotal.toLocaleString("el-GR")})`;

  return <div className="workspace-action-bar" style={{ margin: "14px 0" }}>
    <span>One action processes every eligible product across all result pages. Ambiguous multi-match products stay in manual review.</span>
    <div className="workspace-action-buttons">
      <button type="button" className="button button-primary" disabled={busy} onClick={() => void approve()}>
        {busy ? "Approving all…" : buttonLabel}
      </button>
    </div>
    {message && <div className="workspace-inline-note" role="status" style={{ flexBasis: "100%" }}><strong>{busy ? "Working." : "Done."}</strong> {message}</div>}
    {error && <div className="form-error" role="alert" style={{ flexBasis: "100%" }}><strong>Bulk approval failed.</strong> {error}</div>}
  </div>;
}


type BulkApprovalPayload = {
  error?: string;
  approved?: number;
  skipped?: number;
  failed?: number;
  scanned?: number;
  hasMore?: boolean;
  nextCursor?: string;
};

async function postBulkApproval(input: {
  csrfToken: string;
  body: Record<string, unknown>;
}): Promise<BulkApprovalPayload> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch("/api/admin/catalog/bulk-approve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": input.csrfToken
        },
        body: JSON.stringify(input.body)
      });
      const payload = await response.json() as BulkApprovalPayload;
      if (response.ok) return payload;

      const error = new Error(payload.error ?? "Bulk approval failed.");
      if (!isTransientBulkError(error.message) || attempt === 3) throw error;
      lastError = error;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error("Bulk approval request failed.");
      if (!isTransientBulkError(error.message) || attempt === 3) throw error;
      lastError = error;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)));
  }

  throw lastError ?? new Error("Bulk approval failed.");
}

function isTransientBulkError(message: string): boolean {
  return /timeout|timed out|trying to connect|connection|ECONN|ETIMEDOUT|fetch failed|network/i.test(message);
}
