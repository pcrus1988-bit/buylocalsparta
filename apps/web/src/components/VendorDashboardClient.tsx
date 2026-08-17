"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { WorkspaceQuickLinks } from "./WorkspaceQuickLinks";

type Product = { offerId: string; canonicalVariantId: string; title: string; retailPrice: string; supplierPrice: string; onHand: number; reserved: number; blocked: number; safetyStock: number; availableToSell: number; updatedAt: number };
type Fulfilment = { id: string; orderId: string; orderStatus: string; status: string; mode: string; postcode: string; createdAt: number; customerIdentified: boolean; merchandiseSubtotal: string; deliveryCharge: string; lines: ReadonlyArray<{ id: string; title: string; quantity: number; status: string }>; actions: readonly string[] };
type Dashboard = { vendor: { id: string; name: string; adviser: string }; account: { email: string; roles: readonly string[] }; csrfToken: string; metrics: { ordersRequiringAction: number; activeProducts: number; availableUnits: number; openFulfilments: number }; products: readonly Product[]; fulfilments: readonly Fulfilment[]; finance: { supplierValueSnapshot: string; note: string } };

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const actionLabel: Record<string, string> = { accept: "Αποδοχή", reject: "Απόρριψη", ready: "Έτοιμο για παραλαβή", delivered: "Παραδόθηκε τοπικά" };

