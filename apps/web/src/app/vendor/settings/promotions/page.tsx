import type { Metadata } from "next";
import { VendorSettingsHubSectionPage } from "../../../../components/VendorSettingsHubSectionPage";

export const metadata: Metadata = { title: "Προωθητικές ενέργειες", robots: { index: false, follow: false } };

export default function Page() {
  return <VendorSettingsHubSectionPage
    section="promotions"
    capability="promotions.manage"
    eyebrow="Ρυθμίσεις · Προωθήσεις"
    title="Προωθητικές ενέργειες"
    description="Πρότεινε τιμές και χρονικά διαστήματα προώθησης. Η δημόσια ενεργοποίηση γίνεται μόνο μετά τους απαραίτητους ελέγχους."
  />;
}
