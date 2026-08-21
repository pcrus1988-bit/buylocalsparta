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
  grossMinor?: number;
  serviceFeeGross: string;
  serviceFeeGrossMinor?: number;
  vendorDeliveryCompensation?: string;
  vendorDeliveryCompensationMinor?: number;
  adjustment?: string;
  adjustmentMinor?: number;
  payable: string;
  payableMinor?: number;
  payoutReference?: string;
  updatedAt: number;
}>;

type Settlement = Readonly<{
  id: string;
  batchNumber: string;
  status: string;
  totalPayable: string;
  totalPayableMinor?: number;
  supplierPayableMinor?: number;
  platformInvoiceOffsetMinor?: number;
  vendorReceivableOffsetMinor?: number;
  lineCount?: number;
  periodStart: number;
  periodEnd: number;
  paidAt?: number;
  payoutReference?: string;
  payoutDestination?: Readonly<{ maskedAccount: string; label: string }>;
}>;

type CommercialTerms = Readonly<{
  agreementCode: string;
  status: string;
  effectiveStatus?: string;
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

type FinanceSummary = Readonly<{
  merchandiseGrossMinor: number;
  expectedPlatformFeeMinor: number;
  vendorDeliveryCompensationMinor: number;
  procurementAdjustmentMinor: number;
  supplierPayableMinor: number;
  scheduledPayoutMinor: number;
  paidMinor: number;
}>;

type PayoutDestination = Readonly<{
  id: string;
  provider: string;
  displayLabel: string;
  maskedAccount: string;
  accountHolder: string;
  status: string;
  verifiedAt?: number;
  effectiveAt?: number;
  supersededAt?: number;
}>;

type FinanceAdjustment = Readonly<{
  id: string;
  sourceKind: string;
  direction: string;
  amountMinor: number;
  allocatedMinor: number;
  reasonCode: string;
  reason: string;
  status: string;
  requiresPlatformCreditDocument: boolean;
  createdAt: number;
}>;

type Workspace = Readonly<{
  csrfToken: string;
  procurements: readonly Procurement[];
  settlements: readonly Settlement[];
  commercialTerms?: CommercialTerms;
  summary?: FinanceSummary;
  payoutDestination?: PayoutDestination;
  adjustments?: readonly FinanceAdjustment[];
}>;

const PROCUREMENT_STATUS: Record<string, string> = {
  estimated: "Σε προετοιμασία",
  accrued: "Χρειάζεται παραστατικό",
  vendor_invoice_required: "Χρειάζεται παραστατικό",
  matched: "Παραστατικό ελέγχθηκε",
  approved: "Εγκρίθηκε",
  disputed: "Χρειάζεται έλεγχο",
  payable: "Έτοιμο για εκκαθάριση",
  settled: "Πληρώθηκε",
  reversed: "Αντιλογισμένο"
};

const SETTLEMENT_STATUS: Record<string, string> = {
  draft: "Σε προετοιμασία",
  submitted: "Υποβλήθηκε",
  approval_required: "Αναμονή δεύτερης έγκρισης",
  approved: "Εγκρίθηκε για πληρωμή",
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
  effective: "Σε ισχύ",
  upcoming: "Ξεκινά σύντομα",
  expired: "Έληξε",
  suspended: "Σε αναστολή",
  terminated: "Τερματισμένη"
};

const ADJUSTMENT_STATUS: Record<string, string> = {
  pending: "Σε έλεγχο",
  approved: "Εγκεκριμένη",
  applied: "Συμψηφίστηκε",
  rejected: "Απορρίφθηκε",
  reversed: "Αντιλογίστηκε"
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

function agreementWarning(terms?: CommercialTerms) {
  const state = terms?.effectiveStatus ?? terms?.status;
  if (state === "expired") return "Η εμπορική συμφωνία έχει λήξει. Νέες πωλήσεις δεν πρέπει να χρεωθούν χωρίς νέα συμφωνία σε ισχύ.";
  if (state === "upcoming") return "Η εμπορική συμφωνία δεν έχει ακόμη τεθεί σε ισχύ.";
  if (state === "suspended") return "Η εμπορική συμφωνία βρίσκεται σε αναστολή.";
  if (state === "terminated") return "Η εμπορική συμφωνία έχει τερματιστεί.";
  return undefined;
}

export function VendorFinanceClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const invoiceNeeded = initial.procurements.filter((item) => ["accrued", "vendor_invoice_required"].includes(item.status) && !item.invoiceNumber).length;
  const review = initial.procurements.filter((item) => ["matched", "disputed", "approved"].includes(item.status)).length;
  const payable = initial.procurements.filter((item) => item.status === "payable").length;
  const paid = initial.settlements.filter((item) => ["paid", "settled", "closed"].includes(item.status)).length;
  const hasFinanceActivity = initial.procurements.length > 0 || initial.settlements.length > 0;
  const warning = agreementWarning(initial.commercialTerms);

  const fallbackGross = initial.procurements.reduce((sum, item) => sum + (item.grossMinor ?? 0), 0);
  const fallbackFees = initial.procurements.reduce((sum, item) => sum + (item.serviceFeeGrossMinor ?? 0), 0);
  const fallbackScheduled = initial.settlements.filter((item) => !["paid", "settled", "closed"].includes(item.status)).reduce((sum, item) => sum + (item.totalPayableMinor ?? 0), 0);
  const fallbackPaid = initial.settlements.filter((item) => ["paid", "settled", "closed"].includes(item.status)).reduce((sum, item) => sum + (item.totalPayableMinor ?? 0), 0);
  const summary = initial.summary ?? {
    merchandiseGrossMinor: fallbackGross,
    expectedPlatformFeeMinor: fallbackFees,
    vendorDeliveryCompensationMinor: 0,
    procurementAdjustmentMinor: 0,
    supplierPayableMinor: 0,
    scheduledPayoutMinor: fallbackScheduled,
    paidMinor: fallbackPaid
  };

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
    {warning && <div className="shell form-error vendor-error" role="alert"><strong>Χρειάζεται προσοχή:</strong> {warning}</div>}

    <WorkspaceMetricStrip items={[
      { label: "Πωλήσεις προϊόντων", value: euroMinor(summary.merchandiseGrossMinor), hint: "Αξία προϊόντων που δημιούργησε οικονομική εγγραφή" },
      { label: "Χρεώσεις KONTA MOY", value: euroMinor(summary.expectedPlatformFeeMinor), hint: "Αναμενόμενες χρεώσεις βάσει συμφωνίας" },
      { label: "Προγραμματισμένες πληρωμές", value: euroMinor(summary.scheduledPayoutMinor), tone: summary.scheduledPayoutMinor ? "attention" : "default" },
      { label: "Πληρωμένα", value: euroMinor(summary.paidMinor), tone: summary.paidMinor ? "positive" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Με μία ματιά" title="Πώς υπολογίζεται η πληρωμή σου" note="Η αξία των προϊόντων, οι χρεώσεις KONTA MOY και τα μεταφορικά είναι ξεχωριστές οικονομικές ροές. Έτσι κάθε ευρώ μπορεί να εξηγηθεί και να συμφωνηθεί." />
      <div className="workspace-queue-list">
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>1. Ολοκληρώνεται η πώληση</strong><small>Όταν η πληρωμή του πελάτη έχει επιβεβαιωθεί και η παραλαβή ή παράδοση ολοκληρωθεί, δημιουργείται αυτόματα η οικονομική εγγραφή του καταστήματος.</small></div></div>
          <div className="workspace-queue-primary">
            <span>Μικτό ποσό πωλήσεων προϊόντων</span>
            <span>+ τυχόν αμοιβή παράδοσης καταστήματος</span>
            <span>± εγκεκριμένες προσαρμογές</span>
            <span>= οφειλή KONTA MOY προς κατάστημα</span>
          </div>
        </article>
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>2. Εκδίδονται και ελέγχονται τα παραστατικά</strong><small>Το παραστατικό του καταστήματος αντιστοιχίζεται με τις πωλήσεις. Οι προμήθειες και λοιπές υπηρεσίες του KONTA MOY εμφανίζονται με ξεχωριστό παραστατικό.</small></div></div>
          <div className="workspace-queue-primary">
            <span>Οφειλή προς κατάστημα</span>
            <span>− παραστατικά KONTA MOY που συμψηφίζονται</span>
            <span>− εγκεκριμένες οφειλές προηγούμενων περιόδων</span>
            <span>= τελική τραπεζική πληρωμή</span>
          </div>
        </article>
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>3. Τα μεταφορικά είναι ξεχωριστά</strong><small>Τα μεταφορικά που χρεώνονται στον πελάτη δεν αυξάνουν την αξία των προϊόντων του καταστήματος και δεν αποτελούν βάση commission. Το KONTA MOY τα διαχειρίζεται ξεχωριστά με τον πάροχο μεταφοράς.</small></div></div>
          <div className="workspace-queue-primary"><span>Εξαίρεση: αν το ίδιο το κατάστημα εκτελεί συμφωνημένη τοπική παράδοση, η σχετική αμοιβή εμφανίζεται χωριστά.</span></div>
        </article>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Λογαριασμός πληρωμής" title="Πού καταβάλλονται τα χρήματα" note="Για ασφάλεια εμφανίζεται μόνο η μάσκα του επαληθευμένου λογαριασμού. Η πλήρης τραπεζική πληροφορία δεν εμφανίζεται εδώ." />
      {initial.payoutDestination ? <article className="workspace-queue-card">
        <div className="workspace-queue-head">
          <div><strong>{initial.payoutDestination.displayLabel}</strong><small>{initial.payoutDestination.accountHolder} · {initial.payoutDestination.maskedAccount}</small></div>
          <span className="status-pill">{initial.payoutDestination.status === "verified" ? "Επαληθευμένος" : initial.payoutDestination.status}</span>
        </div>
        <WorkspaceRecordDetails label="Στοιχεία πληρωμής"><div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Πάροχος</strong><span>{initial.payoutDestination.provider}</span></div>
          <div className="workspace-compact-row"><strong>Λογαριασμός</strong><span>{initial.payoutDestination.maskedAccount}</span></div>
          {initial.payoutDestination.verifiedAt && <div className="workspace-compact-row"><strong>Επαληθεύτηκε</strong><span>{dateTime(initial.payoutDestination.verifiedAt)}</span></div>}
        </div></WorkspaceRecordDetails>
      </article> : <WorkspaceEmptyState title="Δεν έχει οριστεί ακόμη επαληθευμένος λογαριασμός πληρωμής." body="Δεν μπορεί να οριστικοποιηθεί settlement μέχρι να υπάρχει επαληθευμένος προορισμός πληρωμής. Επικοινώνησε με την υποστήριξη για την ασφαλή καταχώριση ή αλλαγή του." />}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Εμπορικοί όροι" title="Η συμφωνία σου με το KONTA MOY" note="Η προμήθεια προκύπτει από τη συμφωνία που ήταν σε ισχύ τη στιγμή της παραγγελίας και αποθηκεύεται ως snapshot. Μελλοντική αλλαγή συμφωνίας δεν αλλάζει παλιές πωλήσεις." />
      {initial.commercialTerms ? <article className="workspace-queue-card">
        <div className="workspace-queue-head">
          <div><strong>{initial.commercialTerms.agreementCode}</strong><small>{initial.commercialTerms.activatedAt ? `Ενεργοποίηση ${date(initial.commercialTerms.activatedAt)}` : initial.commercialTerms.signedAt ? `Υπογραφή ${date(initial.commercialTerms.signedAt)}` : "Η συμφωνία δεν έχει ακόμη ενεργοποιηθεί"}</small></div>
          <span className="status-pill" title={initial.commercialTerms.status}>{statusLabel(initial.commercialTerms.effectiveStatus ?? initial.commercialTerms.status, AGREEMENT_STATUS)}</span>
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
            <div className="workspace-compact-row"><strong>Commission στα μεταφορικά</strong><span>{initial.commercialTerms.commissionAppliesToShipping ? "Ναι — χρειάζεται έλεγχος συμφωνίας" : "Όχι"}</span></div>
            {initial.commercialTerms.startsAt && <div className="workspace-compact-row"><strong>Έναρξη</strong><span>{date(initial.commercialTerms.startsAt)}</span></div>}
            {initial.commercialTerms.endsAt && <div className="workspace-compact-row"><strong>Λήξη</strong><span>{date(initial.commercialTerms.endsAt)}</span></div>}
          </div>
        </WorkspaceRecordDetails>
      </article> : <WorkspaceEmptyState title="Δεν υπάρχει εμπορική συμφωνία συνδεδεμένη με αυτό το κατάστημα." body="Νέα πώληση δεν πρέπει να ολοκληρώνεται χωρίς συμφωνία σε ισχύ. Η διαχείριση πρέπει να ολοκληρώσει την εμπορική ενεργοποίηση του καταστήματος." />}
    </section>

    {!hasFinanceActivity && <section className="shell vendor-section">
      <WorkspaceEmptyState title="Δεν υπάρχει ακόμη οικονομική κίνηση για το κατάστημά σου." body="Οι πρώτες εγγραφές εμφανίζονται αυτόματα μόνο μετά από επιβεβαιωμένη πληρωμή και ολοκληρωμένη παραλαβή ή παράδοση." />
    </section>}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Πωλήσεις & παραστατικά" title="Οικονομικές εγγραφές" note="Κάθε εγγραφή συνδέεται με συγκεκριμένη παραγγελία. Η αξία των προϊόντων είναι η οφειλή προς το κατάστημα πριν από τον ξεχωριστό συμψηφισμό των παραστατικών KONTA MOY." />
      {initial.procurements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ακόμη οικονομικές εγγραφές." body="Μόλις ολοκληρωθούν πληρωμένες παραγγελίες του καταστήματος, θα εμφανιστούν εδώ αυτόματα." /> : <div className="workspace-queue-list">{initial.procurements.map((item) => {
        const needsInvoice = ["accrued", "vendor_invoice_required"].includes(item.status) && !item.invoiceNumber;
        return <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head">
            <div><strong>Παραγγελία {item.orderId}</strong><small>{item.invoiceNumber ? `Παραστατικό ${item.invoiceNumber}` : "Δεν έχει καταχωρηθεί παραστατικό"}</small></div>
            <span className="status-pill" title={item.status}>{statusLabel(item.status, PROCUREMENT_STATUS)}</span>
          </div>
          <div className="workspace-queue-primary">
            <span>Προϊόντα {item.gross}</span>
            {Boolean(item.vendorDeliveryCompensationMinor) && <span>Αμοιβή παράδοσης {item.vendorDeliveryCompensation}</span>}
            {Boolean(item.adjustmentMinor) && <span>Προσαρμογές {item.adjustment}</span>}
            <span>Οφειλή προς κατάστημα {item.payable}</span>
          </div>
          <WorkspaceRecordDetails label="Ανάλυση & αναφορές">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Οικονομική εγγραφή</strong><span>{item.id}</span></div>
              <div className="workspace-compact-row"><strong>Αναμενόμενη χρέωση KONTA MOY</strong><span>{item.serviceFeeGross}</span></div>
              <div className="workspace-compact-row"><strong>Μεταφορικά πελάτη</strong><span>Δεν περιλαμβάνονται στην οφειλή προς το κατάστημα</span></div>
              <div className="workspace-compact-row"><strong>Τελευταία ενημέρωση</strong><span>{dateTime(item.updatedAt)}</span></div>
              {item.payoutReference && <div className="workspace-compact-row"><strong>Αναφορά πληρωμής</strong><span>{item.payoutReference}</span></div>}
            </div>
          </WorkspaceRecordDetails>
          {needsInvoice && <details className="workspace-tool-panel" style={{ marginTop: 12 }}>
            <summary><span><strong>Υποβολή παραστατικού</strong><small>Καταχώρισε τον αριθμό και το μικτό ποσό όπως εμφανίζονται στο παραστατικό προς KONTA MOY.</small></span></summary>
            <div className="workspace-tool-body">
              <form onSubmit={(event) => void submit(event, item.id)}>
                <div className="workspace-form-grid">
                  <div className="workspace-form-field">
                    <label htmlFor={`invoice-number-${item.id}`}>Αριθμός παραστατικού</label>
                    <input id={`invoice-number-${item.id}`} name="number" required autoComplete="off" />
                  </div>
                  <div className="workspace-form-field">
                    <label htmlFor={`invoice-gross-${item.id}`}>Μικτό ποσό παραστατικού · €</label>
                    <input id={`invoice-gross-${item.id}`} name="grossEuros" required type="number" min="0" step="0.01" inputMode="decimal" />
                    <small>Αναμενόμενη αξία προϊόντων: {item.gross}. Αν διαφέρει, η εγγραφή θα μεταφερθεί για έλεγχο.</small>
                  </div>
                </div>
                <div className="workspace-form-actions"><button className="button" disabled={busy === item.id}>{busy === item.id ? "Υποβολή…" : "Υποβολή παραστατικού"}</button></div>
              </form>
            </div>
          </details>}
        </article>;
      })}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Πληρωμές" title="Εκκαθαρίσεις" note="Κάθε εκκαθάριση δείχνει ξεχωριστά την οφειλή προς το κατάστημα, τα παραστατικά KONTA MOY που συμψηφίζονται, τυχόν προηγούμενες εγκεκριμένες οφειλές και το τελικό ποσό κατάθεσης." />
      {initial.settlements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχει ακόμη εκκαθάριση." body={payable ? "Υπάρχουν εγκεκριμένες οικονομικές εγγραφές που αναμένουν ένταξη σε πληρωμή." : "Μια εκκαθάριση θα εμφανιστεί όταν οι σχετικές εγγραφές και τα παραστατικά έχουν ελεγχθεί."} /> : <div className="workspace-queue-list">{initial.settlements.map((settlement) => <article className="workspace-queue-card" key={settlement.id}>
        <div className="workspace-queue-head">
          <div><strong>{settlement.batchNumber}</strong><small>{date(settlement.periodStart)} – {date(settlement.periodEnd)}{settlement.lineCount ? ` · ${settlement.lineCount} εγγραφές` : ""}</small></div>
          <span className="status-pill" title={settlement.status}>{statusLabel(settlement.status, SETTLEMENT_STATUS)}</span>
        </div>
        <div className="workspace-queue-primary"><span>Τελική πληρωμή {settlement.totalPayable}</span>{settlement.paidAt && <span>Πληρώθηκε {dateTime(settlement.paidAt)}</span>}</div>
        <WorkspaceRecordDetails label="Ανάλυση εκκαθάρισης">
          <div className="workspace-compact-list">
            {settlement.supplierPayableMinor != null && <div className="workspace-compact-row"><strong>Οφειλή προς κατάστημα</strong><span>{euroMinor(settlement.supplierPayableMinor)}</span></div>}
            {settlement.platformInvoiceOffsetMinor != null && <div className="workspace-compact-row"><strong>− Παραστατικά KONTA MOY</strong><span>{euroMinor(settlement.platformInvoiceOffsetMinor)}</span></div>}
            {settlement.vendorReceivableOffsetMinor != null && <div className="workspace-compact-row"><strong>− Προηγούμενες εγκεκριμένες οφειλές</strong><span>{euroMinor(settlement.vendorReceivableOffsetMinor)}</span></div>}
            <div className="workspace-compact-row"><strong>= Τελική πληρωμή</strong><span>{settlement.totalPayable}</span></div>
            {settlement.payoutDestination && <div className="workspace-compact-row"><strong>Προς</strong><span>{settlement.payoutDestination.label} · {settlement.payoutDestination.maskedAccount}</span></div>}
            {settlement.paidAt && <div className="workspace-compact-row"><strong>Ημερομηνία πληρωμής</strong><span>{dateTime(settlement.paidAt)}</span></div>}
            <div className="workspace-compact-row"><strong>Αναφορά πληρωμής</strong><span>{settlement.payoutReference ?? "Δεν έχει καταχωρηθεί ακόμη"}</span></div>
          </div>
        </WorkspaceRecordDetails>
      </article>)}</div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Διορθώσεις & επιστροφές" title="Προσαρμογές λογαριασμού" note="Καμία επιστροφή, chargeback ή χειροκίνητη διόρθωση δεν πρέπει να αλλάζει την πληρωμή χωρίς αιτία και ξεχωριστή οικονομική εγγραφή." />
      {!initial.adjustments?.length ? <WorkspaceEmptyState title="Δεν υπάρχουν προσαρμογές." body="Αν προκύψει επιστροφή, αντιλογισμός ή άλλη εγκεκριμένη διόρθωση, θα εμφανιστεί εδώ με αιτία και κατάσταση." /> : <div className="workspace-queue-list">{initial.adjustments.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.direction === "credit_vendor" ? "+" : "−"}{euroMinor(item.amountMinor)} · {item.reason}</strong><small>{dateTime(item.createdAt)} · {item.sourceKind}</small></div><span className="status-pill">{statusLabel(item.status, ADJUSTMENT_STATUS)}</span></div>
        <div className="workspace-queue-primary"><span>Αιτία {item.reasonCode}</span>{item.allocatedMinor > 0 && <span>Έχει δεσμευτεί σε εκκαθάριση {euroMinor(item.allocatedMinor)}</span>}{item.requiresPlatformCreditDocument && <span>Απαιτεί πιστωτικό παραστατικό KONTA MOY πριν εγκριθεί</span>}</div>
      </article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Επόμενες ενέργειες" title="Τι χρειάζεται τώρα" note="Η σελίδα δείχνει μόνο ενέργειες που χρειάζονται πραγματικά από το κατάστημά σου ή από το KONTA MOY." />
      <div className="workspace-queue-list">
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>{invoiceNeeded ? `${invoiceNeeded} παραστατικά χρειάζονται υποβολή` : "Δεν εκκρεμεί παραστατικό από εσένα"}</strong><small>{review ? `${review} οικονομικές εγγραφές βρίσκονται σε έλεγχο.` : "Δεν υπάρχει εγγραφή σε έλεγχο."}</small></div></div></article>
        <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>{paid ? `${paid} πληρωμές έχουν ολοκληρωθεί` : "Δεν υπάρχει ακόμη ολοκληρωμένη πληρωμή"}</strong><small>Για ιστορική ανάλυση πωλήσεων και performance χρησιμοποίησε τα Reports.</small></div></div><div className="workspace-form-actions"><a className="button button-secondary" href="/vendor/reports">Άνοιγμα Reports</a></div></article>
      </div>
    </section>
  </>;
}
