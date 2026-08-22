"use client";

import Link from "next/link";
import { useState } from "react";
import { CustomerHowItWorks, CustomerLifecycle, CustomerStatusNotice, type CustomerLifecycleStage } from "./CustomerAccountPrimitives";

export type CustomerReturnLine = Readonly<{
  id: string;
  title: string;
  returnableQuantity: number;
}>;

export type CustomerReturnCaseView = Readonly<{
  id: string;
  returnNumber: string;
  status: string;
  reason: string;
  requestedRemedy?: string;
  approvedRemedy?: string;
  eligibilityState: string;
  eligibilityReason?: string;
  requestedAt: number;
  rmaCode?: string;
  returnByAt?: number;
  instructions?: string;
  carrier?: string;
  trackingNumber?: string;
  lines: ReadonlyArray<{ orderLineId: string; quantity: number }>;
}>;

type Remedy = "refund" | "replacement" | "repair";
type Draft = { quantity: number; reason: string; remedy: Remedy; note: string };
type ReturnResponse = { lines: readonly CustomerReturnLine[]; returns: readonly CustomerReturnCaseView[]; error?: string };

const reasonLabel: Record<string, string> = {
  withdrawal: "Υπαναχώρηση / άλλαξα γνώμη",
  defect: "Ελαττωματικό προϊόν",
  nonconformity: "Δεν ανταποκρίνεται στην περιγραφή",
  transit_damage: "Ζημιά κατά τη μεταφορά",
  wrong_item: "Λάθος προϊόν",
  missing_part: "Λείπει εξάρτημα",
  other: "Άλλος λόγος"
};

const remedyLabel: Record<string, string> = {
  refund: "Επιστροφή χρημάτων",
  replacement: "Αντικατάσταση",
  repair: "Επισκευή"
};

const returnStatusLabel: Record<string, string> = {
  requested: "Υποβλήθηκε",
  approved: "Εγκρίθηκε για επιστροφή",
  inspection_required: "Αναμονή οδηγιών επιστροφής",
  in_transit: "Σε επιστροφή",
  received: "Παραλήφθηκε για έλεγχο",
  inspected: "Ο έλεγχος ολοκληρώθηκε",
  remedy_approved: "Εγκρίθηκε λύση",
  refunded: "Η επιστροφή χρημάτων ολοκληρώθηκε",
  replaced: "Η αντικατάσταση ολοκληρώθηκε",
  repaired: "Η επισκευή ολοκληρώθηκε",
  closed: "Ολοκληρώθηκε",
  rejected: "Απορρίφθηκε"
};

const eligibilityLabel: Record<string, string> = {
  manual_review: "Σε έλεγχο επιλεξιμότητας",
  eligible: "Επιλέξιμο",
  approved: "Επιλέξιμο",
  ineligible: "Μη επιλέξιμο",
  rejected: "Μη επιλέξιμο"
};

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function initialDraft(maxQuantity: number): Draft {
  return { quantity: Math.min(1, Math.max(0, maxQuantity)), reason: "withdrawal", remedy: "refund", note: "" };
}

function returnLifecycle(item: CustomerReturnCaseView): readonly CustomerLifecycleStage[] {
  const labels = ["Αίτημα", "Επιλεξιμότητα", "Οδηγίες / RMA", "Αποστολή", "Παραλαβή", "Έλεγχος", "Λύση", "Ολοκλήρωση"];
  const terminal = ["refunded", "replaced", "repaired", "closed"].includes(item.status);
  const rejected = item.status === "rejected";
  let current = 1;
  if (["approved", "inspection_required"].includes(item.status)) current = 2;
  if (item.status === "in_transit") current = 3;
  if (item.status === "received") current = 4;
  if (item.status === "inspected") current = 5;
  if (item.status === "remedy_approved") current = 6;
  if (terminal) current = 7;
  if (rejected) current = 1;

  return labels.map((label, index) => {
    if (terminal) return { label, state: "done" as const };
    if (rejected && index === current) return { label, state: "cancelled" as const };
    if (index < current) return { label, state: "done" as const };
    if (index > current) return { label, state: "pending" as const };
    const customerAction = index === 2 && Boolean(item.rmaCode || item.instructions || item.returnByAt);
    return { label, state: customerAction ? "action" as const : "current" as const };
  });
}

