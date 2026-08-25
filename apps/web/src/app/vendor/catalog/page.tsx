import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorArchivedProductsPanel } from "../../../components/VendorArchivedProductsPanel";
import { VendorCatalogClient } from "../../../components/VendorCatalogClient";
import { VendorLifecycle } from "../../../components/VendorLifecycle";
import { VendorPriceManager } from "../../../components/VendorPriceManager";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorCatalogWorkspace } from "../../../lib/vendor-backoffice-service";

export const metadata: Metadata = { title: "Προϊόντα, τιμές & απόθεμα", robots: { index: false, follow: false } };

export default async function VendorCatalogPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const workspace = await vendorCatalogWorkspace(principal);
  const reviewPending = workspace.submissions.some((item) => ["submitted", "needs_review"].includes(item.status));
  const hasProducts = workspace.catalogMetrics.totalProducts > 0;
  const hasVisibleProducts = workspace.catalogMetrics.visibleProducts > 0;
  const archivedProducts = workspace.catalogProducts.filter((item) => item.offerStatus === "archived").map((item) => ({ offerId: item.offerId, title: item.title, vendorSku: item.vendorSku }));

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Προϊόντα</div><h1>Κατάλογος, τιμές & απόθεμα</h1><p className="lead">Δες τι βλέπει ο πελάτης, ενημέρωσε την τελική τιμή πώλησης, κράτησε σωστό το πραγματικό απόθεμα και πρόσθεσε νέα προϊόντα με μία ξεκάθαρη πορεία μέχρι τη δημοσίευση.</p></div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Νέο προϊόν" title="Από την καταχώρηση μέχρι να εμφανιστεί στο κατάστημά σου" note="Τα εσωτερικά matching και approval βήματα παραμένουν στο παρασκήνιο. Εσύ χρειάζεται να δώσεις σωστά στοιχεία προϊόντος, τιμή και απόθεμα." />
      <VendorLifecycle steps={[
        { label: "Προϊόν & κατηγορία", tone: hasProducts ? "done" : "attention", detail: "Τι είναι και πού ανήκει" },
        { label: "Μάρκα & κωδικοί", tone: hasProducts ? "done" : "future", detail: "Brand, model, SKU, GTIN όπου υπάρχουν" },
        { label: "Τιμή & απόθεμα", tone: hasProducts ? "done" : "future", detail: "Τελική τιμή και φυσικό stock" },
        { label: "Έλεγχος ΚΟΝΤΑ ΜΟΥ", tone: reviewPending ? "waiting" : hasProducts ? "done" : "future", detail: reviewPending ? "Υπάρχουν προϊόντα σε έλεγχο" : "Αντιστοίχιση και έγκριση" },
        { label: "Δημοσίευση", tone: hasVisibleProducts ? "done" : hasProducts ? "current" : "future", detail: hasVisibleProducts ? "Υπάρχουν ενεργά προϊόντα" : "Εμφάνιση στον πελάτη" }
      ]} ariaLabel="Πορεία νέου προϊόντος" />
      <WorkspaceHowItWorks>
        <p><strong>Τιμή πώλησης:</strong> είναι η τελική τιμή του δικού σου offer. Κάθε πραγματική αλλαγή κρατιέται στο ιστορικό και ενημερώνει τον admin.</p>
        <p><strong>Φυσικό απόθεμα:</strong> πόσα τεμάχια υπάρχουν πραγματικά στο κατάστημα.</p>
        <p><strong>Απόθεμα ασφαλείας:</strong> τεμάχια που θέλεις να μένουν εκτός online πώλησης για να μειώνεται ο κίνδυνος overselling.</p>
        <p><strong>Δεσμευμένα:</strong> τεμάχια που έχουν ήδη κρατηθεί προσωρινά για ενεργές παραγγελίες.</p>
        <p><strong>Διαθέσιμα προς πώληση:</strong> το ποσό που μπορεί πραγματικά να προσφερθεί online μετά τις δεσμεύσεις και το απόθεμα ασφαλείας.</p>
        <p><strong>Απόκρυψη:</strong> δεν διαγράφει προϊόν ή stock· απλώς σταματά προσωρινά τη δημόσια πώληση.</p>
      </WorkspaceHowItWorks>
      <VendorPriceManager csrfToken={workspace.csrfToken} products={workspace.catalogProducts} />
    </section>

    <VendorCatalogClient initial={workspace} />
    <VendorArchivedProductsPanel products={archivedProducts} csrfToken={workspace.csrfToken} />
  </main>;
}
