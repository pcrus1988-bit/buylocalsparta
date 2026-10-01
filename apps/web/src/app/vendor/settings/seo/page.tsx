import type { Metadata } from "next";
import { VendorSettingsHubSectionPage } from "../../../../components/VendorSettingsHubSectionPage";

export const metadata: Metadata = { title: "Εμφάνιση στη Google", robots: { index: false, follow: false } };

export default function Page() {
  return <VendorSettingsHubSectionPage
    section="seo"
    capability="seo.source_data.manage"
    eyebrow="Ρυθμίσεις · Google"
    title="Εμφάνιση στη Google"
    description="Γράψε τον τίτλο και την περιγραφή της επιχείρησής σου. Το ΚΟΝΤΑ ΜΟΥ αναλαμβάνει τις τεχνικές ρυθμίσεις αναζήτησης."
  />;
}
