import type { Metadata } from "next";
import { VendorSettingsHubSectionPage } from "../../../../components/VendorSettingsHubSectionPage";

export const metadata: Metadata = { title: "Φορολογικά & AADE", robots: { index: false, follow: false } };

export default function Page() {
  return <VendorSettingsHubSectionPage
    section="aade"
    capability="aade.manage"
    eyebrow="Ρυθμίσεις · Φορολογικά"
    title="Φορολογικά & AADE"
    description="Δες την κατάσταση των φορολογικών εγγράφων σου και ζήτησε έλεγχο ή επανάληψη αποστολής όταν χρειάζεται. Οι ασφαλείς φορολογικές ενέργειες παραμένουν ελεγχόμενες από το ΚΟΝΤΑ ΜΟΥ."
  />;
}
