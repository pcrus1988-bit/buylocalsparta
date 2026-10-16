import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { AccountSecurityClient } from "../../../components/AccountSecurityClient";
import { AccountSessionsClient } from "../../../components/AccountSessionsClient";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerAccountProfile } from "../../../lib/customer-account-profile-security";
import { customerEmailChangeReadiness, customerPendingEmailChange } from "../../../lib/customer-email-change-runtime";
import { customerActiveSessions, customerSessionManagementReadiness } from "../../../lib/customer-session-management";

export const metadata: Metadata = { title: "Ασφάλεια λογαριασμού", robots: { index: false, follow: false } };

export default async function AccountSecurityPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/security");
  const [profile, pendingEmailChange, activeSessions] = await Promise.all([
    customerAccountProfile(principal),
    customerPendingEmailChange(principal),
    customerActiveSessions(principal)
  ]);
  const emailChangeReadiness = customerEmailChangeReadiness();
  const sessionReadiness = customerSessionManagementReadiness();
  return <main className="account-app">
    <div className="announcement">Ασφάλεια λογαριασμού και στοιχεία σύνδεσης.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <AccountSecurityClient
      email={profile.email}
      emailVerified={profile.emailVerified}
      csrfToken={principal.csrfToken}
      initialPendingEmailChange={pendingEmailChange ?? null}
      emailChangeReady={emailChangeReadiness.ready}
      emailChangeMessage={emailChangeReadiness.message}
    />
    <section className="shell customer-account-page" style={{paddingTop:0,paddingBottom:10}}>
      <Link className="button button-secondary" href="/account/companion-sessions">Συνδεδεμένες συσκευές KONTA MOY Companion →</Link>
    </section>
    <AccountSessionsClient
      initialSessions={activeSessions}
      csrfToken={principal.csrfToken}
      ready={sessionReadiness.ready}
      readinessMessage={sessionReadiness.message}
    />
  </main>;
}
