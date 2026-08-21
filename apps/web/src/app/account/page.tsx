import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../components/SiteHeader";
import { AccountDashboardClient } from "../../components/AccountDashboardClient";
import { accountDashboard } from "../../lib/account-view";
import { customerAccountSetup } from "../../lib/customer-account-onboarding";
import { getAccountSession } from "../../lib/account-session";

export const metadata: Metadata = { title: "Ο λογαριασμός μου", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account");
  const [dashboard, setup] = await Promise.all([accountDashboard(principal), customerAccountSetup(principal)]);
  return <main className="account-app">
    <div className="announcement">Οι αγορές και οι τοπικές υπηρεσίες σου, σε ένα σημείο.</div>
    <SiteHeader compact />
    <section className="shell page-hero account-hero dashboard-hero-refined">
      <div><div className="eyebrow">Ο λογαριασμός μου</div><h1>Ό,τι χρειάζεσαι, χωρίς περιττά βήματα.</h1><p className="lead">Παραγγελίες, αποθηκευμένα, ειδοποιήσεις και ιδιωτικότητα.</p></div>
    </section>
    <AccountDashboardClient initial={{ ...dashboard, setup }} />
  </main>;
}
