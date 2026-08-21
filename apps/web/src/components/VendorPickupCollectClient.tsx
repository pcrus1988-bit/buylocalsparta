"use client";

import Link from "next/link";
import { useState } from "react";
import { VendorActionNotice, VendorLifecycle, type VendorLifecycleStep } from "./VendorLifecycle";
import { WorkspaceHowItWorks, WorkspaceRecordDetails } from "./WorkspacePagePrimitives";

type Preview = {
  orderId: string;
  vendorName: string;
  status: "ready" | "collected" | "expired";
  readyAt: number;
  expiresAt: number;
  collectedAt?: number;
  itemCount: number;
};

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));

function lifecycle(status: Preview["status"]): readonly VendorLifecycleStep[] {
  if (status === "collected") return [
    { label: "Έτοιμη", tone: "done" },
    { label: "QR ελέγχθηκε", tone: "done" },
    { label: "Παραδόθηκε", tone: "done" }
  ];
  if (status === "expired") return [
    { label: "Έτοιμη", tone: "done" },
    { label: "QR έληξε", tone: "blocked" },
    { label: "Παραδόθηκε", tone: "future" }
  ];
  return [
    { label: "Έτοιμη", tone: "done" },
    { label: "QR ελέγχθηκε", tone: "done" },
    { label: "Παράδοση", tone: "attention" }
  ];
}

export function VendorPickupCollectClient({ initial, token, csrfToken, returnHref = "/vendor/orders", collectEndpoint = "/api/vendor/pickup/collect" }: { initial: Preview; token: string; csrfToken: string; returnHref?: string; collectEndpoint?: string }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function collect() {
    if (!window.confirm("Επιβεβαιώνεις ότι έλεγξες τα προϊόντα και τα παραδίδεις τώρα στον πελάτη;")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(collectEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ token })
      });
      const payload = await response.json() as Preview & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η παραλαβή δεν ολοκληρώθηκε");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η παραλαβή δεν ολοκληρώθηκε");
    } finally {
      setBusy(false);
    }
  }

  return <section className="shell vendor-section" style={{ maxWidth: 760 }}>
    <div className="workspace-queue-card" style={{ display: "grid", gap: 18 }}>
      <div>
        <div className="eyebrow">Παραλαβή από κατάστημα</div>
        <h1 style={{ marginBottom: 8 }}>{data.status === "collected" ? "Η παραλαβή ολοκληρώθηκε" : data.status === "expired" ? "Το QR έχει λήξει" : "Επιβεβαίωση παράδοσης"}</h1>
        <p style={{ margin: 0 }}>Κατάστημα: <strong>{data.vendorName}</strong></p>
      </div>

      <VendorLifecycle steps={lifecycle(data.status)} ariaLabel="Πορεία παραλαβής" />

      <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Προϊόντα</strong><span>{data.itemCount}</span></div>
        <div className="workspace-compact-row"><strong>Έτοιμη από</strong><span>{date(data.readyAt)}</span></div>
        <div className="workspace-compact-row"><strong>QR ισχύει έως</strong><span>{date(data.expiresAt)}</span></div>
      </div>

      {data.status === "ready" && <>
        <VendorActionNotice tone="attention" title="Χρειάζεται τελική επιβεβαίωση από εσένα">Έλεγξε ότι παραδίδεις τα σωστά προϊόντα στον πελάτη που παρουσίασε το QR.</VendorActionNotice>
        <button className="button" type="button" disabled={busy} onClick={() => void collect()}>{busy ? "Ολοκλήρωση…" : "Παράδοση στον πελάτη"}</button>
      </>}

      {data.status === "collected" && <VendorActionNotice tone="positive" title="Η παραλαβή επιβεβαιώθηκε">{data.collectedAt ? `Ολοκληρώθηκε ${date(data.collectedAt)}. ` : ""}Δεν απαιτείται άλλη ενέργεια.</VendorActionNotice>}
      {data.status === "expired" && <VendorActionNotice tone="danger" title="Το QR δεν μπορεί πλέον να χρησιμοποιηθεί">Μην ολοκληρώσεις την παράδοση χειροκίνητα. Άνοιξε την παραγγελία ή επικοινώνησε με την υποστήριξη.</VendorActionNotice>}
      {error && <p className="form-error" role="alert"><strong>Η παραγγελία δεν έκλεισε.</strong> {error}</p>}

      <WorkspaceHowItWorks>
        <p>Η επιβεβαίωση είναι το τελικό βήμα της παραλαβής. Μετά το πάτημα, η παραγγελία καταγράφεται ως παραδοθείσα και ο πελάτης ενημερώνεται.</p>
      </WorkspaceHowItWorks>
      <WorkspaceRecordDetails label="Τεχνικές λεπτομέρειες για υποστήριξη"><div className="workspace-compact-row"><strong>Order ID</strong><span className="vendor-technical-id">{data.orderId}</span></div></WorkspaceRecordDetails>
      <Link className="button button-secondary" href={returnHref}>Επιστροφή στις παραγγελίες</Link>
    </div>
  </section>;
}
