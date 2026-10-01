import type { Metadata } from "next";
import { VendorSettingsHubSectionPage } from "../../../../components/VendorSettingsHubSectionPage";

export const metadata: Metadata = { title: "SEO καταστήματος", robots: { index: false, follow: false } };

export default function Page() {
  return <VendorSettingsHubSectionPage
    section="seo"
    capability="seo.source_data.manage"
    eyebrow="Ρυθμίσεις · SEO"
    title="SEO καταστήματος"
    description="Διαχειρίσου το περιεχόμενο που περιγράφει την επιχείρησή σου χωρίς να χρειάζεται να αγγίζεις τεχνικές ρυθμίσεις ευρετηρίασης."
  />;
}
