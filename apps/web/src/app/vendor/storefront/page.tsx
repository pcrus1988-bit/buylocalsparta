import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorStorefrontMediaClient } from "../../../components/VendorStorefrontMediaClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorProfileMediaWorkspace } from "../../../lib/vendor-profile-media-service";

export const metadata: Metadata = { title: "Vendor · Storefront", robots: { index: false, follow: false } };

export default async function VendorStorefrontPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const workspace = await vendorProfileMediaWorkspace(principal);

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Storefront profile</div>
        <h1>Η δημόσια εικόνα του καταστήματός σου</h1>
        <p className="lead">Διαχειρίσου λογότυπο, φυσικό κατάστημα, ανθρώπους και gallery χωρίς να μπερδεύονται με τις φωτογραφίες προϊόντων.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Publication flow</span>
        <strong>Upload → έλεγχος → δημοσίευση</strong>
        <p>Η υπάρχουσα live εικόνα παραμένει στη θέση της μέχρι να εγκριθεί και να δημοσιευθεί η αντικατάσταση.</p>
      </aside>
    </section>
    <VendorStorefrontMediaClient initial={workspace} />
  </main>;
}
