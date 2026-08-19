"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CustomerProfileEditForm({ customer, csrfToken }: {
  customer: { id: string; firstName?: string; lastName?: string; phone?: string; preferredLocale: string };
  csrfToken: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/customers/profile", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          customerId: customer.id,
          firstName: String(data.get("firstName") ?? ""),
          lastName: String(data.get("lastName") ?? ""),
          phone: String(data.get("phone") ?? ""),
          preferredLocale: String(data.get("preferredLocale") ?? "el"),
          reason: String(data.get("reason") ?? "")
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Customer profile update failed");
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Customer profile update failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button className="button button-secondary" type="button" onClick={() => setOpen(true)}>Edit customer profile</button>;

  return <form onSubmit={submit} className="workspace-tool-panel" style={{ display:"grid", gap:12, padding:16, marginTop:12 }}>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(180px,1fr))", gap:12 }}>
      <label><span>First name</span><input name="firstName" defaultValue={customer.firstName ?? ""} maxLength={100} /></label>
      <label><span>Last name</span><input name="lastName" defaultValue={customer.lastName ?? ""} maxLength={100} /></label>
      <label><span>Phone</span><input name="phone" defaultValue={customer.phone ?? ""} maxLength={30} placeholder="+30 ..." /></label>
      <label><span>Language</span><select name="preferredLocale" defaultValue={customer.preferredLocale === "en" ? "en" : "el"}><option value="el">Greek (el)</option><option value="en">English (en)</option></select></label>
    </div>
    <label><span>Reason for correction</span><textarea name="reason" required minLength={5} maxLength={500} rows={3} placeholder="Why is this profile being changed?" /></label>
    <div className="workspace-action-buttons"><button className="button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save corrections"}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>Cancel</button></div>
    {error && <small className="form-error" role="alert">{error}</small>}
    <small>Email is intentionally not editable here. Email changes require a separate re-verification workflow.</small>
  </form>;
}
