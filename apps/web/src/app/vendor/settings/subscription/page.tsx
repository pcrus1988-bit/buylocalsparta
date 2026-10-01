import type { Metadata } from "next";
import { VendorSettingsHubSectionPage } from "../../../../components/VendorSettingsHubSectionPage";

export const metadata: Metadata = { title: "Συνδρομή & συνεργασία", robots: { index: false, follow: false } };

export default function Page() {
  return <VendorSettingsHubSectionPage
    section="subscription"
    capability="subscription.manage"
    eyebrow="Ρυθμίσεις · Συνεργασία"
    title="Συνδρομή & συνεργασία"
    description="Δες τους τρέχοντες όρους συνεργασίας και, όπου υποστηρίζεται, υπέβαλε αίτημα αλλαγής πλάνου."
  />;
}
