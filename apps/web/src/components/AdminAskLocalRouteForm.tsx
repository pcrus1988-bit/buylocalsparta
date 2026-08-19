"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AskLocalVendorCandidate } from "../lib/ask-local-service";
import { categoryCodeMatches, STOREFRONT_CATEGORIES } from "../lib/storefront-taxonomy";

export function AdminAskLocalRouteForm({ requestId, csrfToken, vendors, initialCategory }: { requestId: string; csrfToken: string; vendors: readonly AskLocalVendorCandidate[]; initialCategory?: string }) {
  const router = useRouter();
  const [category, setCategory] = useState(initialCategory ?? "");
  const [vendorId, setVendorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eligible = useMemo(() => category ? vendors.filter((vendor) => vendor.categoryCodes.some((code) => categoryCodeMatches(code, category))) : [], [category, vendors]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category || !vendorId) return;
    setBusy(true); setError("");
    const reason = window.prompt("Σύντομη αιτιολογία ανάθεσης", "admin_review_eligible_vendor") ?? "";
    if (!reason.trim()) { setBusy(false); return; }
    try {
      const response = await fetch("/api/admin/ask-local/route", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ requestId, vendorId, category, reason }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η ανάθεση απέτυχε");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ανάθεση απέτυχε");
    } finally { setBusy(false); }
  }

  return <form className="workspace-action-buttons" onSubmit={submit}>
    <select aria-label="Κατηγορία αιτήματος" value={category} required onChange={(event) => { setCategory(event.target.value); setVendorId(""); }}>
      <option value="">Ταξινόμησε κατηγορία…</option>
      {STOREFRONT_CATEGORIES.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}
    </select>
    <select aria-label="Επιλέξιμος vendor" value={vendorId} required disabled={!category || !eligible.length} onChange={(event) => setVendorId(event.target.value)}>
      <option value="">{category && !eligible.length ? "Κανένας ενεργός κατάλληλος vendor" : "Επίλεξε vendor / σύμβουλο…"}</option>
      {eligible.map((vendor) => <option value={vendor.id} key={vendor.id}>{vendor.adviser} · {vendor.name}</option>)}
    </select>
    <button className="button" type="submit" disabled={busy || !category || !vendorId}>{busy ? "Ανάθεση…" : "Ανάθεση στον vendor"}</button>
    {error && <small className="form-error" role="alert">{error}</small>}
  </form>;
}
