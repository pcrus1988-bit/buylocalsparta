import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { AccountSecurityClient } from "../../../components/AccountSecurityClient";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerAccountProfile } from "../../../lib/customer-account-profile-security";

export const metadata: Metadata = { title: "Ασφάλεια λογαριασμού", robots: { index: false, follow: false } };

export default async function AccountSecurityPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/security");
  const profile = await customerAccountProfile(principal);
  return <main className="account-app">
    <div className="announcement">Ασφάλεια λογαριασμού και στοιχεία σύνδεσης.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <AccountSecurityClient email={profile.email} emailVerified={profile.emailVerified} csrfToken={principal.csrfToken} />
  </main>;
}