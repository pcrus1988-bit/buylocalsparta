import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { VendorCatalogClient } from "../../../components/VendorCatalogClient";
import { VendorLifecycle } from "../../../components/VendorLifecycle";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceHowItWorks, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorCatalogWorkspace } from "../../../lib/vendor-backoffice-service";
import { reviewVendorAssignedCatalogueProduct, vendorAssignedCatalogueWorkspace } from "../../../lib/vendor-assigned-catalogue-service";

export const metadata: Metadata = { title: "Προϊόντα & απόθεμα", robots: { index: false, follow: false } };

async function reviewAssignedCatalogueAction(formData: FormData) {
  "use server";
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const assortmentId = String(formData.get("assortmentId") ?? "").trim();
  const priceText = String(formData.get("supplierPrice") ?? "").trim();
  const stockText = String(formData.get("stockOnHand") ?? "").trim();
  const stockUnavailable = String(formData.get("stockUnavailable") ?? "") === "1";
  const supplierPriceMinor = priceText ? parseEuroMinor(priceText) : undefined;
  const stockOnHand = stockText ? parseStock(stockText) : undefined;
  await reviewVendorAssignedCatalogueProduct(principal, { assortmentId, supplierPriceMinor, stockOnHand, stockUnavailable });
  revalidatePath("/vendor/catalog");
}

