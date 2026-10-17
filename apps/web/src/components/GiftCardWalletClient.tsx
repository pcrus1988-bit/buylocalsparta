"use client";

import { useState, type FormEvent } from "react";
import type { GiftCardView } from "../lib/gift-card-service";

const euro = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

export function GiftCardWalletClient({ initial, csrfToken }: { initial: readonly GiftCardView[]; csrfToken: string }) {
  const [cards, setCards] = useState(initial);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  async function claim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || code.trim().length < 10) return;
    setBusy(true);
    setMessage("");
    setMessageIsError(false);
    try {
      const response = await fetch("/api/account/gift-cards/claim", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ code: code.trim() })
      });
      const payload = await response.json() as { card?: GiftCardView; error?: string };
      if (!response.ok || !payload.card) throw new Error(payload.error ?? "Η δωροκάρτα δεν συνδέθηκε.");
      const claimed = payload.card;
      setCards((current) => [claimed, ...current.filter((item) => item.id !== claimed.id)]);
      setCode("");
      setMessage("Η δωροκάρτα συνδέθηκε με τον λογαριασμό σου.");
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "Η δωροκάρτα δεν συνδέθηκε.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="account-gift-wallet">
    <section className="account-gift-claim" aria-labelledby="gift-card-claim-title">
      <div className="eyebrow">Προσθήκη κάρτας</div>
      <h2 id="gift-card-claim-title">Έχεις κωδικό δωροκάρτας;</h2>
      <p>Πληκτρολόγησέ τον εδώ για να εμφανίζεται στον λογαριασμό σου. Ο πλήρης κωδικός δεν αποθηκεύεται.</p>
      <form onSubmit={(event) => void claim(event)}>
        <input aria-label="Κωδικός δωροκάρτας" value={code} onChange={(event) => setCode(event.target.value)} placeholder="KM-XXXXXX-XXXXXX-XXXXXX-XXXXXX" autoComplete="off" required minLength={10} />
        <button className="button" type="submit" disabled={busy || code.trim().length < 10}>{busy ? "Γίνεται σύνδεση…" : "Σύνδεση δωροκάρτας"}</button>
      </form>
      {message && <p role={messageIsError ? "alert" : "status"} className="account-gift-status">{message}</p>}
    </section>
    <section aria-labelledby="gift-card-my-cards-title">
      <div className="customer-page-heading">
        <div><div className="eyebrow">Το πορτοφόλι μου</div><h2 id="gift-card-my-cards-title">Οι κάρτες μου</h2></div>
        <p>{cards.length === 0 ? "Σύνδεσε την πρώτη σου κάρτα για να εμφανιστεί εδώ." : `${cards.length} ${cards.length === 1 ? "δωροκάρτα" : "δωροκάρτες"} στον λογαριασμό σου`}</p>
      </div>
      {cards.length ? <div className="account-gift-list">
        {cards.map((card) => <article className="account-gift-card" key={card.id}>
          <div className="workspace-queue-head">
            <div><h3>ΚΟΝΤΑ ΜΟΥ Gift Card · •••{card.suffix}</h3><small>{card.recipientName ?? "Συνδεδεμένη με τον λογαριασμό σου"}</small></div>
            <span className="status-pill">{card.status}</span>
          </div>
          <span className="account-gift-balance">{euro(card.balanceMinor)}</span>
          <div className="account-gift-meta"><span>Αρχική αξία {euro(card.initialValueMinor)}</span>{card.expiresAt && <span>Λήξη {new Date(card.expiresAt).toLocaleDateString("el-GR")}</span>}</div>
          {card.message && <p>{card.message}</p>}
        </article>)}
      </div> : <div className="account-empty"><h2>Δεν υπάρχουν συνδεδεμένες δωροκάρτες.</h2><p>Εισήγαγε έναν κωδικό παραπάνω για να προσθέσεις τη δική σου.</p></div>}
    </section>
  </div>;
}
