"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminCustomerEmailMessage } from "../lib/admin-customer-email";
import { AdminActionButton } from "./AdminActionButton";

function dateTime(value?: number) { return value ? new Date(value).toLocaleString("el-GR") : "—"; }
function statusLabel(status: AdminCustomerEmailMessage["status"]) {
  return ({ draft: "Draft", approved: "Approved wording", sending: "Sending", sent: "Sent", cancelled: "Cancelled" } as const)[status];
}

export function CustomerEmailApprovalPanel({ customerId, customerEmail, csrfToken, messages }: {
  customerId: string;
  customerEmail: string;
  csrfToken: string;
  messages: readonly AdminCustomerEmailMessage[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string>();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startEdit(message: AdminCustomerEmailMessage) {
    setEditingId(message.id);
    setSubject(message.subject);
    setBody(message.body);
    setError("");
    window.scrollTo({ top: document.documentElement.scrollTop, behavior: "smooth" });
  }

  function clearDraft() {
    setEditingId(undefined);
    setSubject("");
    setBody("");
    setError("");
  }

  async function saveDraft() {
    const reason = window.prompt(editingId ? "Reason for revising this wording" : "Reason for preparing this customer notification");
    if (reason === null) return;
    if (reason.trim().length < 5) { setError("Απαιτείται αιτιολογία τουλάχιστον 5 χαρακτήρων."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/customers/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: "save", customerId, messageId: editingId, subject, body, reason: reason.trim() })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save customer email draft");
      clearDraft();
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save customer email draft"); }
    finally { setBusy(false); }
  }

  return <div className="workspace-queue-list">
    <article className="workspace-queue-card">
      <div className="workspace-queue-head">
        <div><strong>Admin-approved customer email</strong><small>{customerEmail}</small></div>
        <span className="status-pill">Manual only</span>
      </div>
      <div className="workspace-inline-note"><strong>Nothing is sent automatically.</strong> Save the wording as a draft, approve that exact revision, then use the separate “Send approved email” action. Editing approved wording immediately invalidates the approval.</div>
      <div className="form-grid" style={{ marginTop: 16 }}>
        <label className="field"><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={240} placeholder="Email subject" /></label>
        <label className="field field-span"><span>Message wording</span><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={8} maxLength={20000} placeholder="Write the exact customer-facing wording for Admin approval." /></label>
      </div>
      <div className="workspace-action-bar"><span>{editingId ? `Editing ${editingId}` : "New draft"}</span><div className="workspace-action-buttons">
        <button type="button" className="button button-secondary" onClick={saveDraft} disabled={busy}>{busy ? "…" : editingId ? "Save revised wording" : "Save draft"}</button>
        {editingId && <button type="button" className="button button-secondary" onClick={clearDraft} disabled={busy}>Cancel edit</button>}
      </div></div>
      {error && <small className="form-error" role="alert">{error}</small>}
    </article>

    {messages.length === 0 ? <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>No customer email drafts yet</strong><small>Create wording above only when a customer notification is operationally needed.</small></div></div></article> : messages.map((message) => <article className="workspace-queue-card" key={message.id}>
      <div className="workspace-queue-head"><div><strong>{message.subject}</strong><small>{message.id} · revision {message.revision} · created {dateTime(message.createdAt)}</small></div><span className="status-pill">{statusLabel(message.status)}</span></div>
      <p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p>
      <div className="workspace-queue-primary">
        <span>Drafted by {message.draftedBy}</span>
        <span>{message.approvedBy ? `Approved by ${message.approvedBy} · ${dateTime(message.approvedAt)}` : "Not approved"}</span>
        <span>{message.sentBy ? `Sent by ${message.sentBy} · ${dateTime(message.sentAt)}` : "Not sent"}</span>
      </div>
      {message.providerMessageId && <small>Provider message: {message.providerMessageId}</small>}
      {message.lastDeliveryStatus === "failed" && <div className="workspace-inline-note">Previous delivery attempt failed. The message returned to Approved status and can be sent again explicitly after the delivery issue is resolved.</div>}
      {message.status !== "sent" && message.status !== "sending" && message.status !== "cancelled" && <div className="workspace-action-bar"><span>Controlled workflow</span><div className="workspace-action-buttons">
        <button type="button" className="button button-secondary" onClick={() => startEdit(message)}>Edit wording</button>
        {message.status === "draft" && <AdminActionButton label="Approve wording" endpoint="/api/admin/customers/email" csrfToken={csrfToken} body={{ action: "approve", customerId, messageId: message.id }} reasonPrompt="Reason for approving this exact customer-facing wording" />}
        {message.status === "approved" && <AdminActionButton label="Send approved email" endpoint="/api/admin/customers/email" csrfToken={csrfToken} body={{ action: "send", customerId, messageId: message.id }} reasonPrompt="Reason this approved customer notification should be sent now" />}
        <AdminActionButton label="Cancel message" endpoint="/api/admin/customers/email" csrfToken={csrfToken} body={{ action: "cancel", customerId, messageId: message.id }} reasonPrompt="Reason for cancelling this customer notification" danger />
      </div></div>}
    </article>)}
  </div>;
}
