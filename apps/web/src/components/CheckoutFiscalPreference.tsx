"use client";

import { useEffect, useState } from "react";

type FiscalChoice = "receipt" | "invoice";

export function CheckoutFiscalPreference() {
  const [choice, setChoice] = useState<FiscalChoice>("receipt");

  useEffect(() => {
    const stored = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("km_checkout_fiscal="))?.split("=").slice(1).join("=");
    if (stored === "invoice") setChoice("invoice");
  }, []);

  function select(next: FiscalChoice) {
    setChoice(next);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `km_checkout_fiscal=${next}; Path=/; Max-Age=86400; SameSite=Lax${secure}`;
  }

  return <section className="checkout-form" aria-labelledby="fiscal-document-title">
    <div className="checkout-section">
      <div className="eyebrow">Φορολογικό παραστατικό</div>
      <h2 id="fiscal-document-title">Απόδειξη ή τιμολόγιο;</h2>
      <div className="fulfilment-options">
        <label className={`fulfilment-option ${choice === "receipt" ? "selected" : ""}`}>
          <input type="radio" name="fiscal-document" value="receipt" checked={choice === "receipt"} onChange={() => select("receipt")} />
          <span><strong>Απόδειξη λιανικής</strong><small>Για προσωπική αγορά. Είναι η προεπιλογή.</small></span>
        </label>
        <label className={`fulfilment-option ${choice === "invoice" ? "selected" : ""}`}>
          <input type="radio" name="fiscal-document" value="invoice" checked={choice === "invoice"} onChange={() => select("invoice")} />
          <span><strong>Τιμολόγιο</strong><small>Η επιλεγμένη διεύθυνση τιμολόγησης πρέπει να έχει επωνυμία και έγκυρο ελληνικό ΑΦΜ.</small></span>
        </label>
      </div>
      {choice === "invoice" && <div className="fairness-note"><strong>Στοιχεία τιμολογίου</strong><p>Χρησιμοποιούνται τα στοιχεία της αποθηκευμένης διεύθυνσης τιμολόγησης που επιλέγεις στο checkout. Μπορείς να τα προσθέσεις ή να τα διορθώσεις από τον επεξεργαστή διεύθυνσης πριν πληρώσεις.</p></div>}
    </div>
  </section>;
}
