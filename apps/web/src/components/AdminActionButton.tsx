"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { publishAdminActionCompleted } from "../lib/admin-action-events";

export function AdminActionButton({ label, endpoint, csrfToken, body = {}, reasonPrompt, extraPrompt, danger = false }: {
  label: string; endpoint: string; csrfToken: string; body?: Record<string, unknown>; reasonPrompt?: string; extraPrompt?: { field: string; message: string }; danger?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    const payload: Record<string, unknown> = { ...body };
    if (reasonPrompt) {
      const reason = window.prompt(reasonPrompt);
      if (reason === null) return;
      const normalizedReason = reason.trim();
      if (normalizedReason.length < 3) {
        setError("Απαιτείται αιτιολογία τουλάχιστον 3 χαρακτήρων.");
        return;
      }
      payload.reason = normalizedReason;
    }
    if (extraPrompt) { const value = window.prompt(extraPrompt.message); if (value === null) return; payload[extraPrompt.field] = value; }
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string; notificationWarning?: string; warning?: string };
      if (!response.ok) throw new Error(data.error ?? "Admin action failed");
      if (data.warning) setError(data.warning);
      else if (data.notificationWarning) setError(`Η ενέργεια ολοκληρώθηκε, αλλά το email δεν στάλθηκε: ${data.notificationWarning}`);
      publishAdminActionCompleted({ actionType: label, endpoint, occurredAt: Date.now() });
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Admin action failed"); }
    finally { setBusy(false); }
  }
  return <span className="admin-action-wrap"><button type="button" className={`button ${danger ? "admin-danger" : "button-secondary"}`} onClick={run} disabled={busy}>{busy ? "…" : label}</button>{error && <small className="form-error" role="alert">{error}</small>}</span>;
}
