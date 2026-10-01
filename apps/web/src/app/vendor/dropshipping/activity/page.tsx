import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { isDropshippingOnlyVendor } from "../../../../lib/vendor-dropshipping-access";
import { vendorDropshippingActivity } from "../../../../lib/vendor-dropshipping-activity";
import { getVendorSession } from "../../../../lib/vendor-session";

export const metadata: Metadata = { title: "Ιστορικό αλλαγών προϊόντων προμηθευτών", robots: { index: false, follow: false } };

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
        <div className="eyebrow">Προϊόντα προμηθευτών</div>
        <h1>Ιστορικό αλλαγών</h1>
        <p className="lead">Χειροκίνητες αλλαγές προϊόντων και συγκεντρωτική κίνηση συγχρονισμών προμηθευτή και τιμολόγησης, χωρίς να γεμίζει το ιστορικό με χιλιάδες τεχνικές ενημερώσεις.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Link className="button button-secondary" href="/vendor/dropshipping">← Προϊόντα προμηθευτών</Link>
          <Link className="button button-secondary" href="/vendor/dropshipping/health">Συγχρονισμός</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Χειροκίνητες αλλαγές 7ημ.", value: activity.manualVisibilityEvents7d },
      { label: "Εγγραφές προμηθευτών 1ωρ.", value: offers1h, tone: offers1h ? "positive" : "default" },
      { label: "Ενημερώσεις τιμών 1ωρ.", value: pricing1h, tone: pricing1h ? "positive" : "default" },
      { label: "Προμηθευτές", value: activity.suppliers.length }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ενέργειες καταστήματος" title="Πρόσφατες χειροκίνητες αλλαγές" note="Εμφανίζονται μόνο καταγεγραμμένες αλλαγές ορατότητας προϊόντων από το πίνακα συνεργάτη. Αυτό δεν αναμειγνύεται με αυτόματους συγχρονισμούς." />
      <div style={{ display: "grid", gap: 10 }}>
        {activity.visibilityEvents.map((event) => <article className="workspace-queue-card" key={event.id}>
          <div className="workspace-queue-head">
            <div><strong>{event.title}</strong><small>{event.supplierName} · {date(event.createdAt)}</small></div>
            <span className="vendor-merchant-status">{event.visible ? "Δημοσιευμένο" : "Κρυφό"}</span>
          </div>
          <p style={{ marginTop: 8 }}>{event.visible ? "Το προϊόν δημοσιεύτηκε χειροκίνητα." : "Το προϊόν κρύφτηκε χειροκίνητα."}</p>
        </article>)}
        {!activity.visibilityEvents.length ? <article className="workspace-queue-card"><strong>Δεν υπάρχουν ακόμη καταγεγραμμένες χειροκίνητες αλλαγές.</strong><p>Οι μελλοντικές ενέργειες δημοσίευσης/απόκρυψης προϊόντων θα εμφανίζονται εδώ.</p></article> : null}
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Αυτόματες λειτουργίες" title="Συγχρονισμοί προμηθευτών & τιμών" note="Οι τεχνικές ενημερώσεις συνοψίζονται ανά προμηθευτή. Οι μετρήσεις είναι λειτουργικά στοιχεία, όχι ξεχωριστές χειροκίνητες ενέργειες." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        {activity.suppliers.map((supplier) => <article className="workspace-queue-card" key={supplier.supplierCode}>
          <div className="workspace-queue-head"><div><strong>{supplier.supplierName}</strong><small>{supplier.supplierCode}</small></div></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Τελευταίος συγχρονισμός καταλόγου</strong><span>{date(supplier.lastCatalogueSyncAt)}</span></div>
            <div className="workspace-compact-row"><strong>Εγγραφές προμηθευτή / 1ωρ.</strong><span>{supplier.offerUpdates1h}</span><small>{supplier.offerUpdates24h} / 24ωρ.</small></div>
            <div className="workspace-compact-row"><strong>Τελευταία ενημέρωση τιμών</strong><span>{date(supplier.lastPricingUpdateAt)}</span></div>
            <div className="workspace-compact-row"><strong>Εγγραφές τιμών / 1ωρ.</strong><span>{supplier.pricingUpdates1h}</span><small>{supplier.pricingUpdates24h} / 24ωρ.</small></div>
          </div>
          <Link className="button button-secondary" style={{ marginTop: 12 }} href={`/vendor/dropshipping?supplier=${encodeURIComponent(supplier.supplierCode)}`}>Άνοιγμα προμηθευτή</Link>
        </article>)}
        {!activity.suppliers.length ? <article className="workspace-queue-card"><strong>Δεν υπάρχει δραστηριότητα προμηθευτή.</strong><p>Δεν βρέθηκε σύνδεση προμηθευτή για αυτό το κατάστημα.</p></article> : null}
      </div>
    </section>
  </main>;
}
