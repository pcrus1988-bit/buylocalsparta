"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CUSTOMER_SUPPORT_CATEGORIES, CUSTOMER_SUPPORT_PRIORITIES } from "../lib/admin-customer-support";

const categoryLabel: Record<(typeof CUSTOMER_SUPPORT_CATEGORIES)[number], string> = {
  account: "Account",
  order: "Order",
  payment: "Payment",
  return: "Return / refund",
  delivery: "Delivery",
  privacy: "Privacy",
  technical: "Technical",
  other: "Other"
};

const priorityLabel: Record<(typeof CUSTOMER_SUPPORT_PRIORITIES)[number], string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent"
};

export function CustomerSupportCaseForm({ customerId, csrfToken }: { customerId: string; csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/customers/cases", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          action: "create",
          customerId,
          subject: String(data.get("subject") ?? ""),
          category: String(data.get("category") ?? "other"),
          priority: String(data.get("priority") ?? "normal"),
          note: String(data.get("note") ?? ""),
          followUpAt: String(data.get("followUpAt") ?? "") || undefined
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Support case creation failed");
      form.reset();
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Support case creation failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button type="button" className="button button-secondary" onClick={() => setOpen(true)}>New support case</button>;

  return <form onSubmit={submit} className="workspace-tool-panel" style={{ display: "grid", gap: 12, padding: 16, marginTop: 12 }}>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) minmax(150px,220px) minmax(130px,180px)", gap: 12 }}>
      <label><span>Subject</span><input name="subject" required minLength={3} maxLength={240} placeholder="What needs attention?" /></label>
      <label><span>Category</span><select name="category" defaultValue="account">{CUSTOMER_SUPPORT_CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabel[item]}</option>)}</select></label>
      <label><span>Priority</span><select name="priority" defaultValue="normal">{CUSTOMER_SUPPORT_PRIORITIES.map((item) => <option key={item} value={item}>{priorityLabel[item]}</option>)}</select></label>
    </div>
    <label><span>Initial note</span><textarea name="note" required minLength={3} maxLength={4000} rows={4} placeholder="Record the customer request, what was checked and the next step." /></label>
    <label><span>Follow-up (optional)</span><input name="followUpAt" type="datetime-local" /></label>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><button className="button" type="submit" disabled={busy}>{busy ? "Saving…" : "Create case"}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>Cancel</button>{error && <small className="form-error" role="alert">{error}</small>}</div>
  </form>;
}
