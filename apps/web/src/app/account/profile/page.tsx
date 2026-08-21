import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountProfileAddressesClient } from "../../../components/AccountProfileAddressesClient";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerCheckoutProfile } from "../../../lib/customer-address-runtime";
import { customerAccountProfile } from "../../../lib/customer-account-profile-security";

export const metadata: Metadata = { title: "Προφίλ & διευθύνσεις", robots: { index: false, follow: false } };

export default async function AccountProfilePage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/profile");
  const [profile, account] = await Promise.all([customerCheckoutProfile(principal), customerAccountProfile(principal)]);
  return <main className="account-app">
    <div className="announcement">Τα στοιχεία λογαριασμού, παράδοσης και τιμολόγησης πριν το checkout.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <AccountProfileAddressesClient initialProfile={profile} initialAccount={account} csrfToken={principal.csrfToken} />
  </main>;
}