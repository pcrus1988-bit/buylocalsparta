import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { isDropshippingOnlyVendor } from "../../../../lib/vendor-dropshipping-access";
import { vendorDropshippingAttention, type DropshippingAttentionKind } from "../../../../lib/vendor-dropshipping-attention";
import { getVendorSession } from "../../../../lib/vendor-session";

export const metadata: Metadata = { title: "Προϊόντα προμηθευτών · Χρειάζονται έλεγχο", robots: { index: false, follow: false } };

const money = (minor: number | null) => minor == null
  ? "—"
  : new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value))
  : "—";

const issueCopy: Record<DropshippingAttentionKind, Readonly<{ label: string; explanation: string }>> = {
  published_unavailable: {
    label: "Δημοσιευμένο χωρίς διαθεσιμότητα",
    explanation: "Το προϊόν είναι δημοσιευμένο, αλλά τα τελευταία στοιχεία του προμηθευτή το δείχνουν μη διαθέσιμο. Η διαθεσιμότητα επανελέγχεται πριν ολοκληρωθεί η αγορά, όμως η δημόσια κατάσταση χρειάζεται έλεγχο."
  },
  missing_cost: {
    label: "Χωρίς τιμή αγοράς",
    explanation: "Δεν υπάρχει έγκυρη τιμή αγοράς από τον προμηθευτή, άρα δεν μπορεί να υπολογιστεί με ασφάλεια η τελική τιμή."
  },
  pricing_pending: {
    label: "Τιμολόγηση σε αναμονή",
    explanation: "Υπάρχει τιμή αγοράς από τον προμηθευτή, αλλά ο αυτόματος υπολογισμός τελικής τιμής δεν έχει ακόμη ολοκληρωθεί. Το προϊόν δεν δημοσιεύεται αυτόματα μέχρι να τελειώσει ο έλεγχος."
  },
  stale_availability: {
    label: "Παλιός έλεγχος διαθεσιμότητας",
    explanation: "Η διαθεσιμότητα δεν έχει επαληθευτεί τις τελευταίες 24 ώρες. Έλεγξε πρώτα τον συγχρονισμό του προμηθευτή πριν αλλάξεις χειροκίνητα το απόθεμα."
  },
  withdrawn: {
    label: "Αποσύρθηκε από προμηθευτή",
    explanation: "Ο προμηθευτής έχει αποσύρει το προϊόν και η αντίστοιχη προσφορά έχει αφαιρεθεί αυτόματα από τη δημόσια πώληση."
  },
  overpriced: {
    label: "Πάνω από προτεινόμενη λιανική",
    explanation: "Η υπολογισμένη τιμή είναι πάνω από την προτεινόμενη λιανική τιμή του προμηθευτή. Η ένδειξη είναι προειδοποίηση και δεν αλλάζει αυτόματα την τιμή."
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
        <div className="eyebrow">Προϊόντα προμηθευτών</div>
        <h1>Χρειάζονται προσοχή</h1>
        <p className="lead">Μία συγκεντρωτική ουρά για πραγματικά προβλήματα: δημοσιευμένα προϊόντα χωρίς διαθεσιμότητα, ελλιπείς τιμές αγοράς, εκκρεμή αυτόματη τιμολόγηση, παλιά στοιχεία διαθεσιμότητας, αποσύρσεις προμηθευτή και προϊόντα με ένδειξη υψηλής τιμής.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Link className="button button-secondary" href="/vendor/dropshipping">← Προϊόντα προμηθευτών</Link>
          <Link className="button button-secondary" href="/vendor/dropshipping/health">Συγχρονισμός</Link>
          <Link className="button button-secondary" href="/vendor/dropshipping/activity">Ιστορικό αλλαγών</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Δημοσιευμένα χωρίς διαθεσιμότητα", value: counts.publishedUnavailable, tone: counts.publishedUnavailable ? "attention" : "positive" },
      { label: "Χωρίς τιμή αγοράς", value: counts.missingCost, tone: counts.missingCost ? "attention" : "positive" },
      { label: "Τιμολόγηση σε αναμονή", value: counts.pricingPending, tone: counts.pricingPending ? "attention" : "positive" },
      { label: "Παλιή διαθεσιμότητα", value: counts.staleAvailability, tone: counts.staleAvailability ? "attention" : "positive" },
      { label: "Αποσύρσεις προμηθευτή", value: counts.withdrawn, tone: counts.withdrawn ? "attention" : "default" },
      { label: "Πάνω από προτεινόμενη λιανική", value: counts.overpriced, tone: counts.overpriced ? "attention" : "positive" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Έλεγχος"
        title="Προϊόντα που χρειάζονται έλεγχο"
        note="Η σειρά δίνει προτεραιότητα σε προβλήματα που μπορούν να επηρεάσουν άμεσα τη διαθεσιμότητα ή την τιμή προς τον πελάτη."
      />

      <div style={{ display: "grid", gap: 12 }}>
        {workspace.items.map((item) => {
          const issue = issueCopy[item.kind];
          return <article className="workspace-queue-card" key={`${item.kind}:${item.offerId}`}>
            <div className="workspace-queue-head">
              <div>
                <strong>{item.title}</strong>
                <small>{item.supplierName} · ενημέρωση {date(item.updatedAt)}</small>
              </div>
              <span className="vendor-merchant-status">{issue.label}</span>
            </div>
            <p style={{ marginTop: 8 }}>{issue.explanation}</p>
            <div className="workspace-compact-list" style={{ marginTop: 10 }}>
              <div className="workspace-compact-row"><strong>Τιμή αγοράς</strong><span>{money(item.supplierCostMinor)}</span></div>
              <div className="workspace-compact-row"><strong>Τελική τιμή</strong><span>{money(item.customerPriceMinor)}</span></div>
              <div className="workspace-compact-row"><strong>Προτεινόμενη λιανική</strong><span>{money(item.msrpMinor)}</span></div>
              <div className="workspace-compact-row"><strong>Τελευταίος έλεγχος διαθεσιμότητας</strong><span>{date(item.availabilityCheckedAt)}</span></div>
              {item.deletedAt ? <div className="workspace-compact-row"><strong>Αφαιρέθηκε από τον προμηθευτή</strong><span>{date(item.deletedAt)}</span></div> : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <Link className="button button-secondary" href={`/vendor/dropshipping?q=${encodeURIComponent(item.title)}&supplier=${encodeURIComponent(item.supplierCode)}`}>Άνοιγμα προϊόντος</Link>
              {item.kind === "published_unavailable" ? <Link className="button button-secondary" href={`/vendor/dropshipping?supplier=${encodeURIComponent(item.supplierCode)}&publication=published&availability=out_of_stock`}>Όλα τα δημοσιευμένα χωρίς απόθεμα</Link> : null}
              {item.kind === "missing_cost" ? <Link className="button button-secondary" href={`/vendor/dropshipping?supplier=${encodeURIComponent(item.supplierCode)}&cost=missing_cost`}>Όλα χωρίς τιμή αγοράς</Link> : null}
              {item.kind === "pricing_pending" ? <Link className="button button-secondary" href={`/vendor/dropshipping?supplier=${encodeURIComponent(item.supplierCode)}&pricingFlag=PENDING`}>Όλα με τιμολόγηση σε αναμονή</Link> : null}
              {item.kind === "overpriced" ? <Link className="button button-secondary" href={`/vendor/dropshipping?supplier=${encodeURIComponent(item.supplierCode)}&pricingFlag=OVERPRICED&publication=published`}>Όλα με ένδειξη υψηλής τιμής</Link> : null}
            </div>
          </article>;
        })}

        {!workspace.items.length ? <article className="workspace-queue-card">
          <strong>Δεν υπάρχει κάτι που να χρειάζεται άμεσο έλεγχο.</strong>
          <p>Οι ροές προμηθευτών, οι τιμές αγοράς, η αυτόματη τιμολόγηση και η διαθεσιμότητα δεν έχουν αυτή τη στιγμή εκκρεμότητα που απαιτεί ενέργεια.</p>
        </article> : null}
      </div>
    </section>
  </main>;
}