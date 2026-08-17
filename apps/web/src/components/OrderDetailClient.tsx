"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Detail = { id: string; status: string; createdAt: number; postcode: string; fulfilmentMode: string; merchandiseSubtotal: string; deliveryCharge: string; discount: string; total: string; cancellationReason?: string; cancelledAt?: number; canCancel: boolean; csrfToken: string; lines: ReadonlyArray<{ id: string; canonicalVariantId: string; title: string; quantity: number; status: string; retailUnitPrice: string; vendorId: string; vendorName: string }>; fulfilments: ReadonlyArray<{ id: string; status: string; vendorId: string; vendorName: string; deliveryCharge: string; lineIds: readonly string[] }> };
const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function OrderDetailClient({ initial }: { initial: Detail }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [reason, setReason] = useState("Άλλαξα γνώμη πριν την έναρξη φυσικής παράδοσης");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  return <section className="shell order-detail-grid">
    <div className="order-detail-main">
      <div className="order-detail-heading"><div><div className="eyebrow">Order {data.id}</div><h1>{data.status}</h1><p>{date(data.createdAt)} · {data.fulfilmentMode} · ΤΚ {data.postcode}</p></div><strong>{data.total}</strong></div>
      <div className="order-detail-card"><h2>Προϊόντα</h2>{data.lines.map((line) => <div className="order-detail-line" key={line.id}><div><a href={`/product/${line.canonicalVariantId}`}><strong>{line.quantity}× {line.title}</strong></a><small>{line.status} · <a href={`/vendor/${line.vendorId}`}>{line.vendorName}</a></small></div><span>{line.retailUnitPrice} / τεμ.</span></div>)}</div>
      <div className="order-detail-card"><h2>Εκπλήρωση</h2>{data.fulfilments.map((item) => <div className="order-detail-line" key={item.id}><div><strong>{item.vendorName}</strong><small>{item.id}</small></div><span className="status-pill">{item.status}</span></div>)}</div>
    </div>
    <aside className="order-detail-side"><div className="order-summary"><h2>Σύνοψη</h2><div className="summary-row"><span>Εμπορεύματα</span><strong>{data.merchandiseSubtotal}</strong></div><div className="summary-row"><span>Delivery</span><strong>{data.deliveryCharge}</strong></div><div className="summary-row"><span>Έκπτωση</span><strong>{data.discount}</strong></div><div className="summary-row"><span>Σύνολο</span><strong>{data.total}</strong></div>{data.cancellationReason && <p>Ακύρωση: {data.cancellationReason}{data.cancelledAt ? ` · ${date(data.cancelledAt)}` : ""}</p>}</div>{data.canCancel && <div className="order-cancel-card"><div className="eyebrow">Πριν το handover</div><h3>Ακύρωση παραγγελίας</h3><p>Η ακύρωση επιτρέπεται μόνο πριν ξεκινήσει η φυσική παράδοση. Μετά χρησιμοποιείται το return/withdrawal workflow.</p><label htmlFor="cancel-reason">Λόγος</label><textarea id="cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /><button className="button button-secondary" type="button" disabled={busy || !reason.trim()} onClick={() => void cancel()}>{busy ? "Ακύρωση…" : "Ακύρωση παραγγελίας"}</button>{error && <p className="form-error" role="alert">{error}</p>}</div>}</aside>
  </section>;
}
