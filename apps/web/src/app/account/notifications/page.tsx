import type { Metadata } from "next";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AccountNotificationsClient } from "../../../components/AccountNotificationsClient";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { CartRecoveryPreferenceToggle } from "../../../components/CartRecoveryPreferenceToggle";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerBrowserNotification } from "../../../lib/customer-account-browser-view";
import { customerNotificationsForUser } from "../../../lib/customer-state-runtime";
import { customerCartRecoveryPreference } from "../../../lib/customer-cart-recovery-preference";

export const metadata: Metadata = { title: "Ειδοποιήσεις", robots: { index: false, follow: false } };

async function CartRecoverySettings({ principal }: { principal: SessionPrincipal }) {
  try {
    const enabled = await customerCartRecoveryPreference(principal);
    return <details className="shell account-subpage-settings">
      <summary>Ρυθμίσεις ειδοποιήσεων</summary>
      <div><CartRecoveryPreferenceToggle initialEnabled={enabled} csrfToken={principal.csrfToken} /></div>
    </details>;
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "account.notification_settings_unavailable",
      message: error instanceof Error ? error.message : String(error)
    }));
    return <details className="shell account-subpage-settings">
      <summary>Ρυθμίσεις ειδοποιήσεων</summary>
      <p role="status">Οι ρυθμίσεις είναι προσωρινά μη διαθέσιμες. Δοκίμασε ξανά αργότερα.</p>
    </details>;
  }
}

export default async function AccountNotificationsPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/notifications");

  // Notification data must not depend on slow catalogue, order or recommendation reads.
  const notifications = await customerNotificationsForUser(principal.userId);

  return <main className="account-app">
    <div className="announcement">Όλες οι σημαντικές αλλαγές του λογαριασμού σου σε ένα σημείο.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <AccountNotificationsClient initial={notifications.map(customerBrowserNotification)} csrfToken={principal.csrfToken} />
    <Suspense fallback={<p className="shell account-subpage-settings">Φόρτωση ρυθμίσεων ειδοποιήσεων…</p>}>
      <CartRecoverySettings principal={principal} />
    </Suspense>
  </main>;
}
