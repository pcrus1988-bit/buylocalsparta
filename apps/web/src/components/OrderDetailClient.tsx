"use client";

import Link from "next/link";
import QRCode from "react-qr-code";
import { useState } from "react";
import { useRouter } from "next/navigation";

type ReturnCase = {
  id: string;
  returnNumber: string;
  orderId: string;
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
};

type Detail = {
  id: string;
  status: string;
  sourceStatus: string;
  createdAt: number;
  postcode: string;
  fulfilmentMode: string;
  merchandiseSubtotal: string;
  deliveryCharge: string;
  discount: string;
  total: string;
  cancellationReason?: string;
  cancelledAt?: number;
  canCancel: boolean;
  csrfToken: string;
  invoice?: { documentNumber: string; type: string; mark: string; uid?: string; qrUrl?: string; issuedAt: number; downloadUrl: string };
  lines: ReadonlyArray<{ id: string; canonicalVariantId: string; title: string; quantity: number; fulfilledQuantity: number; refundedQuantity: number; returnableQuantity: number; status: string; retailUnitPrice: string; vendorId: string; vendorName: string }>;
  fulfilments: ReadonlyArray<{ id: string; status: string; vendorId: string; vendorName: string; deliveryCharge: string; lineIds: readonly string[] }>;
  pickups: ReadonlyArray<{ id: string; fulfilmentId: string; vendorName: string; status: "ready" | "collected" | "expired"; readyAt: number; expiresAt: number; collectedAt?: number; shortCode: string; qrUrl: string }>;
  returns: ReadonlyArray<ReturnCase>;
};

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const fulfilmentLabel: Record<string, string> = {
  awaiting_acceptance: "Αναμονή αποδοχής", accepted: "Έγινε αποδεκτή", picking: "Ετοιμάζεται", packed: "Συσκευάστηκε",
  ready_for_handover: "Έτοιμη για παραλαβή", handed_over: "Παραλήφθηκε", shipped: "Σε αποστολή", delivered: "Παραδόθηκε", failed: "Πρόβλημα παράδοσης", cancelled: "Ακυρώθηκε"
};
const returnStatusLabel: Record<string, string> = {
  requested: "Υποβλήθηκε", approved: "Εγκρίθηκε", inspection_required: "Αναμονή οδηγιών επιστροφής", in_transit: "Σε επιστροφή", received: "Παραλήφθηκε για έλεγχο",
  inspected: "Ο έλεγχος ολοκληρώθηκε", remedy_approved: "Εγκρίθηκε refund", refunded: "Η επιστροφή χρημάτων ολοκληρώθηκε", replaced: "Η αντικατάσταση ολοκληρώθηκε", closed: "Ολοκληρώθηκε", rejected: "Απορρίφθηκε"
};
const reasonLabel: Record<string, string> = { withdrawal: "Υπαναχώρηση / άλλαξα γνώμη", defect: "Ελαττωματικό προϊόν", nonconformity: "Δεν ανταποκρίνεται στην περιγραφή", transit_damage: "Ζημιά κατά τη μεταφορά", wrong_item: "Λάθος προϊόν", missing_part: "Λείπει εξάρτημα", other: "Άλλος λόγος" };
const remedyLabel: Record<string, string> = { refund: "Επιστροφή χρημάτων", replacement: "Αντικατάσταση", repair: "Επισκευή", price_reduction: "Μείωση τιμής" };
const modeLabel: Record<string, string> = { pickup: "Παραλαβή από κατάστημα", local_delivery: "Τοπική παράδοση", shipping: "Αποστολή" };