export default async function VendorCatalogPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const [workspace, assignedProducts] = await Promise.all([
    vendorCatalogWorkspace(principal),
    vendorAssignedCatalogueWorkspace(principal)
  ]);
  const reviewPending = workspace.submissions.some((item) => ["submitted", "needs_review"].includes(item.status));
  const hasProducts = workspace.catalogMetrics.totalProducts > 0 || assignedProducts.length > 0;
  const hasVisibleProducts = workspace.catalogMetrics.visibleProducts > 0;
  const assignedPendingPrice = assignedProducts.filter((item) => item.priceCheckStatus === "pending").length;
  const assignedPendingStock = assignedProducts.filter((item) => item.stockCheckStatus === "pending").length;
  const assignedCanonical = assignedProducts.filter((item) => Boolean(item.canonicalVariantId)).length;

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Προϊόντα</div><h1>Κατάλογος & απόθεμα</h1><p className="lead">Δες τι βλέπει ο πελάτης, τα προϊόντα που σου έχει αναθέσει το ΚΟΝΤΑ ΜΟΥ, κράτησε σωστό το πραγματικό απόθεμα και πρόσθεσε νέα προϊόντα με μία ξεκάθαρη πορεία μέχρι τη δημοσίευση.</p></div>
    </section>

    {assignedProducts.length > 0 && <section className="shell vendor-section" id="assigned-catalogue">
      <WorkspaceSectionHeading eyebrow="Ανατεθειμένος κατάλογος" title="Προϊόντα που είναι ήδη διαθέσιμα στον χώρο εργασίας σου" note="Όταν το ΚΟΝΤΑ ΜΟΥ αναθέτει ένα crawled ή imported catalogue, τα προϊόντα εμφανίζονται εδώ αμέσως για demo vendors και για ενεργούς production vendors. Η ανάθεση δεν τα δημοσιεύει και δεν δημιουργεί από μόνη της offer ή inventory." />
      <WorkspaceMetricStrip items={[
        { label: "Ανατεθειμένα", value: assignedProducts.length, tone: "positive" },
        { label: "Τιμή για έλεγχο", value: assignedPendingPrice, tone: assignedPendingPrice ? "attention" : "positive" },
        { label: "Stock για έλεγχο", value: assignedPendingStock, tone: assignedPendingStock ? "attention" : "positive" },
        { label: "Canonical match", value: assignedCanonical, tone: assignedCanonical ? "positive" : "default" }
      ]} />
      <WorkspaceHowItWorks>
        <p><strong>Η ανάθεση είναι άμεση:</strong> δεν χρειάζεται να ξαναεισάγεις προϊόν που έχει ήδη συνδεθεί με το κατάστημά σου από Admin.</p>
        <p><strong>Τιμή & stock:</strong> μπορείς να τα επιβεβαιώσεις αργότερα. Οι επιβεβαιώσεις αποθηκεύονται ως εμπορικό evidence και όχι ως δημόσια προσφορά.</p>
        <p><strong>Δημοσίευση:</strong> παραμένει ξεχωριστό βήμα. Απαιτεί canonical identity και τους κανονικούς ελέγχους offer, inventory και visibility.</p>
      </WorkspaceHowItWorks>
      <div className="workspace-queue-list">{assignedProducts.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.title}</strong><small>{[item.brand, item.model, item.vendorSku].filter(Boolean).join(" · ") || "Χωρίς supplier code"} · {item.sourceName}</small></div><span className="vendor-merchant-status">{item.demoMode ? "DEMO · assigned" : "Assigned"}</span></div>
        <div className="workspace-queue-primary">
          <span>Τιμή: {item.priceCheckStatus === "confirmed" ? item.verifiedSupplierPrice ?? "Επιβεβαιωμένη" : item.sourcePrice ? `${item.sourcePrice} · προς έλεγχο` : "προς έλεγχο"}</span>
          <span>Stock: {item.stockCheckStatus === "confirmed" ? `${item.verifiedStockOnHand ?? 0}` : item.stockCheckStatus === "unavailable" ? "μη διαθέσιμο" : "προς έλεγχο"}</span>
          <span>{item.canonicalVariantId ? "Canonical identity έτοιμη" : "Canonical matching εκκρεμεί"}</span>
        </div>
        {(item.priceCheckStatus === "pending" || item.stockCheckStatus === "pending") && <div className="workspace-action-bar">
          <span>Επιβεβαίωσε μόνο ό,τι γνωρίζεις τώρα. Μπορείς να επιστρέψεις για τα υπόλοιπα αργότερα.</span>
          <div className="workspace-action-buttons">
            {item.priceCheckStatus === "pending" && <form action={reviewAssignedCatalogueAction} className="workspace-inline-form">
              <input type="hidden" name="assortmentId" value={item.id} />
              <label><span>Τιμή προμηθευτή €</span><input name="supplierPrice" type="number" min="0" step="0.01" defaultValue={item.sourcePriceMinor === undefined ? "" : (item.sourcePriceMinor / 100).toFixed(2)} placeholder="0,00" required /></label>
              <button className="button button-secondary" type="submit">Επιβεβαίωση τιμής</button>
            </form>}
            {item.stockCheckStatus === "pending" && <>
              <form action={reviewAssignedCatalogueAction} className="workspace-inline-form">
                <input type="hidden" name="assortmentId" value={item.id} />
                <label><span>Φυσικό stock</span><input name="stockOnHand" type="number" min="0" step="1" placeholder="0" required /></label>
                <button className="button button-secondary" type="submit">Επιβεβαίωση stock</button>
              </form>
              <form action={reviewAssignedCatalogueAction}><input type="hidden" name="assortmentId" value={item.id} /><input type="hidden" name="stockUnavailable" value="1" /><button className="button button-ghost" type="submit">Δεν το διαθέτω τώρα</button></form>
            </>}
          </div>
        </div>}
        <WorkspaceRecordDetails label="Κατάσταση & προέλευση"><div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Supplier PIM</strong><span>{item.sourceName} · {item.sourceCode}</span></div>
          <div className="workspace-compact-row"><strong>Assortment</strong><span>{item.assortmentStatus} · {item.availabilityMode}</span></div>
          <div className="workspace-compact-row"><strong>Price check</strong><span>{item.priceCheckStatus}</span></div>
          <div className="workspace-compact-row"><strong>Stock check</strong><span>{item.stockCheckStatus}</span></div>
          {item.canonicalVariantId && <div className="workspace-compact-row"><strong>Canonical variant</strong><span className="vendor-technical-id">{item.canonicalVariantId}</span></div>}
        </div></WorkspaceRecordDetails>
      </article>)}</div>
    </section>}

    {assignedProducts.length === 0 && <section className="shell vendor-section"><WorkspaceEmptyState title="Δεν σου έχει ανατεθεί ακόμη εξωτερικός κατάλογος." body="Τα δικά σου live προϊόντα και οι χειροκίνητες καταχωρήσεις συνεχίζουν να εμφανίζονται παρακάτω. Όταν Admin αναθέσει crawled catalogue, θα εμφανιστεί εδώ χωρίς δεύτερη εισαγωγή." /></section>}

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
        <p><strong>Φυσικό απόθεμα:</strong> πόσα τεμάχια υπάρχουν πραγματικά στο κατάστημα.</p>
        <p><strong>Απόθεμα ασφαλείας:</strong> τεμάχια που θέλεις να μένουν εκτός online πώλησης για να μειώνεται ο κίνδυνος overselling.</p>
        <p><strong>Δεσμευμένα:</strong> τεμάχια που έχουν ήδη κρατηθεί προσωρινά για ενεργές παραγγελίες.</p>
        <p><strong>Διαθέσιμα προς πώληση:</strong> το ποσό που μπορεί πραγματικά να προσφερθεί online μετά τις δεσμεύσεις και το απόθεμα ασφαλείας.</p>
        <p><strong>Απόκρυψη:</strong> δεν διαγράφει προϊόν ή stock· απλώς σταματά προσωρινά τη δημόσια πώληση.</p>
      </WorkspaceHowItWorks>
    </section>

    <VendorCatalogClient initial={workspace} />
  </main>;
}

function parseEuroMinor(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Η τιμή πρέπει να είναι έγκυρο μη αρνητικό ποσό.");
  const minor = Math.round(parsed * 100);
  if (!Number.isSafeInteger(minor)) throw new Error("Η τιμή είναι εκτός επιτρεπτού εύρους.");
  return minor;
}

function parseStock(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Το stock πρέπει να είναι μη αρνητικός ακέραιος.");
  return parsed;
}
