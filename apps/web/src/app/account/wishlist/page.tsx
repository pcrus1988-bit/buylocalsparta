import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSavedClient } from "../../../components/AccountSavedClient";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { accountDashboard } from "../../../lib/account-view";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false, follow: false } };

export default async function AccountWishlistPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/wishlist");

  const dashboard = await accountDashboard(principal);

  return <main className="account-app">
    <div className="announcement">Η Wishlist σου: προϊόντα που κράτησες, διαθεσιμότητα και Local Watch σε ένα σημείο.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <AccountSavedClient
      initialProducts={dashboard.savedProducts}
      searches={[]}
      csrfToken={dashboard.csrfToken}
      mode="wishlist"
    />
  </main>;
}
