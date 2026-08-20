"use client";

import Link from "next/link";
import { useState } from "react";

type Preview = {
  orderId: string;
  vendorName: string;
  status: "ready" | "collected" | "expired";
  readyAt: number;
  expiresAt: number;
  collectedAt?: number;
  itemCount: number;
};

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function VendorPickupCollectClient({ initial, token, csrfToken, returnHref = "/vendor#orders", collectEndpoint = "/api/vendor/pickup/collect" }: { initial: Preview; token: string; csrfToken: string; returnHref?: string; collectEndpoint?: string }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function collect() {
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
        <div className="eyebrow">Secure pickup</div>
        <h1 style={{ marginBottom: 8 }}>{data.status === "collected" ? "Η παραλαβή ολοκληρώθηκε" : data.status === "expired" ? "Το QR έχει λήξει" : "Επιβεβαίωση παραλαβής"}</h1>
        <p style={{ margin: 0 }}>Κατάστημα: <strong>{data.vendorName}</strong></p>
      </div>

      <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Παραγγελία</strong><span>{data.orderId}</span></div>
        <div className="workspace-compact-row"><strong>Προϊόντα</strong><span>{data.itemCount}</span></div>
        <div className="workspace-compact-row"><strong>Έτοιμη από</strong><span>{date(data.readyAt)}</span></div>
        <div className="workspace-compact-row"><strong>Λήξη QR</strong><span>{date(data.expiresAt)}</span></div>
      </div>

      {data.status === "ready" && <>
        <div className="workspace-inline-note"><strong>Έλεγξε πρώτα ότι παραδίδεις τα σωστά προϊόντα.</strong><br />Με την επιβεβαίωση το order κλείνει ως παραληφθέν και ο πελάτης ενημερώνεται αυτόματα.</div>
        <button className="button" type="button" disabled={busy} onClick={() => void collect()}>{busy ? "Ολοκλήρωση…" : "Επιβεβαίωση παράδοσης στον πελάτη"}</button>
      </>}

      {data.status === "collected" && <div className="workspace-inline-note"><strong>Επιβεβαιωμένη παραλαβή.</strong>{data.collectedAt ? ` ${date(data.collectedAt)}.` : ""} Δεν απαιτείται άλλη ενέργεια.</div>}
      {data.status === "expired" && <div className="form-error">Το συγκεκριμένο credential έχει λήξει και δεν μπορεί να χρησιμοποιηθεί για handover. Επικοινώνησε με την υποστήριξη.</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <Link className="button button-secondary" href={returnHref}>Επιστροφή</Link>
    </div>
  </section>;
}
