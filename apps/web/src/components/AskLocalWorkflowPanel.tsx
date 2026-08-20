"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminAskLocalRequest, AdminAskLocalVendor } from "../lib/admin-ask-local";
import { AdminActionButton } from "./AdminActionButton";

function dateTime(value?: number) { return value ? new Date(value).toLocaleString("el-GR") : "—"; }

export function AskLocalWorkflowPanel({ requests, vendors, csrfToken, canManage }: {
  requests: readonly AdminAskLocalRequest[];
  vendors: readonly AdminAskLocalVendor[];
  csrfToken: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<Record<string, string>>({});

  async function assignVendor(requestId: string) {
    const vendorId = selected[requestId];
    if (!vendorId) { setError((current) => ({ ...current, [requestId]: "Choose an eligible vendor first." })); return; }
    const reason = window.prompt("Reason for assigning this Ask Local request to the selected vendor");
    if (reason === null) return;
    if (reason.trim().length < 5) { setError((current) => ({ ...current, [requestId]: "A reason of at least 5 characters is required." })); return; }
    setBusyId(requestId); setError((current) => ({ ...current, [requestId]: "" }));
    try {
      const response = await fetch("/api/admin/ask-local", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ requestId, owner: "vendor", vendorId, reason: reason.trim() })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Ask Local assignment failed");
      router.refresh();
    } catch (cause) { setError((current) => ({ ...current, [requestId]: cause instanceof Error ? cause.message : "Ask Local assignment failed" })); }
    finally { setBusyId(undefined); }
  }

  if (requests.length === 0) return <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>No open Ask Local requests.</strong><small>New requests will appear here automatically for operational triage.</small></div><span className="status-pill">Clear</span></div></article>;

  return <div className="workspace-queue-list">{requests.map((request) => {
    const overdue = Boolean(request.responseDueAt && request.responseDueAt < Date.now());
    return <article className="workspace-queue-card" key={request.id}>
      <div className="workspace-queue-head">
        <div><strong>{request.need}</strong><small>{request.id} · {request.postcode} · qty {request.quantity} · created {dateTime(request.createdAt)}</small></div>
        <span className="status-pill">{request.workflowOwnerKind === "vendor" ? "Vendor-owned" : "Admin-owned"}</span>
      </div>
      <div className="workspace-queue-primary">
        <span>Status: {request.status}</span>
        <span>Assignment: {request.assignmentReason ?? "—"}</span>
        <span>{request.assignedVendorName ? `Vendor: ${request.assignedVendorName}` : request.assignedAdminId ? `Admin: ${request.assignedAdminId}` : "Shared Admin queue"}</span>
        <span>{request.responseDueAt ? `${overdue ? "OVERDUE" : "Due"}: ${dateTime(request.responseDueAt)}` : "No vendor response deadline"}</span>
      </div>
      <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Customer</strong><span>{request.customerName}</span><small>{request.customerEmail ?? request.customerId}</small></div>
        {request.category && <div className="workspace-compact-row"><strong>Category</strong><span>{request.category}</span><small>Customer-provided context</small></div>}
      </div>
      <div className="workspace-action-bar"><span>Workflow ownership</span><div className="workspace-action-buttons">
        <Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(request.customerId)}`}>Customer 360</Link>
        {canManage && request.workflowOwnerKind !== "admin" && <AdminActionButton label="Return to Admin" endpoint="/api/admin/ask-local" csrfToken={csrfToken} body={{ requestId: request.id, owner: "admin" }} reasonPrompt="Reason for returning this Ask Local request to Admin triage" />}
        {canManage && <>
          <select aria-label={`Vendor for ${request.id}`} value={selected[request.id] ?? request.assignedVendorId ?? ""} onChange={(event) => setSelected((current) => ({ ...current, [request.id]: event.target.value }))}>
            <option value="">Choose eligible vendor…</option>
            {vendors.map((vendor) => <option value={vendor.id} key={vendor.id}>{vendor.name}</option>)}
          </select>
          <button type="button" className="button button-secondary" disabled={busyId === request.id} onClick={() => assignVendor(request.id)}>{busyId === request.id ? "…" : request.workflowOwnerKind === "vendor" ? "Reassign vendor" : "Assign vendor"}</button>
        </>}
      </div></div>
      {error[request.id] && <small className="form-error" role="alert">{error[request.id]}</small>}
    </article>;
  })}</div>;
}
