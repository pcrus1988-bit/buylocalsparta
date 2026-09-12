"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DropshipPublicFields } from "../lib/dropship-presentation-policy";

type Props = Readonly<{ supplierCode: string; fields: DropshipPublicFields }>;

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/vendor/auth-context", { cache: "no-store" });
  if (!response.ok) throw new Error("Η συνεδρία συνεργάτη έληξε.");
  const payload = await response.json() as { csrfToken?: string };
  if (!payload.csrfToken) throw new Error("Δεν βρέθηκε ασφαλές token συνεδρίας.");
  return payload.csrfToken;
}

export function DropshippingSupplierFieldControls({ supplierCode, fields }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(fields);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(value) !== JSON.stringify(fields);

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
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η αποθήκευση public fields απέτυχε.");
      setMessage("Αποθηκεύτηκαν τα supplier public field defaults.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η αποθήκευση απέτυχε.");
    } finally { setBusy(false); }
  }

  return <details className="workspace-queue-card" style={{ marginBottom: 14 }}>
    <summary style={{ cursor: "pointer", fontWeight: 800 }}>Public fields · supplier defaults</summary>
    <p style={{ marginTop: 10 }}>Ελέγχει ποια τεχνικά στοιχεία εμφανίζονται δημόσια για τα προϊόντα αυτού του supplier. Title, brand, category, εικόνα και description παραμένουν product identity fields. Το Supplier SKU είναι hidden by default.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 10 }}>
      <label><input type="checkbox" checked={value.model} onChange={(event) => setField("model", event.target.checked)} /> Μοντέλο</label>
      <label><input type="checkbox" checked={value.mpn} onChange={(event) => setField("mpn", event.target.checked)} /> Manufacturer code / MPN</label>
      <label><input type="checkbox" checked={value.gtin} onChange={(event) => setField("gtin", event.target.checked)} /> GTIN / EAN</label>
      <label><input type="checkbox" checked={value.technicalAttributes} onChange={(event) => setField("technicalAttributes", event.target.checked)} /> Τεχνικά χαρακτηριστικά</label>
      <label><input type="checkbox" checked={value.supplierSku} onChange={(event) => setField("supplierSku", event.target.checked)} /> Supplier SKU</label>
    </div>
    <div style={{ marginTop: 12 }}><button className="button button-secondary" type="button" disabled={busy || !dirty} onClick={save}>Αποθήκευση public fields</button></div>
    <small style={{ display: "block", marginTop: 8 }}>Οι αλλαγές εφαρμόζονται δυναμικά στο storefront για προϊόντα χωρίς per-product field override. Δεν αλλάζουν pricing, availability ή supplier integration.</small>
    {message ? <small role="status" style={{ display: "block", marginTop: 8 }}>{message}</small> : null}
  </details>;
}