export function VendorDashboardClient({ initial }: { initial: Dashboard }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>(() => Object.fromEntries(initial.products.map((product) => [product.offerId, String(product.onHand)])));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function request(key: string, url: string, options: RequestInit) {
    setBusy(key); setError("");
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
    } finally { setBusy(""); }
  }

  async function logout() {
    setBusy("logout");
    try {
      await fetch("/api/vendor/logout", { method: "POST", headers: { "x-csrf-token": data.csrfToken } });
      router.replace("/vendor/login"); router.refresh();
    } finally { setBusy(""); }
  }

  return <>
    <section className="shell vendor-toolbar">
      <div><span className="eyebrow">Vendor session</span><strong>{data.vendor.name}</strong><small>{data.account.email} · {data.account.roles.join(", ")}</small></div>
      <div className="vendor-toolbar-actions"><Link className="button button-secondary" href={`/vendor/${data.vendor.id}`}>Δημόσιο προφίλ</Link><button className="button button-secondary" type="button" onClick={logout} disabled={busy === "logout"}>Αποσύνδεση</button></div>
    </section>

    <WorkspaceQuickLinks eyebrow="Vendor workflow" title="Πήγαινε στην εργασία που χρειάζεται τώρα." links={[
      { kicker: "Catalog", label: "Προϊόντα & stock", description: "Υπέβαλε προϊόντα και συνέχισε τον canonical matching κύκλο.", href: "/vendor/catalog", value: data.metrics.activeProducts },
      { kicker: "Fulfilment", label: "Αποστολές", description: "Δημιούργησε labels και κατέγραψε handover στον μεταφορέα.", href: "/vendor/shipping", value: data.metrics.openFulfilments },
      { kicker: "After-sales", label: "Επιστροφές", description: "Διαχειρίσου μόνο τις επιστροφές που έχουν ανατεθεί στο κατάστημά σου.", href: "/vendor/returns" },
      { kicker: "Trust", label: "Media & compliance", description: "Ανέβασε δικαιώματα εικόνων και τεκμήρια συμμόρφωσης.", href: "/vendor/trust" },
      { kicker: "Customer care", label: "Advice inbox", description: "Απάντησε σε ιδιωτικά αιτήματα και προγραμματισμένες συνεδρίες.", href: "/vendor/advice" },
      { kicker: "Business", label: "Finance & analytics", description: "Δες ελεγχόμενα οικονομικά snapshots και aggregated metrics.", href: "/vendor/finance" }
    ]} />

    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}

    <section className="shell vendor-kpis" aria-label="Vendor metrics">
      <div><span>Παραγγελίες με ενέργεια</span><strong>{data.metrics.ordersRequiringAction}</strong></div>
      <div><span>Ενεργά προϊόντα</span><strong>{data.metrics.activeProducts}</strong></div>
      <div><span>Διαθέσιμες μονάδες</span><strong>{data.metrics.availableUnits}</strong></div>
      <div><span>Ανοιχτές εκπληρώσεις</span><strong>{data.metrics.openFulfilments}</strong></div>
    </section>

    <section className="shell vendor-section" id="orders">
      <div className="section-heading"><div><div className="eyebrow">Fulfilment operations</div><h2>Παραγγελίες</h2></div><p className="section-note">Βλέπεις μόνο fulfilments που έχουν ανατεθεί στο δικό σου κατάστημα. Η δημόσια παραγγελία παραμένει μία για τον πελάτη.</p></div>
      {data.fulfilments.length ? <div className="vendor-order-list">{data.fulfilments.map((item) => <article className="vendor-order" key={item.id}>
        <div className="vendor-order-head"><div><strong>{item.orderId}</strong><small>{date(item.createdAt)} · {item.mode} · ΤΚ {item.postcode}</small></div><span className="status-pill">{item.status}</span></div>
        <div className="vendor-order-lines">{item.lines.map((line) => <span key={line.id}>{line.quantity}× {line.title} <small>{line.status}</small></span>)}</div>
        <div className="vendor-order-foot"><span>Εμπορεύματα {item.merchandiseSubtotal} · delivery {item.deliveryCharge}</span><div>{item.actions.map((action) => <button key={action} type="button" className={action === "reject" ? "button button-secondary" : "button"} disabled={busy === `${item.id}:${action}`} onClick={() => void request(`${item.id}:${action}`, "/api/vendor/fulfilments/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fulfilmentId: item.id, action }) })}>{actionLabel[action] ?? action}</button>)}</div></div>
      </article>)}</div> : <div className="account-empty"><p>Δεν υπάρχουν ακόμη fulfilments για αυτό το κατάστημα. Παραγγελίες από το production checkout θα εμφανιστούν εδώ όταν η fairness assignment τις αναθέσει στο κατάστημα.</p></div>}
    </section>

    <section className="vendor-section section-tint" id="inventory"><div className="shell">
      <div className="section-heading"><div><div className="eyebrow">Inventory</div><h2>Stock</h2></div><p className="section-note">Οι active customer reservations προστατεύονται: δεν επιτρέπεται να μειώσεις το on-hand κάτω από ήδη δεσμευμένη ποσότητα.</p></div>
      <div className="vendor-product-grid">{data.products.map((product) => <article className="vendor-product" key={product.offerId}><div className="vendor-product-title"><div><strong>{product.title}</strong><small>{product.canonicalVariantId} · {product.offerId}</small></div><span>{product.availableToSell} διαθέσιμα</span></div><dl><div><dt>Τιμή πελάτη</dt><dd>{product.retailPrice}</dd></div><div><dt>Supplier price</dt><dd>{product.supplierPrice}</dd></div><div><dt>Reserved</dt><dd>{product.reserved}</dd></div><div><dt>Safety stock</dt><dd>{product.safetyStock}</dd></div></dl><div className="stock-editor"><label htmlFor={`stock-${product.offerId}`}>On hand</label><input id={`stock-${product.offerId}`} type="number" min={product.reserved} max={1000000} step="1" value={stockDrafts[product.offerId] ?? String(product.onHand)} onChange={(event) => setStockDrafts((current) => ({ ...current, [product.offerId]: event.target.value }))} /><button className="button" type="button" disabled={busy === `stock:${product.offerId}`} onClick={() => void request(`stock:${product.offerId}`, "/api/vendor/inventory", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ offerId: product.offerId, onHand: Number(stockDrafts[product.offerId]) }) })}>Ενημέρωση</button></div><small>Τελευταία μεταβολή {date(product.updatedAt)}</small></article>)}</div>
    </div></section>

    <section className="shell vendor-section"><div className="finance-panel"><div><div className="eyebrow">Supplier accounting boundary</div><h2>{data.finance.supplierValueSnapshot}</h2><p>{data.finance.note}</p></div><div className="fairness-note"><strong>Δεν είναι payout balance.</strong><p>Το backoffice δεν μετατρέπει operational order value σε πληρωτέο. Invoice matching, fee snapshots, maker/checker settlement και payout reference παραμένουν ξεχωριστά controls.</p></div></div></section>
  </>;
}
