"use client";

import { useActionState } from "react";
import { createSeoDiagnosticReportAction, type SeoDiagnosticReportActionState } from "../app/admin/seo/actions";

const INITIAL_STATE: SeoDiagnosticReportActionState = { status: "idle" };

export function AdminSeoReportRunner({ csrfToken, persistenceAvailable }: { csrfToken: string; persistenceAvailable: boolean }) {
  const [state, action, pending] = useActionState(createSeoDiagnosticReportAction, INITIAL_STATE);

  return <form action={action} className="workspace-queue-card admin-json-form">
    <input type="hidden" name="csrfToken" value={csrfToken} />
    <div className="workspace-queue-head">
      <div>
        <strong>Capture the current governed SEO state</strong>
        <small>The snapshot contains only the public inventory aggregates, policy counts, runtime readiness flags and diagnostics shown in this workspace.</small>
      </div>
      <span className="status-pill">{persistenceAvailable ? "audited snapshot" : "persistence unavailable"}</span>
    </div>
    <label style={{ marginTop: 16 }}>
      <span>Reason for this report</span>
      <textarea name="reason" rows={3} minLength={10} maxLength={500} placeholder="Required operational reason (minimum 10 characters)" required />
      <small>Do not include customer data, credentials or incident secrets.</small>
    </label>
    <div className="workspace-action-bar" style={{ marginTop: 20 }}>
      <span>Reports are retained as a bounded 50-snapshot history and can be exported by authorised Admin users.</span>
      <div className="workspace-action-buttons"><button className="button" disabled={pending || !persistenceAvailable}>{pending ? "Capturing…" : "Run & save report"}</button></div>
    </div>
    {state.message ? <p className={state.status === "error" ? "form-error" : "workspace-inline-note"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}
