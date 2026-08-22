import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSavedClient } from "../../../components/AccountSavedClient";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { accountDashboard } from "../../../lib/account-view";

export const metadata: Metadata = { title: "Αποθηκευμένα", robots: { index: false, follow: false } };

export default async function AccountSavedPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/saved");
  const dashboard = await accountDashboard(principal);
  return <main className="account-app">
    <div className="announcement">Τα προϊόντα και οι αναζητήσεις που κράτησες για αργότερα.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <AccountSavedClient initialProducts={dashboard.savedProducts} searches={dashboard.savedSearches} csrfToken={dashboard.csrfToken} />
  </main>;
}
