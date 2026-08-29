"use client";

import { useState } from "react";
import type { GiftCardIssueResult, GiftCardView } from "../lib/gift-card-service";

const euro = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

export function AdminGiftCardsClient({ initial, csrfToken, liveEnabled }: { initial: readonly GiftCardView[]; csrfToken: string; liveEnabled: boolean }) {
  const [cards, setCards] = useState(initial);
  const [issued, setIssued] = useState<GiftCardIssueResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function issue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setIssued(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/gift-cards", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ valueMinor: Math.round(Number(form.get("valueEuro")) * 100), recipientName: form.get("recipientName"), recipientEmail: form.get("recipientEmail"), message: form.get("message") }) });
      const payload = await response.json() as { result?: GiftCardIssueResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Gift card issuance failed");
      setIssued(payload.result); setCards((current) => [payload.result!.card, ...current]); event.currentTarget.reset();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gift card issuance failed"); }
    finally { setBusy(false); }
  }

  return <>
    <form className="workspace-tool-panel" onSubmit={issue}><h2>Έκδοση ελεγχόμενης δωροκάρτας</h2><p>Η έκδοση είναι Admin-only. Ο κωδικός εμφανίζεται μία φορά και το σύστημα αποθηκεύει μόνο keyed hash.</p><div className="admin-assignment-row"><input name="valueEuro" type="number" min="5" max="2000" step="1" required placeholder="Αξία €" /><input name="recipientName" maxLength={160} placeholder="Όνομα παραλήπτη" /><input name="recipientEmail" type="email" placeholder="Email παραλήπτη" /></div><textarea name="message" maxLength={500} placeholder="Προαιρετικό μήνυμα" /><button className="button" disabled={busy} type="submit">{busy ? "Έκδοση…" : "Έκδοση δωροκάρτας"}</button>{error ? <p className="form-error" role="alert">{error}</p> : null}</form>
    {issued ? <section className="workspace-tool-panel"><h2>Αποθήκευσε τώρα τον κωδικό</h2><p><strong>{issued.code}</strong></p><p className="workspace-inline-note">Δεν μπορεί να ανακτηθεί αργότερα από τη βάση. Εμφανίζεται μόνο σε αυτή την απάντηση έκδοσης.</p></section> : null}
    {!liveEnabled ? <div className="workspace-inline-note"><strong>Public purchase disabled.</strong> Η δημόσια πώληση νέων δωροκαρτών παραμένει gated. Οι ενεργές δωροκάρτες που εκδίδονται εδώ μπορούν ήδη να συνδεθούν με λογαριασμό πελάτη και να εξαργυρωθούν στο checkout.</div> : null}
    <div className="workspace-queue-list">{cards.map((card) => <article className="workspace-queue-card" key={card.id}><div className="workspace-queue-head"><div><strong>•••{card.suffix} · {euro(card.balanceMinor)}</strong><small>Issued {new Date(card.issuedAt).toLocaleString("el-GR")}</small></div><span className="status-pill">{card.status}</span></div><div className="workspace-queue-primary"><span>Initial {euro(card.initialValueMinor)}</span><span>{card.recipientName ?? "No recipient name"}</span></div></article>)}</div>
  </>;
}