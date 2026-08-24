"use client";

import { useState } from "react";

export function CartRecoveryPreferenceToggle({ initialEnabled, csrfToken }: { initialEnabled: boolean; csrfToken: string }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function update(next: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/cart-recovery-preference", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ enabled: next })
      });
      const payload = await response.json() as { enabled?: boolean; error?: string };
      if (!response.ok || typeof payload.enabled !== "boolean") throw new Error(payload.error ?? "Η ρύθμιση δεν αποθηκεύτηκε.");
      setEnabled(payload.enabled);
      setMessage(payload.enabled ? "Οι έξυπνες υπενθυμίσεις καλαθιού ενεργοποιήθηκαν." : "Οι υπενθυμίσεις καλαθιού απενεργοποιήθηκαν.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η ρύθμιση δεν αποθηκεύτηκε.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="customer-account-panel" aria-labelledby="cart-recovery-heading">
    <div className="account-card-head">
      <div><div className="eyebrow">Smart cart recovery</div><h2 id="cart-recovery-heading">Υπενθύμιση τοπικού καλαθιού</h2></div>
      <span className={`status-pill${enabled ? "" : " is-muted"}`}>{enabled ? "Ενεργή" : "Ανενεργή"}</span>
    </div>
    <p>Προαιρετικό email μόνο όταν έχεις αφήσει προϊόντα στο καλάθι για αρκετές ώρες και τουλάχιστον ένα παραμένει πραγματικά διαθέσιμο από τοπικό συνεργάτη. Δεν ενεργοποιούμε αυτόματες εκπτώσεις ούτε επαναλαμβανόμενα μηνύματα για το ίδιο καλάθι.</p>
    <label className="customer-product-alert-option">
      <input type="checkbox" checked={enabled} disabled={busy} onChange={(event) => void update(event.target.checked)} />
      <span><strong>Θέλω έξυπνες υπενθυμίσεις καλαθιού</strong><small>Μπορείς να τις απενεργοποιήσεις οποιαδήποτε στιγμή. Η αποστολή παραμένει υπό τα γενικά suppression/unsubscribe controls email.</small></span>
    </label>
    {message && <p className="customer-saved-status" role="status">{message}</p>}
  </section>;
}
