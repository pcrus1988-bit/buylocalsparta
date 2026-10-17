import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountPrivacyRightsClient } from "../../../components/AccountPrivacyRightsClient";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerStateSnapshot } from "../../../lib/customer-state-runtime";

export const metadata: Metadata = { title: "Ιδιωτικότητα & δεδομένα", robots: { index: false, follow: false } };

export default async function AccountPrivacyPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/privacy");
  const state = await customerStateSnapshot(principal.userId);

  return <main className="account-app">
    <div className="announcement">Τα δικαιώματα απορρήτου συνδέονται με πραγματικό workflow και ορατή κατάσταση.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className="shell customer-account-page account-privacy-intro">
      <div className="customer-page-heading">
        <div><div className="eyebrow">Προφίλ & ασφάλεια</div><h1>Ιδιωτικότητα & δεδομένα</h1></div>
        <p>Διαχειρίσου τις επιλογές σου, τα cookies και τα αιτήματα για τα προσωπικά σου δεδομένα.</p>
      </div>
      <nav className="account-subpage-jumps" aria-label="Ενότητες ιδιωτικότητας">
        <a href="#account-privacy-preferences">Οι επιλογές μου</a>
        <a href="#account-privacy-cookies">Cookies</a>
        <a className="account-jump-primary" href="#account-privacy-request">Νέο αίτημα</a>
        <a href="#account-privacy-history">Ιστορικό αιτημάτων</a>
      </nav>
      <Link className="account-privacy-policy-link" href="/privacy">Διάβασε την Πολιτική Απορρήτου →</Link>
    </section>
    <AccountPrivacyRightsClient
      csrfToken={principal.csrfToken}
      email={principal.email}
      preferences={{ recommendationsEnabled: state.preferences.recommendationsEnabled, recentlyViewedEnabled: state.preferences.recentlyViewedEnabled }}
      requests={state.privacyRequests.map((request) => {
        const outcome = request.outcome && typeof request.outcome === "object" && !Array.isArray(request.outcome) ? request.outcome as Record<string, unknown> : {};
        const automation = outcome.automation && typeof outcome.automation === "object" && !Array.isArray(outcome.automation) ? outcome.automation as Record<string, unknown> : {};
        const response = outcome.response && typeof outcome.response === "object" && !Array.isArray(outcome.response) ? outcome.response as Record<string, unknown> : {};
        const legacyTerminalReport = ["completed","partially_completed"].includes(request.status) && ["access","export"].includes(request.type);
        return { id: request.id, type: request.type, status: request.status, submittedAt: request.submittedAt, targetAt: request.targetAt, reportReady: Boolean(automation.reportReady) || legacyTerminalReport, responseSent: Boolean(response.sentAt) };
      })}
    />
  </main>;
}
