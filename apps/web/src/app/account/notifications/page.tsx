import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNotificationsClient } from "../../../components/AccountNotificationsClient";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { CartRecoveryPreferenceToggle } from "../../../components/CartRecoveryPreferenceToggle";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { accountDashboard } from "../../../lib/account-view";
import { customerCartRecoveryPreference } from "../../../lib/customer-cart-recovery-preference";

export const metadata: Metadata = { title: "Ειδοποιήσεις", robots: { index: false, follow: false } };

export default async function AccountNotificationsPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/notifications");
  const [dashboard, cartRecoveryEnabled] = await Promise.all([
    accountDashboard(principal),
    customerCartRecoveryPreference(principal).catch(() => false)
  ]);
  return <main className="account-app">
    <div className="announcement">Όλες οι σημαντικές αλλαγές του λογαριασμού σου σε ένα σημείο.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className="shell customer-account-page" style={{paddingBottom:0}}>
      <CartRecoveryPreferenceToggle initialEnabled={cartRecoveryEnabled} csrfToken={dashboard.csrfToken} />
    </section>
    <AccountNotificationsClient initial={dashboard.notifications} csrfToken={dashboard.csrfToken} />
  </main>;
}