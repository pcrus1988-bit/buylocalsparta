"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Procurement = Readonly<{
  id: string;
  orderId: string;
  status: string;
  invoiceNumber?: string;
  gross: string;
  serviceFeeGross: string;
  shippingReimbursement: string;
  payable: string;
  payoutReference?: string;
  updatedAt: number;
}>;

type Settlement = Readonly<{
  id: string;
  batchNumber: string;
  status: string;
  totalPayable: string;
  periodStart: number;
  periodEnd: number;
  paidAt?: number;
  payoutReference?: string;
}>;

type CommercialTerms = Readonly<{
  agreementCode: string;
  status: string;
  commissionRateBps: number;
  commissionBasis: string;
  commissionTaxMode: string;
  commissionTaxRateBps: number;
  commissionAppliesToShipping: boolean;
  listingFeeMinor: number;
  recurringFeeMinor: number;
  recurringFeePeriod?: string;
  startsAt?: number;
  endsAt?: number;
  signedAt?: number;
  activatedAt?: number;
}>;

type Workspace = Readonly<{
  csrfToken: string;
  procurements: readonly Procurement[];
  settlements: readonly Settlement[];
  commercialTerms?: CommercialTerms;
}>;

const PROCUREMENT_STATUS: Record<string, string> = {
  accrued: "Χρειάζεται τιμολόγιο",
  matched: "Τιμολόγιο ελέγχθηκε",
  disputed: "Σε έλεγχο",
  payable: "Έτοιμο για πληρωμή",
  settled: "Πληρώθηκε",
  reversed: "Αντιλογισμένο"
};

const SETTLEMENT_STATUS: Record<string, string> = {
  draft: "Σε προετοιμασία",
  submitted: "Υποβλήθηκε",
  approved: "Εγκρίθηκε",
  payable: "Έτοιμο για πληρωμή",
  paid: "Πληρώθηκε",
  settled: "Ολοκληρώθηκε",
  closed: "Έκλεισε",
  failed: "Απέτυχε"
};

const AGREEMENT_STATUS: Record<string, string> = {
  draft: "Πρόχειρη",
  data_complete: "Στοιχεία ολοκληρωμένα",
  generated: "Έχει δημιουργηθεί",
  sent: "Έχει σταλεί",
  signed_received: "Παραλήφθηκε υπογεγραμμένη",
  verified: "Επαληθευμένη",
  active: "Ενεργή",
  suspended: "Σε αναστολή",
  terminated: "Τερματισμένη"
};

function statusLabel(status: string, labels: Record<string, string>) {
  return labels[status] ?? status;
}

function date(value: number) {
  return new Date(value).toLocaleDateString("el-GR");
}

function dateTime(value: number) {
  return new Date(value).toLocaleString("el-GR");
}

function euroMinor(value: number) {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(value / 100);
}

function bps(value: number) {
  return `${new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 }).format(value / 100)}%`;
}

function recurringPeriod(value?: string) {
  if (value === "month" || value === "monthly") return "μήνα";
  if (value === "year" || value === "annual" || value === "yearly") return "έτος";
  return value ?? "περίοδο";
}

