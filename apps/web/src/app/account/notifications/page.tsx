import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNotificationsClient } from "../../../components/AccountNotificationsClient";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { accountDashboard } from "../../../lib/account-view";

export const metadata: Metadata = { title: "Ειδοποιήσεις", robots: { index: false, follow: false } };

export default async function AccountNotificationsPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/notifications");
  const dashboard = await accountDashboard(principal);
  return <main className="account-app">
    <div className="announcement">Όλες οι σημαντικές αλλαγές του λογαριασμού σου σε ένα σημείο.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <AccountNotificationsClient initial={dashboard.notifications} csrfToken={dashboard.csrfToken} />
  </main>;
}
