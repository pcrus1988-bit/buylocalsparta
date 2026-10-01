import type { Metadata } from "next";
import { VendorSettingsHubSectionPage } from "../../../../components/VendorSettingsHubSectionPage";

export const metadata: Metadata = { title: "Εμφάνιση στη Google", robots: { index: false, follow: false } };

export default function Page() {
  return <VendorSettingsHubSectionPage
    section="seo"
    capability="seo.source_data.manage"
    eyebrow="Ρυθμίσεις · Αναζήτηση"
    title="Εμφάνιση στη Google"
    description="Ρύθμισε πώς περιγράφεται η επιχείρησή σου στην αναζήτηση, χωρίς να χρειάζεται να ασχοληθείς με τεχνικές ρυθμίσεις."
  />;
}
