import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { dropshippingFeedHealth } from "../../../../lib/dropshipping-feed-health";
import { isDropshippingOnlyVendor } from "../../../../lib/vendor-dropshipping-access";
import { vendorDropshippingWorkspace } from "../../../../lib/vendor-dropshipping-service";
import { getVendorSession } from "../../../../lib/vendor-session";

export const metadata: Metadata = { title: "Dropshipping feed health", robots: { index: false, follow: false } };

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

export default async function DropshippingFeedHealthPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  if (!await isDropshippingOnlyVendor(principal.vendorId)) redirect("/vendor");

  const workspace = await vendorDropshippingWorkspace(principal.vendorId ?? "", { page: 1, pageSize: 20 });
  const suppliers = workspace.suppliers.map((supplier) => ({ supplier, health: dropshippingFeedHealth(supplier) }));
  const healthy = suppliers.filter(({ health }) => health.status === "healthy").length;
  const attention = suppliers.filter(({ health }) => health.status === "stale" || health.status === "degraded").length;
  const unknown = suppliers.filter(({ health }) => health.status === "unknown").length;

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Dropshipping Control Centre</div>
        <h1>Feed health</h1>
        <p className="lead">Πραγματική φρεσκάδα supplier healthchecks και catalogue syncs. Παλιές χρονοσφραγίδες δεν εμφανίζονται ως πράσινο health.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Link className="button button-secondary" href="/vendor/dropshipping">← Επιστροφή στο Dropshipping</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Suppliers", value: suppliers.length },
      { label: "Healthy", value: healthy, tone: healthy ? "positive" : "default" },
      { label: "Χρειάζονται προσοχή", value: attention, tone: attention ? "attention" : "positive" },
      { label: "Άγνωστο telemetry", value: unknown, tone: unknown ? "attention" : "positive" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Sync operations" title="Supplier feed freshness" note="Catalogue sync θεωρείται stale μετά από 12 ώρες και supplier healthcheck μετά από 24 ώρες. Αποτυχημένο healthcheck εμφανίζεται άμεσα ως πρόβλημα." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        {suppliers.map(({ supplier, health }) => <article className="workspace-queue-card" key={supplier.id}>
          <div className="workspace-queue-head">
            <div><strong>{supplier.displayName}</strong><small>{supplier.code} · {supplier.providerKind}</small></div>
            <span className="vendor-merchant-status">{health.label}</span>
          </div>
          <p style={{ marginTop: 10 }}>{health.detail}</p>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Supplier</strong><span>{supplier.active ? "Ενεργός" : "Ανενεργός"}</span></div>
            <div className="workspace-compact-row"><strong>Catalogue sync</strong><span>{supplier.catalogueSyncEnabled ? "Enabled" : "Disabled"}</span></div>
            <div className="workspace-compact-row"><strong>Order forwarding</strong><span>{supplier.orderForwardingEnabled ? "Enabled" : "Disabled"}</span></div>
            <div className="workspace-compact-row"><strong>Tracking sync</strong><span>{supplier.trackingSyncEnabled ? "Enabled" : "Disabled"}</span></div>
            <div className="workspace-compact-row"><strong>Τελευταίο healthcheck</strong><span>{date(supplier.lastHealthcheckAt)}</span><small>{age(health.healthcheckAgeMinutes)}</small></div>
            <div className="workspace-compact-row"><strong>Healthcheck result</strong><span>{supplier.lastHealthcheckOk === true ? "OK" : supplier.lastHealthcheckOk === false ? "FAILED" : "Άγνωστο"}</span></div>
            <div className="workspace-compact-row"><strong>Τελευταίο catalogue sync</strong><span>{date(supplier.lastCatalogueSyncAt)}</span><small>{age(health.catalogueSyncAgeMinutes)}</small></div>
            <div className="workspace-compact-row"><strong>Προϊόντα</strong><span>{supplier.totalProducts}</span><small>{supplier.availableProducts} supplier-available · {supplier.publishedProducts} published</small></div>
          </div>
          <Link className="button button-secondary" style={{ marginTop: 12 }} href={`/vendor/dropshipping?supplier=${encodeURIComponent(supplier.code)}`}>Άνοιγμα supplier workspace</Link>
        </article>)}
        {!suppliers.length ? <article className="workspace-queue-card"><strong>Δεν υπάρχει supplier mapping.</strong><p>Το account είναι Dropshipping-only, αλλά δεν βρέθηκε supplier για παρακολούθηση.</p></article> : null}
      </div>
    </section>
  </main>;
}
