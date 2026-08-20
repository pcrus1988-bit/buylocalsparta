"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
  const [selectedId, setSelectedId] = useState(requests[0]?.id ?? "");
  const [vendorSelection, setVendorSelection] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState<"all" | "admin" | "vendor">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("el-GR");
    return requests.filter((request) => (owner === "all" || request.workflowOwnerKind === owner) && (!q || [request.referenceNumber, request.need, request.customerName, request.customerEmail, request.assignedVendorName, request.category, request.postcode].some((value) => String(value ?? "").toLocaleLowerCase("el-GR").includes(q))));
  }, [owner, query, requests]);
  const selected = filtered.find((request) => request.id === selectedId) ?? filtered[0];

  async function assignVendor(requestId: string) {
    const request = requests.find((item) => item.id === requestId);
    const vendorId = vendorSelection[requestId] ?? request?.assignedVendorId;
    if (!vendorId) { setError((current) => ({ ...current, [requestId]: "Choose an eligible vendor first." })); return; }
    const reason = window.prompt("Reason for assigning this Ask Local request to the selected vendor");
    if (reason === null) return;
    if (reason.trim().length < 5) { setError((current) => ({ ...current, [requestId]: "A reason of at least 5 characters is required." })); return; }
    setBusyId(requestId); setError((current) => ({ ...current, [requestId]: "" }));
    try {
      const response = await fetch("/api/admin/ask-local", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ requestId, owner: "vendor", vendorId, reason: reason.trim() }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Ask Local assignment failed");
      router.refresh();
    } catch (cause) { setError((current) => ({ ...current, [requestId]: cause instanceof Error ? cause.message : "Ask Local assignment failed" })); }
    finally { setBusyId(undefined); }
  }

  if (requests.length === 0) return <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>No open Ask Local requests.</strong><small>New requests will appear here automatically for operational triage.</small></div><span className="status-pill">Clear</span></div></article>;

  return <>
    <div className="admin-queue-toolbar"><label><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ASK-…, customer, need, vendor" /></label><label><span>Owner</span><select value={owner} onChange={(event) => setOwner(event.target.value as typeof owner)}><option value="all">All owners</option><option value="admin">Admin</option><option value="vendor">Vendor</option></select></label><small>{filtered.length} / {requests.length}</small></div>
    {filtered.length === 0 ? <div className="workspace-inline-note">No Ask Local requests match the current filters.</div> : <div className="admin-work-queue-split">
      <div className="admin-work-list" aria-label="Ask Local queue">{filtered.map((request) => {
        const overdue = Boolean(request.responseDueAt && request.responseDueAt < Date.now());
        return <button type="button" className={`admin-work-list-row${selected?.id === request.id ? " is-selected" : ""}${overdue ? " is-overdue" : ""}`} key={request.id} onClick={() => setSelectedId(request.id)}><span><strong>{request.need}</strong><small>{request.referenceNumber} · {request.customerName}</small></span><span><b>{request.workflowOwnerKind === "vendor" ? request.assignedVendorName ?? "Vendor" : "Admin"}</b><small>{overdue ? "OVERDUE" : request.responseDueAt ? `Due ${dateTime(request.responseDueAt)}` : request.status}</small></span></button>;
      })}</div>
      {selected && <article className="admin-work-detail"><div className="admin-work-detail-head"><div><span>Ask Local</span><h2>{selected.need}</h2><p>{selected.referenceNumber} · created {dateTime(selected.createdAt)}</p></div><span className="status-pill">{selected.workflowOwnerKind === "vendor" ? "Vendor-owned" : "Admin-owned"}</span></div><div className="admin-decision-summary"><div><span>Status</span><strong>{selected.status}</strong></div><div><span>Owner</span><strong>{selected.assignedVendorName ?? selected.assignedAdminId ?? "Admin queue"}</strong></div><div><span>Deadline</span><strong>{selected.responseDueAt ? dateTime(selected.responseDueAt) : "—"}</strong></div></div><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Customer</strong><span>{selected.customerName}</span><small>{selected.customerEmail ?? selected.customerId}</small></div><div className="workspace-compact-row"><strong>Request</strong><span>qty {selected.quantity} · {selected.postcode}</span><small>{selected.category ?? "No category context"}</small></div><div className="workspace-compact-row"><strong>Assignment reason</strong><span>{selected.assignmentReason ?? "—"}</span></div></div><div className="workspace-action-bar"><span>Workflow ownership</span><div className="workspace-action-buttons"><Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(selected.customerId)}`}>Customer 360</Link>{canManage && selected.workflowOwnerKind !== "admin" && <AdminActionButton label="Return to Admin" endpoint="/api/admin/ask-local" csrfToken={csrfToken} body={{ requestId: selected.id, owner: "admin" }} reasonPrompt="Reason for returning this Ask Local request to Admin triage" />}</div></div>{canManage && <div className="admin-assignment-row"><select aria-label={`Vendor for ${selected.referenceNumber}`} value={vendorSelection[selected.id] ?? selected.assignedVendorId ?? ""} onChange={(event) => setVendorSelection((current) => ({ ...current, [selected.id]: event.target.value }))}><option value="">Choose eligible vendor…</option>{vendors.map((vendor) => <option value={vendor.id} key={vendor.id}>{vendor.name}</option>)}</select><button type="button" className="button button-secondary" disabled={busyId === selected.id} onClick={() => assignVendor(selected.id)}>{busyId === selected.id ? "…" : selected.workflowOwnerKind === "vendor" ? "Reassign vendor" : "Assign vendor"}</button></div>}{error[selected.id] && <small className="form-error" role="alert">{error[selected.id]}</small>}</article>}
    </div>}
  </>;
}
