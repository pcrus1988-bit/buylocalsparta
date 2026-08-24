"use client";

import { useState } from "react";
import type { GiftCardView } from "../lib/gift-card-service";

const euro = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

export function GiftCardWalletClient({ initial, csrfToken }: { initial: readonly GiftCardView[]; csrfToken: string }) {
  const [cards, setCards] = useState(initial);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function claim() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/gift-cards/claim", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ code }) });
      const payload = await response.json() as { card?: GiftCardView; error?: string };
      if (!response.ok || !payload.card) throw new Error(payload.error ?? "Η δωροκάρτα δεν συνδέθηκε");
      setCards((current) => [payload.card!, ...current.filter((item) => item.id !== payload.card!.id)]);
      setCode(""); setMessage("Η δωροκάρτα συνδέθηκε με τον λογαριασμό σου.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Η δωροκάρτα δεν συνδέθηκε"); }
    finally { setBusy(false); }
  }

  return <>
    <section className="workspace-tool-panel"><h2>Σύνδεσε δωροκάρτα</h2><p>Ο κωδικός ελέγχεται ιδιωτικά και δεν αποθηκεύεται αυτούσιος.</p><div className="workspace-inline-actions"><input aria-label="Κωδικός δωροκάρτας" value={code} onChange={(event) => setCode(event.target.value)} placeholder="KM-XXXXXX-XXXXXX-XXXXXX-XXXXXX" autoComplete="off" /><button className="button" type="button" disabled={busy || code.trim().length < 10} onClick={() => void claim()}>{busy ? "Έλεγχος…" : "Σύνδεση"}</button></div>{message ? <p role="status" className="workspace-inline-note">{message}</p> : null}</section>
    <div className="workspace-queue-list">{cards.map((card) => <article className="workspace-queue-card" key={card.id}><div className="workspace-queue-head"><div><strong>ΚΟΝΤΑ ΜΟΥ Gift Card · •••{card.suffix}</strong><small>{card.recipientName ?? "Συνδεδεμένη με τον λογαριασμό σου"}</small></div><span className="status-pill">{card.status}</span></div><div className="workspace-queue-primary"><span>Υπόλοιπο {euro(card.balanceMinor)}</span><span>Αρχική αξία {euro(card.initialValueMinor)}</span>{card.expiresAt ? <span>Λήξη {new Date(card.expiresAt).toLocaleDateString("el-GR")}</span> : null}</div>{card.message ? <p>{card.message}</p> : null}</article>)}</div>
  </>;
}
