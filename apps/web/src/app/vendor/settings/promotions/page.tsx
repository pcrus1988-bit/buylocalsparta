import type { Metadata } from "next";
import { VendorSettingsHubSectionPage } from "../../../../components/VendorSettingsHubSectionPage";

export const metadata: Metadata = { title: "Προσφορές & εκπτώσεις", robots: { index: false, follow: false } };

export default function Page() {
  return <VendorSettingsHubSectionPage
    section="promotions"
    capability="promotions.manage"
    eyebrow="Ρυθμίσεις · Προσφορές"
    title="Προσφορές & εκπτώσεις"
    description="Δημιούργησε αίτημα προσφοράς με τιμή και διάρκεια. Η δημόσια τιμή αλλάζει μόνο αφού ολοκληρωθούν οι απαραίτητοι έλεγχοι."
  />;
}