export function CustomerReturnsPanel({ orderId, csrfToken, initialLines, initialReturns }: {
  orderId: string;
  csrfToken: string;
  initialLines: readonly CustomerReturnLine[];
  initialReturns: readonly CustomerReturnCaseView[];
}) {
  const [lines, setLines] = useState(initialLines);
  const [returns, setReturns] = useState(initialReturns);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(initialLines.map((line) => [line.id, initialDraft(line.returnableQuantity)])));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const returnableLines = lines.filter((line) => line.returnableQuantity > 0);

  function draftFor(line: CustomerReturnLine): Draft {
    return drafts[line.id] ?? initialDraft(line.returnableQuantity);
  }

  function patchDraft(lineId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [lineId]: {
        ...(current[lineId] ?? initialDraft(lines.find((line) => line.id === lineId)?.returnableQuantity ?? 1)),
        ...patch
      }
    }));
  }

  async function submitReturn(line: CustomerReturnLine) {
    const draft = draftFor(line);
    setBusy(line.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/account/orders/${encodeURIComponent(orderId)}/returns`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          orderLineId: line.id,
          quantity: Math.min(Math.max(1, draft.quantity), line.returnableQuantity),
          reason: draft.reason,
          requestedRemedy: draft.remedy,
          note: draft.note
        })
      });
      const payload = await response.json() as ReturnResponse;
      if (!response.ok) throw new Error(payload.error ?? "Το αίτημα επιστροφής απέτυχε.");
      setLines(payload.lines.map((item) => ({ id: item.id, title: item.title, returnableQuantity: item.returnableQuantity })));
      setReturns(payload.returns);
      setDrafts((current) => ({
        ...current,
        [line.id]: initialDraft(payload.lines.find((item) => item.id === line.id)?.returnableQuantity ?? 0)
      }));
      setSuccess("Το αίτημα καταχωρίστηκε. Μην επιστρέψεις το προϊόν πριν εμφανιστούν οδηγίες ή RMA.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Το αίτημα επιστροφής απέτυχε.");
    } finally {
      setBusy("");
    }
  }

  if (!returnableLines.length && !returns.length) return null;

  return <div className="order-detail-card is-refined customer-returns-panel">
    <div className="customer-return-heading">
      <div><div className="eyebrow">Μετά την αγορά</div><h2>Επιστροφές & λύσεις</h2></div>
      <CustomerHowItWorks title="Πώς λειτουργεί η επιστροφή;">
        <p>Διάλεξε το συγκεκριμένο προϊόν, ποσότητα, λόγο και τη λύση που προτιμάς. Η επιλογή σου είναι αίτημα — η τελική επιλεξιμότητα και η εγκεκριμένη λύση ελέγχονται από τη διαδικασία επιστροφών. Μην αποστείλεις προϊόν πριν εμφανιστούν επίσημες οδηγίες ή RMA.</p>
      </CustomerHowItWorks>
    </div>

    {error && <p className="form-error" role="alert">{error}</p>}
    {success && <p className="privacy-status" role="status">{success}</p>}

    {returnableLines.length > 0 && <section className="customer-return-request-list" aria-labelledby="return-request-title">
      <h3 id="return-request-title">Νέο αίτημα</h3>
      {returnableLines.map((line) => {
        const draft = draftFor(line);
        return <details className="customer-return-request" key={line.id}>
          <summary>
            <span><strong>{line.title}</strong><small>{line.returnableQuantity} {line.returnableQuantity === 1 ? "τεμάχιο διαθέσιμο" : "τεμάχια διαθέσιμα"} για αίτημα</small></span>
            <span>Έναρξη →</span>
          </summary>
          <div className="customer-return-form">
            <label><span>Ποσότητα</span><input type="number" min={1} max={line.returnableQuantity} value={Math.min(draft.quantity, line.returnableQuantity)} onChange={(event) => patchDraft(line.id, { quantity: Math.max(1, Number(event.target.value) || 1) })} /></label>
            <label><span>Λόγος</span><select value={draft.reason} onChange={(event) => patchDraft(line.id, { reason: event.target.value })}><option value="withdrawal">Υπαναχώρηση / άλλαξα γνώμη</option><option value="defect">Ελαττωματικό προϊόν</option><option value="nonconformity">Δεν ανταποκρίνεται στην περιγραφή</option><option value="transit_damage">Ζημιά κατά τη μεταφορά</option><option value="wrong_item">Λάθος προϊόν</option><option value="missing_part">Λείπει εξάρτημα</option><option value="other">Άλλος λόγος</option></select></label>
            <label><span>Λύση που προτιμάς</span><select value={draft.remedy} onChange={(event) => patchDraft(line.id, { remedy: event.target.value as Remedy })}><option value="refund">Επιστροφή χρημάτων</option><option value="replacement">Αντικατάσταση</option><option value="repair">Επισκευή</option></select><small>Η προτίμηση καταγράφεται· η τελική λύση επιβεβαιώνεται μετά τον έλεγχο.</small></label>
            <label className="customer-return-note"><span>Σημείωση (προαιρετικά)</span><textarea rows={3} maxLength={1000} value={draft.note} onChange={(event) => patchDraft(line.id, { note: event.target.value })} placeholder="Πρόσθεσε μόνο πληροφορίες που βοηθούν στον έλεγχο του αιτήματος." /></label>
            <button className="button" type="button" disabled={Boolean(busy)} onClick={() => void submitReturn(line)}>{busy === line.id ? "Υποβολή…" : "Υποβολή αιτήματος"}</button>
          </div>
        </details>;
      })}
    </section>}

    {returns.length > 0 && <section className="customer-return-cases" aria-labelledby="return-cases-title">
      <h3 id="return-cases-title">Τα αιτήματά σου</h3>
      {returns.map((item) => {
        const actionNeeded = ["approved", "inspection_required"].includes(item.status) && Boolean(item.rmaCode || item.instructions || item.returnByAt);
        const progressOnly = ["requested", "in_transit", "received", "inspected", "remedy_approved"].includes(item.status);
        const supportHref = `/account/support?context=return&id=${encodeURIComponent(item.returnNumber)}&label=${encodeURIComponent(`Επιστροφή ${item.returnNumber}`)}&subject=${encodeURIComponent(`Βοήθεια με την επιστροφή ${item.returnNumber}`)}`;
        return <article className="customer-return-case" key={item.id}>
          <div className="customer-return-case-head"><div><strong>{item.returnNumber}</strong><small>{date(item.requestedAt)} · {reasonLabel[item.reason] ?? item.reason}</small></div><span className="status-pill">{returnStatusLabel[item.status] ?? item.status}</span></div>
          <CustomerLifecycle label={`Πορεία επιστροφής ${item.returnNumber}`} stages={returnLifecycle(item)} />
          <div className="customer-return-facts">
            <div><span>Επιλεξιμότητα</span><strong>{eligibilityLabel[item.eligibilityState] ?? item.eligibilityState}</strong>{item.eligibilityReason && <small>{item.eligibilityReason}</small>}</div>
            <div><span>Ζητούμενη λύση</span><strong>{item.requestedRemedy ? remedyLabel[item.requestedRemedy] ?? item.requestedRemedy : "—"}</strong>{item.approvedRemedy && <small>Εγκεκριμένη: {remedyLabel[item.approvedRemedy] ?? item.approvedRemedy}</small>}</div>
            <div><span>Προϊόντα</span><strong>{item.lines.map((entry) => `${entry.quantity}× ${lines.find((line) => line.id === entry.orderLineId)?.title ?? "προϊόν"}`).join(", ")}</strong></div>
          </div>
          {actionNeeded ? <CustomerStatusNotice tone="action" title="Χρειάζεται ενέργεια από εσένα"><p>{item.instructions ?? "Ακολούθησε τις οδηγίες επιστροφής που εμφανίζονται για αυτό το αίτημα."}</p>{item.rmaCode && <p><strong>RMA:</strong> {item.rmaCode}</p>}{item.returnByAt && <p><strong>Ολοκλήρωσε την αποστολή έως:</strong> {date(item.returnByAt)}</p>}</CustomerStatusNotice> : progressOnly ? <CustomerStatusNotice tone="progress" title="Δεν χρειάζεται ενέργεια από εσένα τώρα"><p>{returnStatusLabel[item.status] ?? item.status}. Θα ενημερωθείς όταν αλλάξει το επόμενο βήμα.</p></CustomerStatusNotice> : null}
          {(item.carrier || item.trackingNumber) && <p className="customer-return-tracking"><strong>Επιστροφή:</strong> {[item.carrier, item.trackingNumber].filter(Boolean).join(" · ")}</p>}
          <Link className="text-link customer-return-support-link" href={supportHref}>Χρειάζομαι βοήθεια →</Link>
        </article>;
      })}
    </section>}
  </div>;
}
