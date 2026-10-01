import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorProductFeedClient } from "../../../../components/VendorProductFeedClient";
import { VendorWorkspaceHeader } from "../../../../components/VendorWorkspaceHeader";
import { WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { vendorCatalogWorkspace } from "../../../../lib/vendor-backoffice-service";
import { isDropshippingOnlyVendor } from "../../../../lib/vendor-dropshipping-access";
import { vendorProductFeedWorkspace } from "../../../../lib/vendor-product-feed-service";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../../lib/vendor-session";

export const metadata: Metadata = {
  title: "XML Product Feed",
  robots: { index: false, follow: false }
};

export default async function VendorProductFeedPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");

  const operatingContext = await vendorOperatingContextForPrincipal(principal);
  if (!operatingContext.capabilities.includes("catalogue.import") || await isDropshippingOnlyVendor(principal.vendorId)) redirect("/vendor/catalog");

  const [catalog, feeds] = await Promise.all([
    vendorCatalogWorkspace(principal),
    vendorProductFeedWorkspace(principal)
  ]);

  const categories = catalog.categoryOptions.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    path: item.path
  }));

  return <main className="vendor-app">
    <VendorWorkspaceHeader />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Προϊόντα · XML Product Feed</div>
        <h1>Σύνδεσε ολόκληρο τον κατάλογό σου</h1>
        <p className="lead">
          Ανέβασε XML ή σύνδεσε το XML URL του e-shop σου. Το ΚΟΝΤΑ ΜΟΥ ελέγχει το feed,
          αντιστοιχίζει τα πεδία και κρατά τιμές και απόθεμα συγχρονισμένα χωρίς χειροκίνητη καταχώρηση.
        </p>
        <div className="workspace-action-buttons">
          <Link className="button button-secondary" href="/vendor/catalog">← Επιστροφή στον κατάλογο</Link>
        </div>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Πριν ξεκινήσεις"
        title="Το XML δεν παρακάμπτει την ποιότητα του καταλόγου"
        note="Τα νέα προϊόντα περνούν από το ίδιο canonical matching και approval workflow με κάθε άλλη καταχώρηση. Τα ήδη συνδεδεμένα προϊόντα μπορούν να ενημερώνουν αυτόματα την τιμή και το πραγματικό stock του δικού σου offer."
      />
    </section>

    <VendorProductFeedClient
      csrfToken={catalog.csrfToken}
      categories={categories}
      initial={feeds}
    />
  </main>;
}
