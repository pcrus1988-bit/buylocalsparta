"use client";

import Link from "next/link";

export default function AccountNotificationsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="account-app">
    <section className="shell customer-account-page" role="alert">
      <div className="customer-page-heading"><div><div className="eyebrow">Ενημερώσεις</div><h1>Δεν φορτώθηκαν οι ειδοποιήσεις</h1></div></div>
      <p>Παρουσιάστηκε προσωρινό πρόβλημα κατά τη φόρτωση. Οι ειδοποιήσεις σου δεν έχουν διαγραφεί.</p>
      <div className="customer-notification-actions">
        <button type="button" className="button" onClick={() => reset()}>Δοκίμασε ξανά</button>
        <Link className="text-link" href="/account">Πίσω στον λογαριασμό</Link>
      </div>
    </section>
  </main>;
}
