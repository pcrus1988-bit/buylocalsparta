"use client";

import { useState } from "react";
import Link from "next/link";
import { WorkspaceQuickLinks } from "./WorkspaceQuickLinks";

type Product = { offerId: string; canonicalVariantId: string; title: string; retailPrice: string; supplierPrice: string; onHand: number; reserved: number; blocked: number; safetyStock: number; availableToSell: number; updatedAt: number };
type Fulfilment = { id: string; orderId: string; orderReference: string; orderStatus: string; status: string; mode: string; postcode: string; createdAt: number; customerIdentified: boolean; merchandiseSubtotal: string; deliveryCharge: string; lines: ReadonlyArray<{ id: string; title: string; quantity: number; status: string }>; actions: readonly string[] };
type Dashboard = { vendor: { id: string; name: string; adviser: string }; account: { email: string; roles: readonly string[] }; csrfToken: string; metrics: { ordersRequiringAction: number; activeProducts: number; availableUnits: number; openFulfilments: number }; products: readonly Product[]; fulfilments: readonly Fulfilment[]; finance: { supplierValueSnapshot: string; note: string } };

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const actionLabel: Record<string, string> = { accept: "Αποδοχή", reject: "Απόρριψη", ready: "Έτοιμο", delivered: "Παραδόθηκε" };

