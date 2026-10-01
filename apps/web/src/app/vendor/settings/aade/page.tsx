import type { Metadata } from "next";
import { VendorSettingsHubSectionPage } from "../../../../components/VendorSettingsHubSectionPage";

export const metadata: Metadata = { title: "Φορολογικά & AADE", robots: { index: false, follow: false } };

export default function Page() {
  return <VendorSettingsHubSectionPage
    section="aade"
    capability="aade.manage"
    eyebrow="Ρυθμίσεις · Φορολογικά"
    title="Φορολογικά & AADE"
    description="Παρακολούθησε τα φορολογικά έγγραφα του καταστήματός σου και υπέβαλε ελεγχόμενα αιτήματα myDATA."
  />;
}