export function OrderDetailClient({ initial }: { initial: Detail }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [reason, setReason] = useState("Άλλαξα γνώμη πριν την έναρξη φυσικής παράδοσης");
  const [busy, setBusy] = useState(false);
  const [returnBusy, setReturnBusy] = useState("");
  const [error, setError] = useState("");
  const [returnReason, setReturnReason] = useState("withdrawal");
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [returnNote, setReturnNote] = useState("");

  async function cancel() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/account/orders/${encodeURIComponent(data.id)}/cancel`, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": data.csrfToken }, body: JSON.stringify({ reason }) });
      const payload = await response.json() as Detail & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η ακύρωση απέτυχε");
      setData(payload); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Η ακύρωση απέτυχε"); }
    finally { setBusy(false); }
  }

  async function submitReturn(lineId: string, maxQuantity: number) {
    setReturnBusy(lineId); setError("");
    try {
      const quantity = Math.min(Math.max(1, returnQuantity), maxQuantity);
      const response = await fetch(`/api/account/orders/${encodeURIComponent(data.id)}/returns`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": data.csrfToken },
        body: JSON.stringify({ orderLineId: lineId, quantity, reason: returnReason, requestedRemedy: "refund", note: returnNote })
      });
      const payload = await response.json() as Detail & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Το αίτημα επιστροφής απέτυχε");
      setData(payload); setReturnQuantity(1); setReturnReason("withdrawal"); setReturnNote(""); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Το αίτημα επιστροφής απέτυχε"); }
    finally { setReturnBusy(""); }
  }

  return <section className="shell order-detail-grid is-refined">
    <div className="order-detail-main">
      <div className="order-detail-heading is-refined">
        <div><div className="eyebrow">Παραγγελία</div><h1>{data.status}</h1><p>{date(data.createdAt)} · {modeLabel[data.fulfilmentMode] ?? data.fulfilmentMode} · ΤΚ {data.postcode}</p><small className="order-detail-id">{data.id}</small></div>
        <strong>{data.total}</strong>
      </div>

      <div className="order-detail-card is-refined">
        <h2>Προϊόντα</h2>
        {data.lines.map((line) => <div key={line.id} style={{ display: "grid", gap: 10 }}>
          <div className="order-detail-line">
            <div><Link href={`/product/${line.canonicalVariantId}`}><strong>{line.quantity}× {line.title}</strong></Link><small>από <Link href={`/vendor/${line.vendorId}`}>{line.vendorName}</Link></small>{line.refundedQuantity > 0 && <small>{line.refundedQuantity} τεμ. έχουν ήδη γίνει refund</small>}</div>
            <span>{line.retailUnitPrice} / τεμ.</span>
          </div>
          {line.returnableQuantity > 0 && <details className="order-cancel-disclosure" style={{ marginBottom: 12 }}>
            <summary>Αίτημα επιστροφής & refund</summary>
            <div style={{ display: "grid", gap: 10 }}>
              <p>Διαθέσιμη ποσότητα για επιστροφή: <strong>{line.returnableQuantity}</strong>. Μετά την υποβολή, η πλατφόρμα ελέγχει το αίτημα και εκδίδει RMA/οδηγίες. Refund εκτελείται μόνο αφού ολοκληρωθεί ο απαιτούμενος έλεγχος.</p>
              <label>Ποσότητα<input type="number" min={1} max={line.returnableQuantity} value={Math.min(returnQuantity, line.returnableQuantity)} onChange={(event) => setReturnQuantity(Math.max(1, Number(event.target.value) || 1))} /></label>
              <label>Λόγος<select value={returnReason} onChange={(event) => setReturnReason(event.target.value)}><option value="withdrawal">Υπαναχώρηση / άλλαξα γνώμη</option><option value="defect">Ελαττωματικό προϊόν</option><option value="nonconformity">Δεν ανταποκρίνεται στην περιγραφή</option><option value="transit_damage">Ζημιά κατά τη μεταφορά</option><option value="wrong_item">Λάθος προϊόν</option><option value="missing_part">Λείπει εξάρτημα</option><option value="other">Άλλος λόγος</option></select></label>
              <div className="workspace-inline-note"><strong>Ζητούμενη λύση:</strong> επιστροφή χρημάτων στην αρχική πληρωμή μέσω Viva.</div>
              <label>Σημείωση<textarea rows={3} maxLength={1000} value={returnNote} onChange={(event) => setReturnNote(event.target.value)} placeholder="Προαιρετικές λεπτομέρειες για το αίτημα" /></label>
              <button className="button" type="button" disabled={Boolean(returnBusy)} onClick={() => void submitReturn(line.id, line.returnableQuantity)}>{returnBusy === line.id ? "Υποβολή…" : "Υποβολή αιτήματος επιστροφής"}</button>
            </div>
          </details>}
        </div>)}
      </div>

      {data.returns.length > 0 && <div className="order-detail-card is-refined">
        <h2>Επιστροφές & refunds</h2>
        <p>Παρακολούθησε εδώ την πορεία κάθε αιτήματος. Μην επιστρέψεις προϊόν πριν εμφανιστούν RMA/οδηγίες.</p>
        <div className="workspace-compact-list">{data.returns.map((item) => <div className="workspace-compact-row" key={item.id} style={{ alignItems: "flex-start" }}>
          <div><strong>{item.returnNumber}</strong><small>{date(item.requestedAt)} · {reasonLabel[item.reason] ?? item.reason}</small><small>{item.requestedRemedy ? `Ζητούμενο: ${remedyLabel[item.requestedRemedy] ?? item.requestedRemedy}` : ""}</small>{item.approvedRemedy && <small>Εγκεκριμένο: {remedyLabel[item.approvedRemedy] ?? item.approvedRemedy}</small>}</div>
          <div style={{ textAlign: "right" }}><span className="status-pill">{returnStatusLabel[item.status] ?? item.status}</span><small style={{ display: "block", marginTop: 6 }}>{item.lines.map((line) => `${line.quantity}× ${data.lines.find((entry) => entry.id === line.orderLineId)?.title ?? line.orderLineId}`).join(", ")}</small>{item.rmaCode && <small style={{ display: "block" }}><strong>RMA {item.rmaCode}</strong>{item.returnByAt ? ` · έως ${date(item.returnByAt)}` : ""}</small>}{item.instructions && <small style={{ display: "block" }}>{item.instructions}</small>}{item.trackingNumber && <small style={{ display: "block" }}>{item.carrier ? `${item.carrier} · ` : ""}{item.trackingNumber}</small>}</div>
        </div>)}</div>
      </div>}

      <div className="order-detail-card is-refined">
        <h2>Παράδοση</h2>
        {data.fulfilments.map((item) => <div className="order-detail-line" key={item.id}><div><strong>{item.vendorName}</strong><small>{item.lineIds.length} {item.lineIds.length === 1 ? "προϊόν" : "προϊόντα"} · {item.deliveryCharge}</small></div><span className="status-pill">{fulfilmentLabel[item.status] ?? item.status.replaceAll("_", " ")}</span></div>)}
      </div>

      {data.pickups.length > 0 && <div className="order-detail-card is-refined">
        <h2>Παραλαβή από το κατάστημα</h2>
        {data.pickups.map((pickup) => <div key={pickup.id} style={{ display: "grid", gap: 16, marginTop: 14 }}>
          <div><strong>{pickup.vendorName}</strong>{pickup.status === "ready" && <p style={{ marginBottom: 0 }}>Η παραγγελία είναι έτοιμη. Δείξε αυτό το QR στο κατάστημα. Ο συνεργάτης το σαρώνει για να ολοκληρωθεί με ασφάλεια η παραλαβή.</p>}{pickup.status === "collected" && <p style={{ marginBottom: 0 }}>Η παραλαβή ολοκληρώθηκε{pickup.collectedAt ? ` · ${date(pickup.collectedAt)}` : ""}.</p>}{pickup.status === "expired" && <p style={{ marginBottom: 0 }}>Ο κωδικός παραλαβής έχει λήξει. Επικοινώνησε με το κατάστημα ή την υποστήριξη πριν την παραλαβή.</p>}</div>
          {pickup.status === "ready" && <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}><div style={{ background: "white", padding: 12, borderRadius: 14, width: 200, height: 200, display: "grid", placeItems: "center" }} aria-label="QR παραλαβής"><QRCode value={pickup.qrUrl} size={176} level="M" /></div><div style={{ display: "grid", gap: 8 }}><span>Εναλλακτικός κωδικός</span><strong style={{ fontSize: "2rem", letterSpacing: ".18em" }}>{pickup.shortCode}</strong><small>Έτοιμη από {date(pickup.readyAt)}</small><small>Ισχύει έως {date(pickup.expiresAt)}</small><small>Μην κοινοποιείς το QR ή τον κωδικό σε τρίτους.</small></div></div>}
        </div>)}
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>

    <aside className="order-detail-side">
      <div className="order-summary">
        <h2>Σύνοψη</h2>
        <div className="summary-row"><span>Εμπορεύματα</span><strong>{data.merchandiseSubtotal}</strong></div>
        <div className="summary-row"><span>Παράδοση</span><strong>{data.deliveryCharge}</strong></div>
        <div className="summary-row"><span>Έκπτωση</span><strong>{data.discount}</strong></div>
        <div className="summary-row"><span>Σύνολο</span><strong>{data.total}</strong></div>
        {data.cancellationReason && <div className="workspace-inline-note">Ακύρωση: {data.cancellationReason}{data.cancelledAt ? ` · ${date(data.cancelledAt)}` : ""}</div>}
      </div>

      {data.invoice && <div className="order-summary">
        <h2>Φορολογικό παραστατικό</h2>
        <div className="summary-row"><span>Αριθμός</span><strong>{data.invoice.documentNumber}</strong></div>
        <div className="summary-row"><span>MARK</span><strong>{data.invoice.mark}</strong></div>
        {data.invoice.uid && <div className="summary-row"><span>UID</span><strong>{data.invoice.uid}</strong></div>}
        <p>{date(data.invoice.issuedAt)}</p>
        <a className="button button-primary" href={data.invoice.downloadUrl}>Λήψη PDF</a>
        {data.invoice.qrUrl && <a className="button button-secondary" href={data.invoice.qrUrl} target="_blank" rel="noreferrer">Επαλήθευση AADE</a>}
      </div>}

      <div className="order-help-links" aria-label="Βοήθεια παραγγελίας">
        <Link href="/delivery-pickup"><span>Παράδοση & παραλαβή</span><span aria-hidden="true">→</span></Link>
        <Link href="/returns-refunds"><span>Πολιτική επιστροφών</span><span aria-hidden="true">→</span></Link>
      </div>

      {data.canCancel && <details className="order-cancel-disclosure"><summary>Ακύρωση πριν το handover</summary><div><p>Η ακύρωση επιτρέπεται μόνο πριν ξεκινήσει η φυσική παράδοση. Μετά χρησιμοποιείται η διαδικασία επιστροφής / υπαναχώρησης.</p><label htmlFor="cancel-reason">Λόγος ακύρωσης</label><textarea id="cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /><button className="button button-secondary" type="button" disabled={busy || !reason.trim()} onClick={() => void cancel()}>{busy ? "Ακύρωση…" : "Ακύρωση παραγγελίας"}</button></div></details>}
    </aside>
  </section>;
}