export function VendorDashboardClient({ initial }: { initial: Dashboard }) {
  const [data, setData] = useState(initial);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>(() => Object.fromEntries(initial.products.map((product) => [product.offerId, String(product.onHand)])));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function request(key: string, url: string, options: RequestInit) {
    setBusy(key);
    setError("");
    try {
      const headers = new Headers(options.headers);
      headers.set("x-csrf-token", data.csrfToken);
      const response = await fetch(url, { ...options, headers });
      const payload = await response.json() as Dashboard & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η ενέργεια απέτυχε");
      setData(payload);
      setStockDrafts(Object.fromEntries(payload.products.map((product) => [product.offerId, String(product.onHand)])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια απέτυχε");
    } finally {
      setBusy("");
    }
  }

  return <>
    <section className="shell vendor-toolbar dashboard-toolbar-refined">
      <div><span className="eyebrow">Συνδεδεμένο κατάστημα</span><strong>{data.vendor.name}</strong><small>{data.account.email}</small></div>
      <div className="vendor-toolbar-actions"><Link className="button button-secondary" href={`/vendor/${data.vendor.id}`}>Δημόσιο προφίλ</Link></div>
    </section>

    <WorkspaceQuickLinks
      density="compact"
      eyebrow="Γρήγορες ενέργειες"
      title="Τι χρειάζεται σήμερα;"
      links={[
        { kicker: "Catalog", label: "Προϊόντα & stock", description: "Κατάλογος και απόθεμα.", href: "/vendor/catalog", value: data.metrics.activeProducts },
        { kicker: "Customer", label: "Advice inbox", description: "Αιτήματα και συνεδρίες.", href: "/vendor/advice" },
        { kicker: "Fulfilment", label: "Αποστολές", description: "Labels και handover.", href: "/vendor/shipping", value: data.metrics.openFulfilments },
        { kicker: "After-sales", label: "Επιστροφές", description: "Ανατεθειμένα αιτήματα.", href: "/vendor/returns" },
        { kicker: "Trust", label: "Αξιοπιστία", description: "Media και compliance.", href: "/vendor/trust" },
        { kicker: "Business", label: "Οικονομικά", description: "Snapshots και settlements.", href: "/vendor/finance" }
      ]}
    />

    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}

    <section className="shell vendor-kpis dashboard-kpis-refined" aria-label="Vendor metrics">
      <div className={data.metrics.ordersRequiringAction > 0 ? "has-work" : undefined}><span>Χρειάζονται ενέργεια</span><strong>{data.metrics.ordersRequiringAction}</strong></div>
      <div><span>Ενεργά προϊόντα</span><strong>{data.metrics.activeProducts}</strong></div>
      <div><span>Διαθέσιμες μονάδες</span><strong>{data.metrics.availableUnits}</strong></div>
      <div><span>Ανοιχτές εκπληρώσεις</span><strong>{data.metrics.openFulfilments}</strong></div>
    </section>

    <section className="shell vendor-section" id="orders">
      <div className="section-heading dashboard-section-heading"><div><div className="eyebrow">Fulfilment</div><h2>Παραγγελίες</h2></div><p className="section-note">Μόνο οι αναθέσεις του καταστήματός σου.</p></div>
      {data.fulfilments.length ? <div className="vendor-order-list">{data.fulfilments.map((item) => <article className="vendor-order" key={item.id}>
        <div className="vendor-order-head"><div><strong>{item.orderReference}</strong><small>{date(item.createdAt)} · {item.mode} · ΤΚ {item.postcode}</small></div><span className="status-pill">{item.status}</span></div>
        <div className="vendor-order-lines">{item.lines.map((line) => <span key={line.id}>{line.quantity}× {line.title} <small>{line.status}</small></span>)}</div>
        <div className="vendor-order-foot"><span>Εμπορεύματα {item.merchandiseSubtotal} · παράδοση {item.deliveryCharge}</span><div>{item.actions.map((action) => <button key={action} type="button" className={action === "reject" ? "button button-secondary" : "button"} disabled={busy === `${item.id}:${action}`} onClick={() => void request(`${item.id}:${action}`, "/api/vendor/fulfilments/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fulfilmentId: item.id, action }) })}>{actionLabel[action] ?? action}</button>)}</div></div>
      </article>)}</div> : <div className="account-empty"><p>Δεν υπάρχουν ανατεθειμένες παραγγελίες αυτή τη στιγμή.</p></div>}
    </section>

    <section className="vendor-section section-tint" id="inventory"><div className="shell">
      <div className="section-heading dashboard-section-heading"><div><div className="eyebrow">Inventory</div><h2>Απόθεμα</h2></div><p className="section-note">Οι δεσμευμένες μονάδες προστατεύονται αυτόματα.</p></div>
      <div className="vendor-product-grid">{data.products.map((product) => <article className="vendor-product" key={product.offerId}>
        <div className="vendor-product-title"><div><strong>{product.title}</strong><small>{product.canonicalVariantId}</small></div><span>{product.availableToSell} διαθέσιμα</span></div>
        <dl><div><dt>Τιμή πελάτη</dt><dd>{product.retailPrice}</dd></div><div><dt>Τιμή προμηθευτή</dt><dd>{product.supplierPrice}</dd></div><div><dt>Δεσμευμένα</dt><dd>{product.reserved}</dd></div><div><dt>Safety stock</dt><dd>{product.safetyStock}</dd></div></dl>
        <div className="stock-editor"><label htmlFor={`stock-${product.offerId}`}>On hand</label><input id={`stock-${product.offerId}`} type="number" min={product.reserved} max={1000000} step="1" value={stockDrafts[product.offerId] ?? String(product.onHand)} onChange={(event) => setStockDrafts((current) => ({ ...current, [product.offerId]: event.target.value }))} /><button className="button" type="button" disabled={busy === `stock:${product.offerId}`} onClick={() => void request(`stock:${product.offerId}`, "/api/vendor/inventory", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ offerId: product.offerId, onHand: Number(stockDrafts[product.offerId]) }) })}>Ενημέρωση</button></div>
        <small>Τελευταία ενημέρωση {date(product.updatedAt)}</small>
      </article>)}</div>
    </div></section>

    <section className="shell vendor-section"><div className="finance-panel dashboard-finance-panel"><div><div className="eyebrow">Οικονομικά</div><h2>{data.finance.supplierValueSnapshot}</h2><p>Λειτουργικό snapshot αξίας προμηθευτή.</p></div><div className="fairness-note"><strong>Δεν είναι διαθέσιμο υπόλοιπο.</strong><p>Η πληρωμή οριστικοποιείται μετά από invoice matching και settlement controls.</p></div></div></section>
  </>;
}
