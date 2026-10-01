"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminBulkCatalogApproval({
  csrfToken,
  submissionIds
}: {
  csrfToken: string;
  submissionIds: readonly string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!submissionIds.length) return null;

  async function approve() {
    if (!window.confirm(`Approve up to ${submissionIds.length.toLocaleString("el-GR")} submissions on this page? Products with multiple possible matches will be skipped.`)) return;
    const reason = window.prompt("Approval reason", "Bulk approval by Admin");
    if (reason === null) return;

    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/catalog/bulk-approve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({ submissionIds, reason })
      });
      const payload = await response.json() as {
        error?: string;
        approved?: number;
        skipped?: number;
        failed?: number;
        details?: Array<{ id: string; status: string; detail?: string }>;
      };
      if (!response.ok) throw new Error(payload.error ?? "Bulk approval failed.");

      const approved = Number(payload.approved ?? 0);
      const skipped = Number(payload.skipped ?? 0);
      const failed = Number(payload.failed ?? 0);
      setMessage(`${approved.toLocaleString("el-GR")} approved${skipped ? ` · ${skipped.toLocaleString("el-GR")} skipped` : ""}${failed ? ` · ${failed.toLocaleString("el-GR")} failed` : ""}.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bulk approval failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="workspace-action-bar" style={{ margin: "14px 0" }}>
    <span>Bulk action applies to approvable submissions on the current page. Ambiguous multi-match products stay in manual review.</span>
    <div className="workspace-action-buttons">
      <button type="button" className="button button-primary" disabled={busy} onClick={() => void approve()}>
        {busy ? "Approving…" : `Bulk approve (${submissionIds.length.toLocaleString("el-GR")})`}
      </button>
    </div>
    {message && <div className="workspace-inline-note" role="status" style={{ flexBasis: "100%" }}><strong>Done.</strong> {message}</div>}
    {error && <div className="form-error" role="alert" style={{ flexBasis: "100%" }}><strong>Bulk approval failed.</strong> {error}</div>}
  </div>;
}
