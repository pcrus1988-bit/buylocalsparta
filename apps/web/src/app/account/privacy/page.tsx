import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountPrivacyRightsClient } from "../../../components/AccountPrivacyRightsClient";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerStateSnapshot } from "../../../lib/customer-state-runtime";

export const metadata: Metadata = { title: "Privacy & Data Centre", robots: { index: false, follow: false } };

export default async function AccountPrivacyPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/privacy");
  const state = await customerStateSnapshot(principal.userId);

  return <main className="account-app">
    <div className="announcement">Τα δικαιώματα απορρήτου συνδέονται με πραγματικό workflow και ορατή κατάσταση.</div>
    <SiteHeader compact />
    <section className="shell page-hero account-hero dashboard-hero-refined">
      <div><div className="eyebrow">Privacy & Data Centre</div><h1>Τα δεδομένα σου, οι επιλογές σου, τα αιτήματά σου.</h1><p className="lead">Ρύθμισε προαιρετικές λειτουργίες, άλλαξε cookies και υπέβαλε GDPR request χωρίς να χρειάζεται να ψάχνεις τρόπο επικοινωνίας.</p><div className="hero-actions"><Link className="button" href="/account">← Πίσω στον λογαριασμό</Link><Link className="button button-secondary" href="/privacy">Πολιτική Απορρήτου</Link></div></div>
    </section>
    <AccountPrivacyRightsClient
      csrfToken={principal.csrfToken}
      email={principal.email}
      preferences={{ recommendationsEnabled: state.preferences.recommendationsEnabled, recentlyViewedEnabled: state.preferences.recentlyViewedEnabled }}
      requests={state.privacyRequests.map((request) => ({ id: request.id, type: request.type, status: request.status, submittedAt: request.submittedAt, targetAt: request.targetAt }))}
    />
  </main>;
}
