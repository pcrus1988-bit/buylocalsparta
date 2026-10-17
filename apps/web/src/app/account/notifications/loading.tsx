import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { SiteHeader } from "../../../components/SiteHeader";

export default function AccountNotificationsLoading() {
  return <main className="account-app">
    <div className="announcement">Όλες οι σημαντικές αλλαγές του λογαριασμού σου σε ένα σημείο.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className="shell customer-account-page" aria-busy="true" aria-live="polite">
      <div className="customer-page-heading"><div><div className="eyebrow">Ενημερώσεις</div><h1>Ειδοποιήσεις</h1></div></div>
      <p>Φόρτωση ειδοποιήσεων…</p>
    </section>
  </main>;
}
