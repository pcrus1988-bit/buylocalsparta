import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorHubControlsClient } from "../../../components/VendorHubControlsClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks } from "../../../components/WorkspacePagePrimitives";
import { vendorHubControlsWorkspace } from "../../../lib/vendor-hub-controls-service";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../lib/vendor-session";

export const metadata: Metadata = { title: "Κέντρο ελέγχου HUB", robots: { index: false, follow: false } };

export default async function VendorHubPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const context = await vendorOperatingContextForPrincipal(principal);
  if (context.operatingModel !== "SELF_GOVERNED") redirect("/vendor");

  const workspace = await vendorHubControlsWorkspace(principal);

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Αυτοδιαχειριζόμενο HUB</div>
        <h1>Έλεγχος του online καταστήματός σου στο HUB</h1>
        <p className="lead">Ρύθμισε όσα ανήκουν στη δική σου επιχείρηση, με ξεκάθαρο διαχωρισμό από τους κανόνες που παραμένουν κεντρικοί για ολόκληρο το ΚΟΝΤΑ ΜΟΥ.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Περιοχή λειτουργίας</span>
        <strong>{workspace.hubId ?? workspace.marketId}</strong>
        <p>{workspace.tradingName} · {workspace.locationId ?? "κύρια τοποθεσία"}</p>
      </aside>
    </section>

    <section className="shell vendor-section">
      <WorkspaceHowItWorks title="Τι σημαίνει αυτοδιαχειριζόμενο HUB" open>
        <p><strong>Δική σου διαχείριση:</strong> κάλυψη παραδόσεων, στοιχεία SEO, εμπορικά αιτήματα, παρακολούθηση AADE και επιλογή πλάνου αφορούν μόνο τη δική σου επιχείρηση.</p>
        <p><strong>Κεντρική διαχείριση:</strong> ο κεντρικός κατάλογος προϊόντων, η δίκαιη ανάθεση συνεργάτη, η ευρετηρίαση, οι τελικές προωθητικές τιμές, η φορολογική αντιστοίχιση και η ενεργοποίηση εμπορικών συμφωνιών παραμένουν στο ΚΟΝΤΑ ΜΟΥ.</p>
        <p><strong>Απομόνωση HUB:</strong> όλες οι εγγραφές περιορίζονται στο συγκεκριμένο HUB και στο κατάστημα του συνδεδεμένου συνεργάτη.</p>
      </WorkspaceHowItWorks>
    </section>

    <VendorHubControlsClient initial={workspace} />
  </main>;
}
