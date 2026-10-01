import type { Metadata } from "next";
import { VendorSettingsHubSectionPage } from "../../../../components/VendorSettingsHubSectionPage";

export const metadata: Metadata = { title: "Πλάνο συνεργασίας", robots: { index: false, follow: false } };

export default function Page() {
  return <VendorSettingsHubSectionPage
    section="subscription"
    capability="subscription.manage"
    eyebrow="Ρυθμίσεις · Πλάνο"
    title="Πλάνο συνεργασίας"
    description="Δες το τρέχον πλάνο του καταστήματός σου και υπέβαλε αίτημα αλλαγής όταν υπάρχει διαθέσιμη επιλογή."
  />;
}
