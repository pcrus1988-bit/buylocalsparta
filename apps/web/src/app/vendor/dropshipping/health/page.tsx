import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { dropshippingFeedHealth } from "../../../../lib/dropshipping-feed-health";
import { isDropshippingOnlyVendor } from "../../../../lib/vendor-dropshipping-access";
import { vendorDropshippingWorkspace } from "../../../../lib/vendor-dropshipping-service";
import { getVendorSession } from "../../../../lib/vendor-session";

export const metadata: Metadata = { title: "Κατάσταση ροής dropshipping", robots: { index: false, follow: false } };

const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value))
  : "—";

const age = (minutes: number | null) => {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} λεπτά`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ώρες`;
  return `${Math.floor(hours / 24)} ημέρες`;
};

function supplierWorkspaceUrl(supplierCode: string, filters: Record<string, string> = {}): string {
  const params = new URLSearchParams({ supplier: supplierCode });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return `/vendor/dropshipping?${params.toString()}`;
}

export default async function DropshippingFeedHealthPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  if (!await isDropshippingOnlyVendor(principal.vendorId)) redirect("/vendor");

  const workspace = await vendorDropshippingWorkspace(principal.vendorId ?? "", { page: 1, pageSize: 20 });
  const suppliers = workspace.suppliers.map((supplier) => ({ supplier, health: dropshippingFeedHealth(supplier) }));
  const healthy = suppliers.filter(({ health }) => health.status === "healthy").length;
  const attention = suppliers.filter(({ health }) => health.status === "stale" || health.status === "degraded").length;
  const unknown = suppliers.filter(({ health }) => health.status === "unknown").length;
  const missingAvailabilityTelemetryProducts = suppliers.reduce((sum, { supplier }) => sum + (supplier.missingAvailabilityTelemetryProducts ?? 0), 0);
  const publishedUnavailableProducts = suppliers.reduce((sum, { supplier }) => sum + (supplier.publishedUnavailableProducts ?? 0), 0);
  const productsMissingCost = suppliers.reduce((sum, { supplier }) => sum + Math.max(0, supplier.totalProducts - supplier.productsWithCost), 0);

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Κέντρο dropshipping</div>
        <h1>Κατάσταση ροής</h1>
        <p className="lead">Δες αν οι συνδέσεις των προμηθευτών ενημερώνονται σωστά και ποιο πρόβλημα χρειάζεται πράγματι δική σου προσοχή.</p>
        <div className="vendor-page-action-row">
          <Link className="button button-secondary" href="/vendor/dropshipping">← Επιστροφή στο Dropshipping</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Προμηθευτές", value: suppliers.length },
      { label: "Υγιείς", value: healthy, tone: healthy ? "positive" : "default" },
      { label: "Χρειάζονται προσοχή", value: attention, tone: attention ? "attention" : "positive" },
      { label: "Χωρίς δεδομένα ελέγχου", value: unknown, tone: unknown ? "attention" : "positive" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Έλεγχος προϊόντων" title="Τι χρειάζεται ενέργεια" note="Οι αριθμοί αφορούν τα προϊόντα που ήδη είναι συνδεδεμένα με το κατάστημά σου. Άνοιξε μόνο τις κατηγορίες που έχουν πραγματική εκκρεμότητα." />
      <WorkspaceMetricStrip items={[
        { label: "Χωρίς στοιχεία διαθεσιμότητας", value: missingAvailabilityTelemetryProducts, tone: missingAvailabilityTelemetryProducts ? "attention" : "positive" },
        { label: "Δημοσιευμένα χωρίς διαθεσιμότητα", value: publishedUnavailableProducts, tone: publishedUnavailableProducts ? "attention" : "positive" },
        { label: "Χωρίς τιμή αγοράς", value: productsMissingCost, tone: productsMissingCost ? "attention" : "positive" }
      ]} />
      <p style={{ marginTop: 12 }}><small>Κάθε ένδειξη που χρειάζεται ενέργεια ανοίγει το σωστό σύνολο προϊόντων στη διαχείριση dropshipping, ώστε να χρησιμοποιήσεις την ίδια αναζήτηση και τις ίδιες μαζικές ενέργειες.</small></p>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Συνδέσεις προμηθευτών" title="Πότε ενημερώθηκαν τελευταία" note="Ένα προϊόν που δεν άλλαξε μπορεί να μην ξαναγραφτεί για αρκετές ώρες χωρίς αυτό να σημαίνει πρόβλημα. Εδώ ξεχωρίζουμε την πραγματική αστοχία σύνδεσης από την απλή απουσία αλλαγών." />
      <div className="vendor-card-grid">
        {suppliers.map(({ supplier, health }) => {
          const unchangedMaterializationRows = supplier.staleCatalogueProducts ?? 0;
          const missingAvailability = supplier.missingAvailabilityTelemetryProducts ?? 0;
          const publishedUnavailable = supplier.publishedUnavailableProducts ?? 0;
          const missingCost = Math.max(0, supplier.totalProducts - supplier.productsWithCost);
          const hasCatalogueIssues = missingAvailability > 0 || publishedUnavailable > 0 || missingCost > 0;
          const supplierHref = supplierWorkspaceUrl(supplier.code);
          const missingAvailabilityHref = supplierWorkspaceUrl(supplier.code, { availability: "missing_telemetry" });
          const publishedUnavailableHref = supplierWorkspaceUrl(supplier.code, { publication: "published", availability: "out_of_stock" });
          const missingCostHref = supplierWorkspaceUrl(supplier.code, { cost: "missing_cost" });
          return <article className="workspace-queue-card" key={supplier.id}>
            <div className="workspace-queue-head">
              <div><strong>{supplier.displayName}</strong><small>Συνδεδεμένος προμηθευτής</small></div>
              <span className="vendor-merchant-status">{health.label}</span>
            </div>
            <p style={{ marginTop: 10 }}>{health.detail}</p>
            {!supplier.active ? <div className="workspace-compact-list" style={{ marginTop: 12 }}>
              <div className="workspace-compact-row"><strong>Γιατί δεν ενημερώνεται;</strong><span>Ανενεργός προμηθευτής</span><small>Οι αυτόματες ενημερώσεις παραμένουν σταματημένες όσο ο προμηθευτής είναι ανενεργός.</small></div>
            </div> : null}
            <div className="workspace-compact-list" style={{ marginTop: 12 }}>
              <div className="workspace-compact-row"><strong>Προμηθευτής</strong><span>{supplier.active ? "Ενεργός" : "Ανενεργός"}</span></div>
              <div className="workspace-compact-row"><strong>Αυτόματη ενημέρωση καταλόγου</strong><span>{supplier.catalogueSyncEnabled ? "Ενεργή" : "Ανενεργή"}</span></div>
              <div className="workspace-compact-row"><strong>Αποστολή παραγγελιών στον προμηθευτή</strong><span>{supplier.orderForwardingEnabled ? "Ενεργή" : "Ανενεργή"}</span></div>
              <div className="workspace-compact-row"><strong>Ενημέρωση παρακολούθησης αποστολής</strong><span>{supplier.trackingSyncEnabled ? "Ενεργή" : "Ανενεργή"}</span></div>
              <div className="workspace-compact-row"><strong>Τελευταίος έλεγχος</strong><span>{date(supplier.lastHealthcheckAt)}</span><small>{age(health.healthcheckAgeMinutes)}</small></div>
              <div className="workspace-compact-row"><strong>Αποτέλεσμα τελευταίου ελέγχου</strong><span>{supplier.lastHealthcheckOk === true ? "Επιτυχής" : supplier.lastHealthcheckOk === false ? "Αποτυχία" : "Άγνωστο"}</span></div>
              <div className="workspace-compact-row"><strong>Τελευταία ενημέρωση καταλόγου</strong><span>{date(supplier.lastCatalogueSyncAt)}</span><small>{age(health.catalogueSyncAgeMinutes)}</small></div>
              <div className="workspace-compact-row"><strong>Προϊόντα</strong><span>{supplier.totalProducts}</span><small>{supplier.availableProducts} διαθέσιμα από προμηθευτή · {supplier.publishedProducts} δημοσιευμένα</small></div>
            </div>
            <div className="workspace-compact-list" style={{ marginTop: 12 }}>
              <div className="workspace-compact-row"><strong>Χωρίς νέα αλλαγή για πάνω από 12 ώρες</strong><span>{unchangedMaterializationRows}</span><small>Ενημερωτικό μόνο. Δεν θεωρείται πρόβλημα όταν ο προμηθευτής δεν έχει στείλει αλλαγή.</small></div>
              <div className="workspace-compact-row"><strong>Χωρίς στοιχεία διαθεσιμότητας</strong><span>{missingAvailability}</span>{missingAvailability > 0 ? <Link href={missingAvailabilityHref}>Προβολή προϊόντων</Link> : null}</div>
              <div className="workspace-compact-row"><strong>Δημοσιευμένα χωρίς διαθεσιμότητα</strong><span>{publishedUnavailable}</span>{publishedUnavailable > 0 ? <Link href={publishedUnavailableHref}>Προβολή προϊόντων</Link> : null}</div>
              <div className="workspace-compact-row"><strong>Χωρίς τιμή αγοράς</strong><span>{missingCost}</span>{missingCost > 0 ? <Link href={missingCostHref}>Προβολή προϊόντων</Link> : null}</div>
            </div>
            <p className="vendor-muted-explainer">{hasCatalogueIssues ? "Υπάρχουν προϊόντα που χρειάζονται έλεγχο ή την επόμενη ενημέρωση από τον προμηθευτή." : "Δεν εντοπίστηκε πρόβλημα προϊόντων που χρειάζεται ενέργεια για αυτόν τον προμηθευτή."}</p>
            <Link className="button button-secondary" style={{ marginTop: 12 }} href={supplierHref}>Άνοιγμα προμηθευτή</Link>
          </article>;
        })}
        {!suppliers.length ? <article className="workspace-queue-card"><strong>Δεν υπάρχει σύνδεση προμηθευτή.</strong><p>Το κατάστημα λειτουργεί με dropshipping, αλλά δεν βρέθηκε προμηθευτής για παρακολούθηση.</p></article> : null}
      </div>
    </section>
  </main>;
}
