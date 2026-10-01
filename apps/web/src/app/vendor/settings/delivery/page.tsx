import type { Metadata } from "next";
import { VendorSettingsHubSectionPage } from "../../../../components/VendorSettingsHubSectionPage";

export const metadata: Metadata = { title: "Τοπικές παραδόσεις", robots: { index: false, follow: false } };

export default function Page() {
  return <VendorSettingsHubSectionPage
    section="delivery"
    capability="local_delivery.manage"
    eyebrow="Ρυθμίσεις · Παραδόσεις"
    title="Τοπικές παραδόσεις"
    description="Όρισε πού μπορεί να εξυπηρετεί το κατάστημά σου. Οι ρυθμίσεις αφορούν μόνο τη δική σου επιχείρηση."
  />;
}
