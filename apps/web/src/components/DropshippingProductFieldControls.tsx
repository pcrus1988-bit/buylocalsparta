"use client";

import { useState } from "react";
import type { DropshipPublicFields } from "../lib/dropship-presentation-policy";

const fallback: DropshipPublicFields = { model: true, mpn: true, gtin: true, technicalAttributes: true, supplierSku: false };

type Props = Readonly<{ offerId: string }>;

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/vendor/auth-context", { cache: "no-store" });
  if (!response.ok) throw new Error("Η συνεδρία συνεργάτη έληξε.");
  const payload = await response.json() as { csrfToken?: string };
  if (!payload.csrfToken) throw new Error("Δεν βρέθηκε ασφαλές token συνεδρίας.");
  return payload.csrfToken;
}

export function DropshippingProductFieldControls({ offerId }: Props) {
  const [value, setValue] = useState<DropshipPublicFields>(fallback);
  const [loaded, setLoaded] = useState(false);
  const [overridden, setOverridden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load(force = false) {
    if ((!force && loaded) || (busy && !force)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/vendor/dropshipping/presentation?offerId=${encodeURIComponent(offerId)}`, { cache: "no-store" });
      const payload = await response.json() as { error?: string; fields?: DropshipPublicFields; overridden?: boolean };
      if (!response.ok || !payload.fields) throw new Error(payload.error ?? "Η φόρτωση public fields απέτυχε.");
      setValue(payload.fields);
      setOverridden(Boolean(payload.overridden));
      setLoaded(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η φόρτωση απέτυχε.");
    } finally { setBusy(false); }
  }

  function setField(key: keyof DropshipPublicFields, checked: boolean) {
    setValue((current) => ({ ...current, [key]: checked }));
  }

  async function mutate(action: "save-product" | "reset-product") {
    setBusy(true); setMessage("");
    try {
      const token = await csrfToken();
      const response = await fetch("/api/vendor/dropshipping/presentation", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify(action === "save-product" ? { action, offerId, fields: value } : { action, offerId })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η αλλαγή public fields απέτυχε.");
      setMessage(action === "save-product" ? "Αποθηκεύτηκε product override." : "Το προϊόν χρησιμοποιεί ξανά τα supplier defaults.");
      setOverridden(action === "save-product");
      if (action === "reset-product") {
        setLoaded(false);
        await load(true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η αλλαγή απέτυχε.");
    } finally { setBusy(false); }
  }

  return <details style={{ marginTop: 10 }} onToggle={(event) => { if (event.currentTarget.open) void load(); }}>
    <summary style={{ cursor: "pointer", fontWeight: 700 }}>Public fields{loaded ? (overridden ? " · override" : " · supplier defaults") : ""}</summary>
    {!loaded ? <small style={{ display: "block", marginTop: 10 }}>{busy ? "Φόρτωση…" : "Άνοιξε για να φορτωθούν οι public field ρυθμίσεις."}</small> : <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(120px,1fr))", gap: 8, marginTop: 10 }}>
        <label><input type="checkbox" checked={value.model} onChange={(event) => setField("model", event.target.checked)} /> Model</label>
        <label><input type="checkbox" checked={value.mpn} onChange={(event) => setField("mpn", event.target.checked)} /> MPN</label>
        <label><input type="checkbox" checked={value.gtin} onChange={(event) => setField("gtin", event.target.checked)} /> GTIN/EAN</label>
        <label><input type="checkbox" checked={value.technicalAttributes} onChange={(event) => setField("technicalAttributes", event.target.checked)} /> Technical</label>
        <label><input type="checkbox" checked={value.supplierSku} onChange={(event) => setField("supplierSku", event.target.checked)} /> Supplier SKU</label>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => mutate("save-product")}>Save override</button>
        <button className="button button-secondary" type="button" disabled={busy || !overridden} onClick={() => mutate("reset-product")}>Use supplier defaults</button>
      </div>
    </>}
    {message ? <small role="status" style={{ display: "block", marginTop: 8 }}>{message}</small> : null}
  </details>;
}
