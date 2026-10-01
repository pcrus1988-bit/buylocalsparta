import type { Metadata } from "next";
import { VendorSettingsHubSectionPage } from "../../../../components/VendorSettingsHubSectionPage";

export const metadata: Metadata = { title: "Προωθητικές ενέργειες", robots: { index: false, follow: false } };

export default function Page() {
  return <VendorSettingsHubSectionPage
    section="promotions"
    capability="promotions.manage"
    eyebrow="Ρυθμίσεις · Προωθήσεις"
    title="Προωθητικές ενέργειες"
    description="Επίλεξε προϊόν, προτεινόμενη τιμή και διάρκεια. Θα βλέπεις καθαρά αν η προώθηση περιμένει έλεγχο, εγκρίθηκε ή χρειάζεται αλλαγή."
  />;
}