export function VendorFinanceClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const invoiceNeeded = initial.procurements.filter((item) => ["accrued", "matched", "disputed"].includes(item.status) && !item.invoiceNumber).length;
  const review = initial.procurements.filter((item) => ["matched", "disputed"].includes(item.status)).length;
  const payable = initial.procurements.filter((item) => item.status === "payable").length;
  const paid = initial.settlements.filter((item) => ["paid", "settled", "closed"].includes(item.status)).length;
  const hasFinanceActivity = initial.procurements.length > 0 || initial.settlements.length > 0;

  async function submit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const grossEuros = Number(String(form.get("grossEuros") ?? "").replace(",", "."));
    if (!Number.isFinite(grossEuros) || grossEuros < 0) {
      setError("Συμπλήρωσε έγκυρο μικτό ποσό τιμολογίου σε ευρώ.");
      return;
    }

    setBusy(id);
    setError("");
    try {
      const response = await fetch("/api/vendor/finance/invoices", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken },
        body: JSON.stringify({
          procurementId: id,
          invoiceNumber: form.get("number"),
          invoiceGrossMinor: Math.round(grossEuros * 100)
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Η υποβολή τιμολογίου απέτυχε");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η υποβολή τιμολογίου απέτυχε");
    } finally {
      setBusy("");
    }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}

    <WorkspaceMetricStrip items={[
      { label: "Χρειάζεται τιμολόγιο", value: invoiceNeeded, tone: invoiceNeeded ? "attention" : "default" },
      { label: "Σε έλεγχο", value: review, tone: review ? "attention" : "default" },
      { label: "Έτοιμα για πληρωμή", value: payable, tone: payable ? "positive" : "default" },
      { label: "Πληρωμένα settlements", value: paid, tone: paid ? "positive" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Τι κάνει αυτή η σελίδα" title="Από την ολοκλήρωση παραγγελίας έως την πληρωμή" note="Τα Οικονομικά είναι ο χώρος ενεργειών και παρακολούθησης πληρωμών. Για ιστορική ανάλυση πωλήσεων, commissions και performance χρησιμοποίησε τα Reports." />
      <div className="workspace-queue-list">
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>1. Δημιουργείται οικονομική εγγραφή</strong><small>Όταν ολοκληρωθεί ανατεθειμένη γραμμή παραγγελίας, δημιουργείται procurement για το κατάστημά σου.</small></div></div>
          <div className="workspace-queue-primary"><span>Μικτό ποσό προμηθευτή</span><span>− Χρέωση υπηρεσίας</span><span>+ Επιστροφή μεταφορικών</span><span>= Πληρωτέο</span></div>
        </article>
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>2. Υποβάλλεις το παραστατικό</strong><small>Όπου ζητείται τιμολόγιο, καταχωρείς αριθμό και μικτό ποσό σε ευρώ. Η πλατφόρμα το αντιστοιχίζει με τη συγκεκριμένη οικονομική εγγραφή.</small></div></div>
        </article>
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>3. Έλεγχος και settlement</strong><small>Μετά τον έλεγχο, το ποσό γίνεται payable και εντάσσεται σε settlement. Όταν πληρωθεί, εμφανίζονται ημερομηνία και payout reference.</small></div></div>
        </article>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Εμπορικοί όροι" title="Η συμφωνία σου με το KONTA MOY" note="Οι όροι εμφανίζονται από την εμπορική συμφωνία που είναι αποθηκευμένη για το δικό σου vendor account. Δεν υπολογίζονται από το UI." />
      {initial.commercialTerms ? <article className="workspace-queue-card">
        <div className="workspace-queue-head">
          <div><strong>{initial.commercialTerms.agreementCode}</strong><small>{initial.commercialTerms.activatedAt ? `Ενεργοποίηση ${date(initial.commercialTerms.activatedAt)}` : initial.commercialTerms.signedAt ? `Υπογραφή ${date(initial.commercialTerms.signedAt)}` : "Η συμφωνία δεν έχει ακόμη ενεργοποιηθεί"}</small></div>
          <span className="status-pill" title={initial.commercialTerms.status}>{statusLabel(initial.commercialTerms.status, AGREEMENT_STATUS)}</span>
        </div>
        <div className="workspace-queue-primary">
          <span>Commission {bps(initial.commercialTerms.commissionRateBps)}</span>
          <span>Listing fee {euroMinor(initial.commercialTerms.listingFeeMinor)}</span>
          <span>Recurring {euroMinor(initial.commercialTerms.recurringFeeMinor)} / {recurringPeriod(initial.commercialTerms.recurringFeePeriod)}</span>
        </div>
        <WorkspaceRecordDetails label="Αναλυτικοί εμπορικοί όροι">
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Βάση commission</strong><span>{initial.commercialTerms.commissionBasis || "Δεν έχει οριστεί"}</span></div>
            <div className="workspace-compact-row"><strong>Φορολογική μεταχείριση commission</strong><span>{initial.commercialTerms.commissionTaxMode || "Δεν έχει οριστεί"}{initial.commercialTerms.commissionTaxRateBps ? ` · ${bps(initial.commercialTerms.commissionTaxRateBps)}` : ""}</span></div>
            <div className="workspace-compact-row"><strong>Commission στα μεταφορικά</strong><span>{initial.commercialTerms.commissionAppliesToShipping ? "Ναι" : "Όχι"}</span></div>
            {initial.commercialTerms.startsAt && <div className="workspace-compact-row"><strong>Έναρξη</strong><span>{date(initial.commercialTerms.startsAt)}</span></div>}
            {initial.commercialTerms.endsAt && <div className="workspace-compact-row"><strong>Λήξη</strong><span>{date(initial.commercialTerms.endsAt)}</span></div>}
          </div>
        </WorkspaceRecordDetails>
      </article> : <WorkspaceEmptyState title="Δεν υπάρχει εμπορική συμφωνία συνδεδεμένη με αυτό το vendor account." body="Οι οικονομικές χρεώσεις δεν πρέπει να θεωρούνται ενεργές χωρίς καταχωρημένη συμφωνία. Αν το κατάστημά σου βρίσκεται ακόμη σε onboarding, η συμφωνία θα εμφανιστεί εδώ όταν δημιουργηθεί από τη διαχείριση." />}
    </section>

    {!hasFinanceActivity && <section className="shell vendor-section">
      <WorkspaceEmptyState
        title="Δεν υπάρχει ακόμη οικονομική κίνηση για το κατάστημά σου."
        body="Η ενότητα λειτουργεί, αλλά δεν έχει δημιουργηθεί ακόμη procurement ή settlement. Τα πρώτα στοιχεία θα εμφανιστούν αυτόματα όταν ολοκληρωθεί παραγγελία που έχει ανατεθεί στο κατάστημά σου."
      />
    </section>}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Παραστατικά & οφειλές" title="Οικονομικές εγγραφές" note="Κάθε εγγραφή συνδέεται με συγκεκριμένη παραγγελία. Το «Πληρωτέο» είναι το ποσό που προκύπτει από το λογιστικό workflow μετά τις σχετικές χρεώσεις, επιστροφές και προσαρμογές." />
      {initial.procurements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ακόμη οικονομικές εγγραφές." body="Μόλις ολοκληρωθούν ανατεθειμένες γραμμές παραγγελιών, θα εμφανιστούν εδώ οι εγγραφές που χρειάζονται τιμολόγηση ή παρακολούθηση." /> : <div className="workspace-queue-list">{initial.procurements.map((item) => {
        const needsInvoice = ["accrued", "matched", "disputed"].includes(item.status) && !item.invoiceNumber;
        return <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head">
            <div><strong>Παραγγελία {item.orderId}</strong><small>{item.invoiceNumber ? `Τιμολόγιο ${item.invoiceNumber}` : "Δεν έχει καταχωρηθεί τιμολόγιο"}</small></div>
            <span className="status-pill" title={item.status}>{statusLabel(item.status, PROCUREMENT_STATUS)}</span>
          </div>
          <div className="workspace-queue-primary">
            <span>Μικτό {item.gross}</span>
            <span>Χρέωση υπηρεσίας {item.serviceFeeGross}</span>
            <span>Μεταφορικά {item.shippingReimbursement}</span>
            <span>Πληρωτέο {item.payable}</span>
          </div>
          <WorkspaceRecordDetails label="Ανάλυση & αναφορές">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Procurement ID</strong><span>{item.id}</span></div>
              <div className="workspace-compact-row"><strong>Τελευταία ενημέρωση</strong><span>{dateTime(item.updatedAt)}</span></div>
              {item.payoutReference && <div className="workspace-compact-row"><strong>Payout reference</strong><span>{item.payoutReference}</span></div>}
            </div>
          </WorkspaceRecordDetails>
          {needsInvoice && <details className="workspace-tool-panel" style={{ marginTop: 12 }}>
            <summary><span><strong>Υποβολή τιμολογίου</strong><small>Καταχώρισε τον αριθμό και το μικτό ποσό όπως εμφανίζονται στο παραστατικό.</small></span></summary>
            <div className="workspace-tool-body">
              <form onSubmit={(event) => void submit(event, item.id)}>
                <div className="workspace-form-grid">
                  <div className="workspace-form-field">
                    <label htmlFor={`invoice-number-${item.id}`}>Αριθμός τιμολογίου</label>
                    <input id={`invoice-number-${item.id}`} name="number" required autoComplete="off" />
                  </div>
                  <div className="workspace-form-field">
                    <label htmlFor={`invoice-gross-${item.id}`}>Μικτό ποσό τιμολογίου · €</label>
                    <input id={`invoice-gross-${item.id}`} name="grossEuros" required type="number" min="0" step="0.01" inputMode="decimal" />
                    <small>Αναμενόμενο μικτό ποσό: {item.gross}. Αν διαφέρει, η εγγραφή θα χρειαστεί έλεγχο.</small>
                  </div>
                </div>
                <div className="workspace-form-actions"><button className="button" disabled={busy === item.id}>{busy === item.id ? "Υποβολή…" : "Υποβολή τιμολογίου"}</button></div>
              </form>
            </div>
          </details>}
        </article>;
      })}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Παρακολούθηση πληρωμών" title="Settlements" note="Εδώ βλέπεις μόνο την πορεία της πληρωμής. Η έγκριση και η εκτέλεση payout παραμένουν ενέργειες της πλατφόρμας." />
      {initial.settlements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχει ακόμη settlement για το κατάστημά σου." body="Settlement θα εμφανιστεί όταν εγκεκριμένες πληρωτέες οικονομικές εγγραφές ενταχθούν σε batch πληρωμών." /> : <div className="workspace-queue-list">{initial.settlements.map((settlement) => <article className="workspace-queue-card" key={settlement.id}>
        <div className="workspace-queue-head">
          <div><strong>{settlement.batchNumber}</strong><small>{date(settlement.periodStart)} – {date(settlement.periodEnd)}</small></div>
          <span className="status-pill" title={settlement.status}>{statusLabel(settlement.status, SETTLEMENT_STATUS)}</span>
        </div>
        <div className="workspace-queue-primary"><span>Συνολικό πληρωτέο {settlement.totalPayable}</span>{settlement.paidAt && <span>Πληρώθηκε {dateTime(settlement.paidAt)}</span>}</div>
        <WorkspaceRecordDetails label="Στοιχεία settlement">
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Batch ID</strong><span>{settlement.id}</span></div>
            <div className="workspace-compact-row"><strong>Περίοδος</strong><span>{date(settlement.periodStart)} – {date(settlement.periodEnd)}</span></div>
            {settlement.paidAt && <div className="workspace-compact-row"><strong>Ημερομηνία πληρωμής</strong><span>{dateTime(settlement.paidAt)}</span></div>}
            <div className="workspace-compact-row"><strong>Payout reference</strong><span>{settlement.payoutReference ?? "Δεν έχει καταχωρηθεί ακόμη"}</span></div>
          </div>
        </WorkspaceRecordDetails>
      </article>)}</div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ανάλυση" title="Πωλήσεις, commissions & αναφορές" note="Η σελίδα Οικονομικά δεν είναι analytics dashboard. Οι ιστορικές πωλήσεις, commission snapshots, inventory και performance αναλύονται στα Reports, πάντα μόνο για το δικό σου κατάστημα." />
      <article className="workspace-queue-card">
        <div className="workspace-queue-head"><div><strong>Χρειάζεσαι αναλυτική εικόνα;</strong><small>Δημιούργησε report με ημερομηνίες και φίλτρα και εξήγαγε PDF με σύνοψη και datasets.</small></div></div>
        <div className="workspace-form-actions"><a className="button button-secondary" href="/vendor/reports">Άνοιγμα Reports</a></div>
      </article>
    </section>
  </>;
}
