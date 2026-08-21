"use client";

import Link from "next/link";
import QRCode from "react-qr-code";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerFulfilmentProgress } from "./CustomerFulfilmentProgress";
import { CustomerReturnsPanel, type CustomerReturnCaseView } from "./CustomerReturnsPanel";

type Detail = {
  id: string;
  referenceNumber: string;
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
  returns: ReadonlyArray<CustomerReturnCaseView>;
};

type PaymentResumePayload = Readonly<{ redirectUrl?: string; reservationExpiresAt?: number; error?: string }>;

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const modeLabel: Record<string, string> = { pickup: "Παραλαβή από κατάστημα", local_delivery: "Τοπική παράδοση", shipping: "Αποστολή" };

export function OrderDetailClient({ initial }: { initial: Detail }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [reason, setReason] = useState("Άλλαξα γνώμη πριν την έναρξη φυσικής παράδοσης");
  const [busy, setBusy] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [error, setError] = useState("");

  async function resumePayment() {
    setPaymentBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/account/orders/${encodeURIComponent(data.id)}/payment`, {
        method: "POST",
        headers: { "x-csrf-token": data.csrfToken }
      });
      const payload = await response.json() as PaymentResumePayload;
      if (!response.ok || !payload.redirectUrl) throw new Error(payload.error ?? "Δεν ήταν δυνατή η συνέχιση της πληρωμής.");
      window.location.assign(payload.redirectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η συνέχιση της πληρωμής.");
    } finally {
      setPaymentBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/account/orders/${encodeURIComponent(data.id)}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": data.csrfToken },
        body: JSON.stringify({ reason })
      });
      const payload = await response.json() as Detail & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η ακύρωση απέτυχε");
      setData(payload);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ακύρωση απέτυχε");
    } finally {
      setBusy(false);
    }
  }

  return <section className="shell order-detail-grid is-refined">
    <div className="order-detail-main">
      <div className="order-detail-heading is-refined">
        <div><div className="eyebrow">Παραγγελία</div><h1>{data.status}</h1><p>{date(data.createdAt)} · {modeLabel[data.fulfilmentMode] ?? data.fulfilmentMode} · ΤΚ {data.postcode}</p><small className="order-detail-id">{data.referenceNumber}</small></div>
        <strong>{data.total}</strong>
      </div>

      <div className="order-detail-card is-refined">
        <h2>Προϊόντα</h2>
        {data.lines.map((line) => <div className="order-detail-line" key={line.id}>
          <div><Link href={`/product/${line.canonicalVariantId}`}><strong>{line.quantity}× {line.title}</strong></Link><small>από <Link href={`/vendor/${line.vendorId}`}>{line.vendorName}</Link></small>{line.refundedQuantity > 0 && <small>{line.refundedQuantity} {line.refundedQuantity === 1 ? "τεμάχιο έχει" : "τεμάχια έχουν"} ήδη επιστραφεί / αποζημιωθεί</small>}</div>
          <span>{line.retailUnitPrice} / τεμ.</span>
        </div>)}
      </div>

      <CustomerFulfilmentProgress
        fulfilments={data.fulfilments}
        lines={data.lines.map((line) => ({ id: line.id, title: line.title, quantity: line.quantity }))}
        fulfilmentMode={data.fulfilmentMode}
      />

      <CustomerReturnsPanel
        orderId={data.id}
        csrfToken={data.csrfToken}
        initialLines={data.lines.map((line) => ({ id: line.id, title: line.title, returnableQuantity: line.returnableQuantity }))}
        initialReturns={data.returns}
      />

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
      {data.sourceStatus === "pending_payment" && <div className="order-summary needs-attention">
        <div className="eyebrow">Χρειάζεται ενέργεια</div>
        <h2>Ολοκλήρωσε την πληρωμή</h2>
        <p>Η παραγγελία έχει δημιουργηθεί, αλλά δεν θα προχωρήσει στο κατάστημα μέχρι να ολοκληρωθεί η ασφαλής πληρωμή. Το απόθεμα δεσμεύεται μόνο για περιορισμένο χρονικό διάστημα.</p>
        <button className="button button-primary" type="button" disabled={paymentBusy} onClick={() => void resumePayment()}>{paymentBusy ? "Άνοιγμα ασφαλούς πληρωμής…" : "Συνέχιση ασφαλούς πληρωμής"}</button>
        <small>Δεν δημιουργείται νέα παραγγελία. Αν υπάρχει ήδη ενεργή Viva πληρωμή, συνεχίζεις την ίδια.</small>
      </div>}

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
        <Link href={`/account/support?context=order&id=${encodeURIComponent(data.referenceNumber)}&label=${encodeURIComponent(`Παραγγελία ${data.referenceNumber}`)}&subject=${encodeURIComponent(`Βοήθεια με την παραγγελία ${data.referenceNumber}`)}`}><span>Υποστήριξη για αυτή την παραγγελία</span><span aria-hidden="true">→</span></Link>
        <Link href="/delivery-pickup"><span>Παράδοση & παραλαβή</span><span aria-hidden="true">→</span></Link>
        <Link href="/returns-refunds"><span>Πολιτική επιστροφών</span><span aria-hidden="true">→</span></Link>
      </div>

      {data.canCancel && <details className="order-cancel-disclosure"><summary>Ακύρωση πριν ξεκινήσει η παράδοση</summary><div><p>Η ακύρωση επιτρέπεται μόνο πριν ξεκινήσει η φυσική παράδοση. Μετά χρησιμοποιείται η διαδικασία επιστροφής / υπαναχώρησης.</p><label htmlFor="cancel-reason">Λόγος ακύρωσης</label><textarea id="cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /><button className="button button-secondary" type="button" disabled={busy || !reason.trim()} onClick={() => void cancel()}>{busy ? "Ακύρωση…" : "Ακύρωση παραγγελίας"}</button></div></details>}
    </aside>
  </section>;
}
