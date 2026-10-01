import Link from "next/link";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { VendorArchivedProductsPanel } from "../../../components/VendorArchivedProductsPanel";
import { VendorCatalogClient } from "../../../components/VendorCatalogClient";
import { VendorDeliveryEligibilityPanel } from "../../../components/VendorDeliveryEligibilityPanel";
import { VendorLifecycle } from "../../../components/VendorLifecycle";
import { VendorPriceManager } from "../../../components/VendorPriceManager";
import { VendorStockFreshnessPanel } from "../../../components/VendorStockFreshnessPanel";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { confirmVendorAssignedCatalogueEvidence, vendorAssignedCatalogueWorkspace } from "../../../lib/vendor-assigned-catalogue-service";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../lib/vendor-session";
import { vendorCatalogWorkspace } from "../../../lib/vendor-backoffice-service";
import { getVendorAdminArchivedOfferIds } from "../../../lib/vendor-offer-reactivation-state";
import { getVendorStockFreshness } from "../../../lib/vendor-stock-freshness";

export const metadata: Metadata = { title: "Προϊόντα, τιμές & απόθεμα", robots: { index: false, follow: false } };

const ASSIGNED_PAGE_SIZE = 40;
type Params = { assignedOffset?: string; assignedSaved?: string; assignedError?: string };

async function confirmAssignedCatalogueAction(formData: FormData) {
  "use server";
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const assortmentId = String(formData.get("assortmentId") ?? "").trim();
  const priceText = String(formData.get("supplierPrice") ?? "").trim();
  const stockText = String(formData.get("stockOnHand") ?? "").trim();
  const stockUnavailable = String(formData.get("stockUnavailable") ?? "") === "1";
  const assignedOffset = parseAssignedOffset(String(formData.get("assignedOffset") ?? ""));
  let saved = "1";
  let errorMessage: string | undefined;
  try {
    await confirmVendorAssignedCatalogueEvidence(principal, {
      assortmentId,
      supplierPriceMinor: priceText ? parseEuroMinor(priceText) : undefined,
      stockOnHand: stockText ? parseStock(stockText) : undefined,
      stockUnavailable
    });
  } catch (error) {
    saved = "0";
    errorMessage = error instanceof Error ? error.message.slice(0, 300) : "Η επιβεβαίωση δεν αποθηκεύτηκε.";
  }
  revalidatePath("/vendor/catalog");
  const search = new URLSearchParams({ assignedOffset: String(assignedOffset), assignedSaved: saved });
  if (errorMessage) search.set("assignedError", errorMessage);
  redirect(`/vendor/catalog?${search.toString()}#assigned-catalogue`);
}

