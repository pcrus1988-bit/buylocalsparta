import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountProfileAddressesClient } from "../../../components/AccountProfileAddressesClient";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerCheckoutProfile } from "../../../lib/customer-address-runtime";

export const metadata: Metadata = { title: "Προφίλ & διευθύνσεις", robots: { index: false, follow: false } };

export default async function AccountProfilePage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/profile");
  const profile = await customerCheckoutProfile(principal);
  return <main className="account-app">
    <div className="announcement">Τα στοιχεία λογαριασμού, παράδοσης και τιμολόγησης πριν το checkout.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <AccountProfileAddressesClient initialProfile={profile} email={principal.email} csrfToken={principal.csrfToken} />
  </main>;
}
