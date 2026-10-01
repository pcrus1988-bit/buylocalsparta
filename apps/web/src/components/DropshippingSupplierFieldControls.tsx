"use client";

import { useState } from "react";
import type { DropshipPublicFields } from "../lib/dropship-presentation-policy";

const fallback: DropshipPublicFields = { model: true, mpn: true, gtin: true, technicalAttributes: true, supplierSku: false };

type Props = Readonly<{ supplierCode: string }>;

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/vendor/auth-context", { cache: "no-store" });
  if (!response.ok) throw new Error("Η συνεδρία συνεργάτη έληξε.");
  const payload = await response.json() as { csrfToken?: string };
  if (!payload.csrfToken) throw new Error("Δεν βρέθηκε ασφαλές στοιχείο συνεδρίας.");
  return payload.csrfToken;
}

export function DropshippingSupplierFieldControls({ supplierCode }: Props) {
  const [value, setValue] = useState<DropshipPublicFields>(fallback);
  const [loaded, setLoaded] = useState(false);
  const [original, setOriginal] = useState<DropshipPublicFields>(fallback);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = loaded && JSON.stringify(value) !== JSON.stringify(original);

  async function load() {
    if (loaded || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/vendor/dropshipping/presentation?supplierCode=${encodeURIComponent(supplierCode)}`, { cache: "no-store" });
      const payload = await response.json() as { error?: string; fields?: DropshipPublicFields };
      if (!response.ok || !payload.fields) throw new Error(payload.error ?? "Η φόρτωση των δημόσιων στοιχείων απέτυχε.");
      setValue(payload.fields);
      setOriginal(payload.fields);
      setLoaded(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η φόρτωση απέτυχε.");
    } finally { setBusy(false); }
  }

  function setField(key: keyof DropshipPublicFields, checked: boolean) {
    setValue((current) => ({ ...current, [key]: checked }));
  }

  async function save() {
    setBusy(true); setMessage("");
    try {
      const token = await csrfToken();
      const response = await fetch("/api/vendor/dropshipping/presentation", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ action: "save-supplier", supplierCode, fields: value })
      });
      const payload = await response.json() as { error?: string; fields?: DropshipPublicFields };
      if (!response.ok) throw new Error(payload.error ?? "Η αποθήκευση των δημόσιων στοιχείων απέτυχε.");
      const saved = payload.fields ?? value;
      setValue(saved);
      setOriginal(saved);
      setMessage("Αποθηκεύτηκαν οι γενικές ρυθμίσεις δημόσιων στοιχείων του προμηθευτή.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η αποθήκευση απέτυχε.");
    } finally { setBusy(false); }
  }

  return <details style={{ marginTop: 12 }} onToggle={(event) => { if (event.currentTarget.open) void load(); }}>
    <summary style={{ cursor: "pointer", fontWeight: 800 }}>Δημόσια τεχνικά στοιχεία</summary>
    {!loaded ? <small style={{ display: "block", marginTop: 10 }}>{busy ? "Φόρτωση…" : "Άνοιξε για να φορτωθούν οι ρυθμίσεις δημόσιων στοιχείων."}</small> : <>
      <p style={{ marginTop: 10 }}>Επίλεξε ποια τεχνικά στοιχεία εμφανίζονται δημόσια στα προϊόντα αυτού του προμηθευτή. Ο κωδικός SKU του προμηθευτή είναι κρυφός από προεπιλογή.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 10 }}>
        <label><input type="checkbox" checked={value.model} onChange={(event) => setField("model", event.target.checked)} /> Μοντέλο</label>
        <label><input type="checkbox" checked={value.mpn} onChange={(event) => setField("mpn", event.target.checked)} /> Κωδικός κατασκευαστή / MPN</label>
        <label><input type="checkbox" checked={value.gtin} onChange={(event) => setField("gtin", event.target.checked)} /> GTIN / EAN</label>
        <label><input type="checkbox" checked={value.technicalAttributes} onChange={(event) => setField("technicalAttributes", event.target.checked)} /> Τεχνικά χαρακτηριστικά</label>
        <label><input type="checkbox" checked={value.supplierSku} onChange={(event) => setField("supplierSku", event.target.checked)} /> Κωδικός SKU προμηθευτή</label>
      </div>
      <div style={{ marginTop: 12 }}><button className="button button-secondary" type="button" disabled={busy || !dirty} onClick={save}>Αποθήκευση δημόσιων στοιχείων</button></div>
    </>}
    {message ? <small role="status" style={{ display: "block", marginTop: 8 }}>{message}</small> : null}
  </details>;
}