export default async function VendorCatalogPage({ searchParams }: { searchParams: Promise<Params> }) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const params = await searchParams;
  const assignedOffset = parseAssignedOffset(params.assignedOffset);
  const operatingContext = await vendorOperatingContextForPrincipal(principal);
  const [workspace, assignedCatalogue, stockFreshness, adminArchivedOfferIds] = await Promise.all([
    vendorCatalogWorkspace(principal),
    vendorAssignedCatalogueWorkspace(principal, { offset: assignedOffset, limit: ASSIGNED_PAGE_SIZE }),
    getVendorStockFreshness(principal),
    getVendorAdminArchivedOfferIds(principal)
  ]);
  const catalogProducts = workspace.catalogProducts.map((item) => ({
    ...item,
    canToggleVisibility: item.canToggleVisibility && !adminArchivedOfferIds.has(item.offerId)
  }));
  const catalogWorkspace = { ...workspace, catalogProducts };
  const reviewPending = workspace.submissions.some((item) => ["submitted", "needs_review"].includes(item.status));
  const hasProducts = workspace.catalogMetrics.totalProducts > 0 || assignedCatalogue.totalAssigned > 0;
  const hasVisibleProducts = workspace.catalogMetrics.visibleProducts > 0;
  const archivedProducts = catalogProducts
    .filter((item) => item.offerStatus === "archived" && adminArchivedOfferIds.has(item.offerId))
    .map((item) => ({ offerId: item.offerId, title: item.title, vendorSku: item.vendorSku }));
  const previousAssignedOffset = Math.max(0, assignedOffset - ASSIGNED_PAGE_SIZE);
  const nextAssignedOffset = assignedOffset + assignedCatalogue.products.length;
  const hasPreviousAssigned = assignedOffset > 0;
  const hasNextAssigned = nextAssignedOffset < assignedCatalogue.totalAssigned;

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Προϊόντα</div><h1>Κατάλογος, τιμές & απόθεμα</h1><p className="lead">Δες τι βλέπει ο πελάτης, ενημέρωσε την τελική τιμή πώλησης, κράτησε σωστό το πραγματικό απόθεμα και πρόσθεσε νέα προϊόντα με μία ξεκάθαρη πορεία μέχρι τη δημοσίευση.</p>{operatingContext.capabilities.includes("catalogue.import") && <div className="workspace-action-buttons"><Link className="button" href="/vendor/catalog/feed">Σύνδεση XML προϊόντων</Link></div>}</div>
    </section>

    {assignedCatalogue.totalAssigned > 0 && <section className="shell vendor-section" id="assigned-catalogue">
      <WorkspaceSectionHeading
        eyebrow="Ανατεθειμένος κατάλογος προμηθευτή"
        title="Επιβεβαίωσε τι γνωρίζεις χωρίς να δημιουργηθεί δημόσια προσφορά"
        note="Το ΚΟΝΤΑ ΜΟΥ έχει συνδέσει αυτά τα προϊόντα πηγής με το κατάστημά σου. Εδώ επιβεβαιώνεις μόνο την πραγματική τιμή προμηθευτή και το φυσικό απόθεμα. Η επιβεβαίωση παραμένει εσωτερική πληροφορία και δεν δημιουργεί δημόσια προσφορά ή διαθεσιμότητα."
      />
      <WorkspaceMetricStrip items={[
        { label: "Ανατεθειμένα προϊόντα πηγής", value: assignedCatalogue.totalAssigned, tone: "positive" },
        { label: "Τιμή προμηθευτή σε αναμονή", value: assignedCatalogue.pendingPrice, tone: assignedCatalogue.pendingPrice ? "attention" : "positive" },
        { label: "Φυσικό απόθεμα σε αναμονή", value: assignedCatalogue.pendingStock, tone: assignedCatalogue.pendingStock ? "attention" : "positive" },
        { label: "Έτοιμα για σύνδεση", value: assignedCatalogue.canonicalMatched, tone: assignedCatalogue.canonicalMatched ? "positive" : "default" }
      ]} />
      <WorkspaceHowItWorks>
        <p><strong>Ανάθεση ≠ δημοσίευση:</strong> η παρουσία ενός προϊόντος εδώ δεν το κάνει αγοράσιμο και δεν δημιουργεί τιμή πώλησης.</p>
        <p><strong>Τιμή προμηθευτή:</strong> γράψε το πραγματικό δικό σου κόστος ανά τεμάχιο. Τυχόν τιμή του καταλόγου πηγής εμφανίζεται μόνο ως πληροφορία και δεν αντιγράφεται αυτόματα.</p>
        <p><strong>Φυσικό απόθεμα:</strong> είναι η πραγματική ποσότητα που βλέπεις στο κατάστημα αυτή τη στιγμή. Παραμένει εσωτερική πληροφορία μέχρι να δημιουργηθεί κανονική προσφορά και απόθεμα μέσω της ελεγχόμενης διαδικασίας καταλόγου.</p>
        <p><strong>Αντιστοίχιση προϊόντος:</strong> μπορεί να ολοκληρωθεί από το ΚΟΝΤΑ ΜΟΥ αργότερα. Δεν χρειάζεται να περιμένεις την αντιστοίχιση για να μας δώσεις σωστή εμπορική πληροφορία για το προϊόν πηγής.</p>
      </WorkspaceHowItWorks>

      {params.assignedSaved === "1" && <div className="workspace-inline-note" role="status"><strong>Η επιβεβαίωση αποθηκεύτηκε.</strong> Παραμένει εσωτερική πληροφορία και δεν έκανε το προϊόν διαθέσιμο προς πώληση.</div>}
      {params.assignedSaved === "0" && <div className="workspace-inline-note" role="alert"><strong>Η επιβεβαίωση δεν αποθηκεύτηκε.</strong> {params.assignedError ?? "Έλεγξε τα στοιχεία και δοκίμασε ξανά."}</div>}

      <div className="workspace-queue-list">{assignedCatalogue.products.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head">
          <div><strong>{item.title}</strong><small>{[item.brand, item.model, item.vendorSku].filter(Boolean).join(" · ") || "Χωρίς κωδικό προμηθευτή"} · {item.sourceName}</small></div>
          <span className="status-pill">{item.demoMode ? "ΔΟΚΙΜΗ · ανατεθειμένο" : "Ανατεθειμένο"}</span>
        </div>
        <div className="workspace-queue-primary">
          <span>Τιμή προμηθευτή: {item.priceCheckStatus === "confirmed" ? item.verifiedSupplierPrice ?? "επιβεβαιωμένη" : "σε αναμονή"}</span>
          <span>Φυσικό απόθεμα: {item.stockCheckStatus === "confirmed" ? String(item.verifiedStockOnHand ?? 0) : item.stockCheckStatus === "unavailable" ? "δεν υπάρχει τώρα" : "σε αναμονή"}</span>
          <span>{item.canonicalVariantId ? "Διαθέσιμη αντιστοίχιση καταλόγου" : "Εκκρεμεί αντιστοίχιση καταλόγου"}</span>
        </div>
        {item.sourcePrice && <div className="workspace-inline-note">Τιμή αναφοράς καταλόγου: {item.sourcePrice}{item.sourcePriceKind ? ` · ${item.sourcePriceKind}` : ""}. Δεν θεωρείται αυτόματα δική σου τιμή προμηθευτή.</div>}
        {(item.priceCheckStatus === "pending" || item.stockCheckStatus === "pending") && <div className="workspace-action-bar">
          <span>Επιβεβαίωσε μόνο ό,τι γνωρίζεις τώρα. Το υπόλοιπο μπορεί να μείνει σε αναμονή.</span>
          <div className="workspace-action-buttons">
            {item.priceCheckStatus === "pending" && <form action={confirmAssignedCatalogueAction} className="workspace-inline-form">
              <input type="hidden" name="assortmentId" value={item.id} />
              <input type="hidden" name="assignedOffset" value={assignedOffset} />
              <label><span>Τιμή προμηθευτή €</span><input name="supplierPrice" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" required /></label>
              <button className="button button-secondary" type="submit">Επιβεβαίωση τιμής</button>
            </form>}
            {item.stockCheckStatus === "pending" && <>
              <form action={confirmAssignedCatalogueAction} className="workspace-inline-form">
                <input type="hidden" name="assortmentId" value={item.id} />
                <input type="hidden" name="assignedOffset" value={assignedOffset} />
                <label><span>Φυσικό απόθεμα</span><input name="stockOnHand" type="number" min="0" max="1000000" step="1" inputMode="numeric" placeholder="0" required /></label>
                <button className="button button-secondary" type="submit">Επιβεβαίωση αποθέματος</button>
              </form>
              <form action={confirmAssignedCatalogueAction}>
                <input type="hidden" name="assortmentId" value={item.id} />
                <input type="hidden" name="assignedOffset" value={assignedOffset} />
                <input type="hidden" name="stockUnavailable" value="1" />
                <button className="button button-ghost" type="submit">Δεν υπάρχει τώρα</button>
              </form>
            </>}
          </div>
        </div>}
        <WorkspaceRecordDetails label="Στοιχεία πηγής"><div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Κατάλογος προμηθευτή</strong><span>{item.sourceName} · {item.sourceCode}</span></div>
          <div className="workspace-compact-row"><strong>Κατάσταση ανάθεσης</strong><span>{item.assortmentStatus} · {item.availabilityMode}</span></div>
          <div className="workspace-compact-row"><strong>Στοιχεία τιμής</strong><span>{item.priceCheckStatus}</span></div>
          <div className="workspace-compact-row"><strong>Στοιχεία αποθέματος</strong><span>{item.stockCheckStatus}</span></div>
          {item.canonicalVariantId && <div className="workspace-compact-row"><strong>Εσωτερικός κωδικός προϊόντος</strong><span className="vendor-technical-id">{item.canonicalVariantId}</span></div>}
        </div></WorkspaceRecordDetails>
      </article>)}</div>

      {(hasPreviousAssigned || hasNextAssigned) && <div className="workspace-action-bar">
        <span>Εμφάνιση {assignedOffset + 1}–{Math.min(assignedOffset + assignedCatalogue.products.length, assignedCatalogue.totalAssigned)} από {assignedCatalogue.totalAssigned.toLocaleString("el-GR")} ανατεθειμένα.</span>
        <div>
          {hasPreviousAssigned && <Link className="button button-secondary" href={assignedPageHref(previousAssignedOffset)}>Προηγούμενα</Link>}{" "}
          {hasNextAssigned && <Link className="button button-secondary" href={assignedPageHref(nextAssignedOffset)}>Επόμενα</Link>}
        </div>
      </div>}
    </section>}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Νέο προϊόν" title="Από την καταχώρηση μέχρι να εμφανιστεί στο κατάστημά σου" note="Τα εσωτερικά βήματα αντιστοίχισης και έγκρισης παραμένουν στο παρασκήνιο. Εσύ χρειάζεται να δώσεις σωστά στοιχεία προϊόντος, τιμή και απόθεμα." />
      <VendorLifecycle steps={[
        { label: "Προϊόν & κατηγορία", tone: hasProducts ? "done" : "attention", detail: "Τι είναι και πού ανήκει" },
        { label: "Μάρκα & κωδικοί", tone: hasProducts ? "done" : "future", detail: "Μάρκα, μοντέλο, SKU και GTIN όπου υπάρχουν" },
        { label: "Τιμή & απόθεμα", tone: hasProducts ? "done" : "future", detail: "Τελική τιμή και φυσικό απόθεμα" },
        { label: "Έλεγχος ΚΟΝΤΑ ΜΟΥ", tone: reviewPending ? "waiting" : hasProducts ? "done" : "future", detail: reviewPending ? "Υπάρχουν προϊόντα σε έλεγχο" : "Αντιστοίχιση και έγκριση" },
        { label: "Δημοσίευση", tone: hasVisibleProducts ? "done" : hasProducts ? "current" : "future", detail: hasVisibleProducts ? "Υπάρχουν ενεργά προϊόντα" : "Εμφάνιση στον πελάτη" }
      ]} ariaLabel="Πορεία νέου προϊόντος" />
      <WorkspaceHowItWorks>
        <p><strong>Τιμή πώλησης:</strong> είναι η τελική τιμή της δικής σου προσφοράς. Κάθε πραγματική αλλαγή κρατιέται στο ιστορικό και ενημερώνει το ΚΟΝΤΑ ΜΟΥ.</p>
        <p><strong>Φυσικό απόθεμα:</strong> πόσα τεμάχια υπάρχουν πραγματικά στο κατάστημα.</p>
        <p><strong>Επιβεβαίωση αποθέματος:</strong> κάθε αποθήκευση επιβεβαιώνει ξανά ότι η ποσότητα είναι πραγματική και πρόσφατη, ακόμη κι αν δεν άλλαξε. Η πρόσφατη επιβεβαίωση είναι απαραίτητη για να εμφανίζεται το προϊόν ως διαθέσιμο.</p>
        <p><strong>Απόθεμα ασφαλείας:</strong> τεμάχια που θέλεις να μένουν εκτός ηλεκτρονικής πώλησης ώστε να μειώνεται ο κίνδυνος να πουληθούν περισσότερα από όσα υπάρχουν.</p>
        <p><strong>Δεσμευμένα:</strong> τεμάχια που έχουν ήδη κρατηθεί προσωρινά για ενεργές παραγγελίες.</p>
        <p><strong>Διαθέσιμα προς πώληση:</strong> η ποσότητα που μπορεί πραγματικά να προσφερθεί προς πώληση μετά τις δεσμεύσεις και το απόθεμα ασφαλείας.</p>
        <p><strong>Τοπική παράδοση:</strong> είναι ενεργή από προεπιλογή. Μπορείς να ορίσεις συγκεκριμένο προϊόν ως «μόνο παραλαβή», χωρίς να επηρεάζεται η διαθεσιμότητα των υπόλοιπων προϊόντων σου.</p>
        <p><strong>Απόκρυψη:</strong> δεν διαγράφει το προϊόν ή το απόθεμα· απλώς σταματά προσωρινά τη δημόσια πώληση. Προϊόν που έκρυψες εσύ μπορείς να το επαναφέρεις από τον ίδιο διακόπτη. Αν έχει αρχειοθετηθεί από το ΚΟΝΤΑ ΜΟΥ, θα εμφανιστεί ξεχωριστά και θα χρειαστεί νέο έλεγχο.</p>
      </WorkspaceHowItWorks>
      <VendorDeliveryEligibilityPanel csrfToken={workspace.csrfToken} />
      <VendorPriceManager csrfToken={workspace.csrfToken} products={catalogProducts} />
    </section>

    <VendorStockFreshnessPanel snapshot={stockFreshness} />
    <VendorCatalogClient initial={catalogWorkspace} canImportCatalogue={operatingContext.capabilities.includes("catalogue.import")} />
    <VendorArchivedProductsPanel products={archivedProducts} csrfToken={workspace.csrfToken} />
  </main>;
}

function parseAssignedOffset(value?: string): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
function assignedPageHref(offset: number): string {
  return `/vendor/catalog?assignedOffset=${Math.max(0, offset)}#assigned-catalogue`;
}
function parseEuroMinor(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Η τιμή προμηθευτή πρέπει να είναι έγκυρο μη αρνητικό ποσό.");
  const minor = Math.round(parsed * 100);
  if (!Number.isSafeInteger(minor) || minor > 10_000_000_000) throw new Error("Η τιμή προμηθευτή είναι εκτός επιτρεπτού εύρους.");
  return minor;
}
function parseStock(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1_000_000) throw new Error("Το φυσικό απόθεμα πρέπει να είναι μη αρνητικός ακέραιος.");
  return parsed;
}
