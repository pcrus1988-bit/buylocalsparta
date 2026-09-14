"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function VendorDropshippingError({
  error,
  reset
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error("Dropshipping workspace render failed", {
      name: error.name,
      digest: error.digest ?? null
    });
  }, [error]);

  return <main className="vendor-app">
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Dropshipping Control Centre</div>
        <h1>Το workspace δεν φορτώθηκε πλήρως.</h1>
        <p className="lead">Τα supplier δεδομένα και οι ρυθμίσεις σου δεν άλλαξαν. Μπορείς να δοκιμάσεις ξανά χωρίς να επαναλάβεις κάποια bulk ή pricing ενέργεια.</p>
      </div>
    </section>

    <section className="shell vendor-section">
      <article className="workspace-queue-card">
        <div className="workspace-queue-head">
          <div><strong>Ασφαλής ανάκτηση</strong><small>Δεν εκτελέστηκε αυτόματα καμία destructive ή pricing ενέργεια.</small></div>
          <span className="vendor-merchant-status">Προσωρινό σφάλμα</span>
        </div>
        <p>Δοκίμασε πρώτα επαναφόρτωση του Dropshipping workspace. Αν το πρόβλημα αφορά feed ή sync, χρησιμοποίησε τη σελίδα health για να δεις την τελευταία κατάσταση supplier.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="button" type="button" onClick={reset}>Δοκιμή ξανά</button>
          <Link className="button button-secondary" href="/vendor/dropshipping/health">Feed & sync health</Link>
          <Link className="button button-secondary" href="/vendor">Vendor αρχική</Link>
        </div>
        {error.digest ? <small style={{ display: "block", marginTop: 12 }}>Reference: {error.digest}</small> : null}
      </article>
    </section>
  </main>;
}
