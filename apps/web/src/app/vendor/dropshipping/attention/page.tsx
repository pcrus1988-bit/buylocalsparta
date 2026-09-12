import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { isDropshippingOnlyVendor } from "../../../../lib/vendor-dropshipping-access";
import { vendorDropshippingAttention, type DropshippingAttentionKind } from "../../../../lib/vendor-dropshipping-attention";
import { getVendorSession } from "../../../../lib/vendor-session";

export const metadata: Metadata = { title: "Dropshipping · Needs attention", robots: { index: false, follow: false } };

const money = (minor: number | null) => minor == null
  ? "—"
  : new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value))
  : "—";

const issueCopy: Record<DropshippingAttentionKind, Readonly<{ label: string; explanation: string }>> = {
  published_unavailable: {
    label: "Published · unavailable",
    explanation: "Το προϊόν είναι public αλλά το supplier cache το δείχνει μη διαθέσιμο. Το checkout εξακολουθεί να επανελέγχει τον supplier, όμως η storefront κατάσταση χρειάζεται έλεγχο."
  },
  missing_cost: {
    label: "Missing buying price",
    explanation: "Δεν υπάρχει έγκυρη supplier buying price, άρα δεν μπορεί να υπολογιστεί ασφαλής αυτόματη τιμή."
  },
  stale_availability: {
    label: "Stale availability",
    explanation: "Η διαθεσιμότητα δεν έχει επαληθευτεί τις τελευταίες 24 ώρες. Έλεγξε πρώτα το feed health πριν αλλάξεις χειροκίνητα stock."
  },
  withdrawn: {
    label: "Removed by supplier",
    explanation: "Το προϊόν εμφανίστηκε στο deleted feed του supplier και έχει αποσυρθεί αυτόματα από τη Dropshipping προσφορά."
  },
  overpriced: {
    label: "OVERPRICED",
    explanation: "Η υπολογισμένη τιμή είναι πάνω από το supplier MSRP. Αυτό είναι diagnostic και δεν μπλοκάρει αυτόματα την τιμή, σύμφωνα με την ενεργή NOVA πολιτική."
  }
};

export default async function DropshippingAttentionPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  if (!await isDropshippingOnlyVendor(principal.vendorId)) redirect("/vendor");

  const workspace = await vendorDropshippingAttention(principal.vendorId ?? "", 50);
  const counts = workspace.counts;

  return <main className="vendor-app">
    <VendorWorkspaceHeader />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Dropshipping Control Centre</div>
        <h1>Needs attention</h1>
        <p className="lead">Μία συγκεντρωτική ουρά για πραγματικά operational προβλήματα: public προϊόντα χωρίς διαθεσιμότητα, missing cost, stale availability, supplier withdrawals και ενεργά OVERPRICED προϊόντα.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Link className="button button-secondary" href="/vendor/dropshipping">← Dropshipping</Link>
          <Link className="button button-secondary" href="/vendor/dropshipping/health">Feed health</Link>
          <Link className="button button-secondary" href="/vendor/dropshipping/activity">Activity</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Public unavailable", value: counts.publishedUnavailable, tone: counts.publishedUnavailable ? "attention" : "positive" },
      { label: "Missing cost", value: counts.missingCost, tone: counts.missingCost ? "attention" : "positive" },
      { label: "Stale availability", value: counts.staleAvailability, tone: counts.staleAvailability ? "attention" : "positive" },
      { label: "Supplier withdrawals", value: counts.withdrawn, tone: counts.withdrawn ? "attention" : "default" },
      { label: "Active OVERPRICED", value: counts.overpriced, tone: counts.overpriced ? "attention" : "positive" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Review queue"
        title="Προϊόντα που χρειάζονται έλεγχο"
        note="Η σειρά δίνει προτεραιότητα σε public-but-unavailable, missing cost και stale availability. Supplier withdrawals και OVERPRICED diagnostics ακολουθούν."
      />

      <div style={{ display: "grid", gap: 12 }}>
        {workspace.items.map((item) => {
          const issue = issueCopy[item.kind];
          return <article className="workspace-queue-card" key={`${item.kind}:${item.offerId}`}>
            <div className="workspace-queue-head">
              <div>
                <strong>{item.title}</strong>
                <small>{item.supplierName} · update {date(item.updatedAt)}</small>
              </div>
              <span className="vendor-merchant-status">{issue.label}</span>
            </div>
            <p style={{ marginTop: 8 }}>{issue.explanation}</p>
            <div className="workspace-compact-list" style={{ marginTop: 10 }}>
              <div className="workspace-compact-row"><strong>Buying price</strong><span>{money(item.supplierCostMinor)}</span></div>
              <div className="workspace-compact-row"><strong>Final price</strong><span>{money(item.customerPriceMinor)}</span></div>
              <div className="workspace-compact-row"><strong>MSRP</strong><span>{money(item.msrpMinor)}</span></div>
              <div className="workspace-compact-row"><strong>Availability checked</strong><span>{date(item.availabilityCheckedAt)}</span></div>
              {item.deletedAt ? <div className="workspace-compact-row"><strong>Supplier deleted</strong><span>{date(item.deletedAt)}</span></div> : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <Link className="button button-secondary" href={`/vendor/dropshipping?q=${encodeURIComponent(item.title)}&supplier=${encodeURIComponent(item.supplierCode)}`}>Άνοιγμα προϊόντος</Link>
              {item.kind === "published_unavailable" ? <Link className="button button-secondary" href={`/vendor/dropshipping?supplier=${encodeURIComponent(item.supplierCode)}&publication=published&availability=out_of_stock`}>Όλα τα public unavailable</Link> : null}
              {item.kind === "missing_cost" ? <Link className="button button-secondary" href={`/vendor/dropshipping?supplier=${encodeURIComponent(item.supplierCode)}&cost=missing_cost`}>Όλα τα missing cost</Link> : null}
              {item.kind === "overpriced" ? <Link className="button button-secondary" href={`/vendor/dropshipping?supplier=${encodeURIComponent(item.supplierCode)}&pricingFlag=OVERPRICED&publication=published`}>Όλα τα ενεργά OVERPRICED</Link> : null}
            </div>
          </article>;
        })}

        {!workspace.items.length ? <article className="workspace-queue-card">
          <strong>Δεν υπάρχει κάτι που να χρειάζεται άμεσο έλεγχο.</strong>
          <p>Τα supplier feeds, buying prices, availability και ενεργά pricing diagnostics δεν έχουν αυτή τη στιγμή actionable exception.</p>
        </article> : null}
      </div>
    </section>
  </main>;
}
