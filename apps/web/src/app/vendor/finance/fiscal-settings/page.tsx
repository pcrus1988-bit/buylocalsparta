import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorFiscalSettingsClient } from "../../../../components/VendorFiscalSettingsClient";
import { VendorWorkspaceHeader } from "../../../../components/VendorWorkspaceHeader";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../../lib/vendor-session";
import { isExpansionHubScope, vendorHubDisplayName } from "../../../../lib/vendor-hub-display";
import { vendorFiscalSettings } from "../../../../lib/vendor-fiscal-settings";

export const metadata: Metadata = { title: "AADE & ρυθμίσεις παραστατικών", robots: { index: false, follow: false } };

export default async function VendorFiscalSettingsPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const context = await vendorOperatingContextForPrincipal(principal);
  if (!isExpansionHubScope(context) || !principal.roles.includes("vendor_owner")) redirect("/vendor/finance");
  const settings = await vendorFiscalSettings(principal);

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">HUB {vendorHubDisplayName(context)} · Οικονομικά</div>
        <h1>AADE & παραστατικά</h1>
        <p className="lead">Ρύθμισε τη σύνδεση myDATA, την αρίθμηση, τον τρόπο εμφάνισης του φόρου και την εμφάνιση του PDF της επιχείρησής σου.</p>
      </div>
    </section>
    <VendorFiscalSettingsClient initial={settings} />
  </main>;
}
