import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { isDropshippingOnlyVendor } from "../../../../lib/vendor-dropshipping-access";
import { vendorDropshippingActivity } from "../../../../lib/vendor-dropshipping-activity";
import { getVendorSession } from "../../../../lib/vendor-session";

export const metadata: Metadata = { title: "Dropshipping activity", robots: { index: false, follow: false } };

const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value))
  : "—";

export default async function DropshippingActivityPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  if (!await isDropshippingOnlyVendor(principal.vendorId)) redirect("/vendor");

  const activity = await vendorDropshippingActivity(principal.vendorId ?? "", 25);
  const offers1h = activity.suppliers.reduce((sum, supplier) => sum + supplier.offerUpdates1h, 0);
  const pricing1h = activity.suppliers.reduce((sum, supplier) => sum + supplier.pricingUpdates1h, 0);

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Dropshipping Control Centre</div>
        <h1>Activity</h1>
        <p className="lead">Χειροκίνητες αλλαγές προϊόντων και συγκεντρωτική κίνηση supplier/pricing syncs, χωρίς να γεμίζει το timeline με χιλιάδες worker updates.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Link className="button button-secondary" href="/vendor/dropshipping">← Dropshipping</Link>
          <Link className="button button-secondary" href="/vendor/dropshipping/health">Feed health</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Manual visibility 7ημ.", value: activity.manualVisibilityEvents7d },
      { label: "Supplier records 1ωρ.", value: offers1h, tone: offers1h ? "positive" : "default" },
      { label: "Pricing refreshes 1ωρ.", value: pricing1h, tone: pricing1h ? "positive" : "default" },
      { label: "Suppliers", value: activity.suppliers.length }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Vendor actions" title="Πρόσφατες χειροκίνητες αλλαγές" note="Εμφανίζονται μόνο audited product visibility actions από το vendor dashboard. Αυτό δεν αναμειγνύεται με background sync activity." />
      <div style={{ display: "grid", gap: 10 }}>
        {activity.visibilityEvents.map((event) => <article className="workspace-queue-card" key={event.id}>
          <div className="workspace-queue-head">
            <div><strong>{event.title}</strong><small>{event.supplierName} · {date(event.createdAt)}</small></div>
            <span className="vendor-merchant-status">{event.visible ? "Published" : "Hidden"}</span>
          </div>
          <p style={{ marginTop: 8 }}>{event.visible ? "Το προϊόν δημοσιεύτηκε χειροκίνητα." : "Το προϊόν κρύφτηκε χειροκίνητα."}</p>
        </article>)}
        {!activity.visibilityEvents.length ? <article className="workspace-queue-card"><strong>Δεν υπάρχουν ακόμη audited χειροκίνητες αλλαγές.</strong><p>Οι μελλοντικές Public/Hidden ενέργειες προϊόντων θα εμφανίζονται εδώ.</p></article> : null}
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Background operations" title="Supplier & pricing refresh activity" note="Οι worker ενημερώσεις συνοψίζονται ανά supplier. Τα counts είναι operational telemetry, όχι ξεχωριστές χειροκίνητες ενέργειες." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        {activity.suppliers.map((supplier) => <article className="workspace-queue-card" key={supplier.supplierCode}>
          <div className="workspace-queue-head"><div><strong>{supplier.supplierName}</strong><small>{supplier.supplierCode}</small></div></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Τελευταίο catalogue sync</strong><span>{date(supplier.lastCatalogueSyncAt)}</span></div>
            <div className="workspace-compact-row"><strong>Supplier records / 1ωρ.</strong><span>{supplier.offerUpdates1h}</span><small>{supplier.offerUpdates24h} / 24ωρ.</small></div>
            <div className="workspace-compact-row"><strong>Τελευταίο pricing refresh</strong><span>{date(supplier.lastPricingUpdateAt)}</span></div>
            <div className="workspace-compact-row"><strong>Pricing records / 1ωρ.</strong><span>{supplier.pricingUpdates1h}</span><small>{supplier.pricingUpdates24h} / 24ωρ.</small></div>
          </div>
          <Link className="button button-secondary" style={{ marginTop: 12 }} href={`/vendor/dropshipping?supplier=${encodeURIComponent(supplier.supplierCode)}`}>Άνοιγμα supplier</Link>
        </article>)}
        {!activity.suppliers.length ? <article className="workspace-queue-card"><strong>Δεν υπάρχει supplier activity.</strong><p>Δεν βρέθηκε Dropshipping supplier mapping για αυτό το vendor.</p></article> : null}
      </div>
    </section>
  </main>;
}
