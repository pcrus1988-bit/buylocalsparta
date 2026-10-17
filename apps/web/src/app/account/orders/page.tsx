import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { CustomerHowItWorks, CustomerLifecycle, customerOrderLifecycle } from "../../../components/CustomerAccountPrimitives";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { accountDashboard } from "../../../lib/account-view";
import { reconcileCustomerMollieOrder } from "../../../lib/customer-mollie-reconciliation";

export const metadata: Metadata = { title: "Οι παραγγελίες μου", robots: { index: false, follow: false } };
type Props = Readonly<{ searchParams: Promise<{ view?: string; q?: string; payment?: string; orderId?: string }> }>;

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const complete = (status: string) => /ολοκληρώ|παραλήφθηκε|ακυρ|επιστράφηκαν τα χρήματα/i.test(status);
const modeLabel = (mode: string) => mode === "pickup" ? "Παραλαβή από κατάστημα" : mode === "shipping" ? "Αποστολή" : mode === "local_delivery" ? "Τοπική παράδοση" : mode;
const orderActionLabel = (status: string) => status.includes("Αναμονή πληρωμής") ? "Συνέχιση πληρωμής" : status.includes("Έτοιμη για παραλαβή") ? "Δες QR παραλαβής" : "Λεπτομέρειες παραγγελίας";
const orderActionClass = (status: string) => /Αναμονή πληρωμής|Έτοιμη για παραλαβή/.test(status) ? "button" : "button button-secondary";

export default async function CustomerOrdersPage({ searchParams }: Props) {
  const params = await searchParams;
  const mollieReturnOrderId = typeof params.orderId === "string" ? params.orderId.trim() : "";
  const isMollieReturn = params.payment === "mollie" && Boolean(mollieReturnOrderId);
  const principal = await getAccountSession();
  if (!principal) {
    const next = isMollieReturn
      ? `/account/orders?payment=mollie&orderId=${encodeURIComponent(mollieReturnOrderId)}`
      : "/account/orders";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  if (isMollieReturn) {
    let target = `/account/orders/${encodeURIComponent(mollieReturnOrderId)}`;
    try {
      const reconciliation = await reconcileCustomerMollieOrder(principal, mollieReturnOrderId, "redirect");
      target = `/account/orders/${encodeURIComponent(reconciliation.referenceNumber)}`;
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "mollie.customer_return_reconciliation_failed",
        orderId: mollieReturnOrderId,
        message: error instanceof Error ? error.message : String(error)
      }));
    }
    redirect(target);
  }

  const dashboard = await accountDashboard(principal);
  const { view } = params;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const normalizedQuery = query.toLocaleLowerCase("el-GR");
  const selected = ["active", "attention", "pickup", "shipping", "completed", "all"].includes(view ?? "") ? view! : "active";
  const orders = dashboard.orders.filter((order) => {
    if (normalizedQuery && ![order.referenceNumber, order.status, ...order.lines.map((line) => line.title)].some((text) => text.toLocaleLowerCase("el-GR").includes(normalizedQuery))) return false;
    if (selected === "all") return true;
    if (selected === "completed") return complete(order.status);
    if (selected === "attention") return !complete(order.status) && /Αναμονή πληρωμής|Έτοιμη για παραλαβή|Χρειάζεται ενέργεια/i.test(order.status);
    if (selected === "pickup") return !complete(order.status) && order.fulfilmentMode === "pickup";
    if (selected === "shipping") return !complete(order.status) && order.fulfilmentMode !== "pickup";
    return !complete(order.status);
  }).sort((a, b) => b.createdAt - a.createdAt);

  const activeOrders = dashboard.orders.filter((order) => !complete(order.status));
  const tabs = [
    ["active", "Ενεργές", activeOrders.length],
    ["attention", "Χρειάζεται ενέργεια", activeOrders.filter((order) => /Αναμονή πληρωμής|Έτοιμη για παραλαβή|Χρειάζεται ενέργεια/i.test(order.status)).length],
    ["pickup", "Παραλαβή", activeOrders.filter((order) => order.fulfilmentMode === "pickup").length],
    ["shipping", "Παράδοση / αποστολή", activeOrders.filter((order) => order.fulfilmentMode !== "pickup").length],
    ["completed", "Ολοκληρωμένες", dashboard.orders.length - activeOrders.length],
    ["all", "Όλες", dashboard.orders.length]
  ] as const;
  const attentionCount = activeOrders.filter((order) => /Αναμονή πληρωμής|Έτοιμη για παραλαβή|Χρειάζεται ενέργεια/i.test(order.status)).length;
  const selectedLabel = tabs.find(([key]) => key === selected)?.[1] ?? "Ενεργές";
  const emptyCategory = !query && selected !== "all" && selected !== "active";

  return <main className="account-app">
    <div className="announcement">Οι παραγγελίες σου · κατάσταση, επόμενο βήμα και διαθέσιμες ενέργειες.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className="shell customer-account-page account-orders-intro">
      <div className="customer-page-heading"><div><div className="eyebrow">Οι αγορές μου</div><h1>Παραγγελίες</h1></div><p>Παρακολούθησε κάθε αγορά, βρες τον κωδικό παραλαβής σου και δες πότε χρειάζεται δική σου ενέργεια.</p></div>
      <div className="account-orders-stats" aria-label="Σύνοψη παραγγελιών"><Link href="/account/orders?view=active"><span>Ενεργές</span><strong>{activeOrders.length}</strong></Link><Link href="/account/orders?view=completed"><span>Ολοκληρωμένες / κλειστές</span><strong>{dashboard.orders.length - activeOrders.length}</strong></Link><Link className={attentionCount ? "needs-attention" : undefined} href="/account/orders?view=attention"><span>Με ενέργεια από εσένα</span><strong>{attentionCount}</strong></Link></div>
      <form className="account-orders-search" action="/account/orders" method="GET" role="search"><input name="view" type="hidden" value={selected} /><label htmlFor="account-order-query">Βρες παραγγελία</label><div><input id="account-order-query" name="q" type="search" maxLength={100} defaultValue={query} placeholder="Αριθμός παραγγελίας ή προϊόν…" autoComplete="off" /><button className="button button-secondary" type="submit">Αναζήτηση</button>{query && <Link className="account-orders-clear" href={`/account/orders?view=${selected}`}>Καθαρισμός</Link>}</div></form>
      <div className="customer-filter-tabs" aria-label="Φίλτρα παραγγελιών">{tabs.map(([key, label, count]) => <Link className={selected === key ? "is-active" : undefined} aria-current={selected === key ? "page" : undefined} href={`/account/orders?view=${key}${query ? `&q=${encodeURIComponent(query)}` : ""}`} key={key}>{label} <span className="filter-count">{count}</span></Link>)}</div>
      <CustomerHowItWorks title="Πώς λειτουργεί η πορεία μιας παραγγελίας;"><p>Η γραμμή πορείας δείχνει τα βήματα που έχουν ολοκληρωθεί, το σημερινό βήμα και ό,τι ακολουθεί. Πορτοκαλί σημαίνει ότι χρειάζεται ενέργεια από εσένα· μπλε ότι η διαδικασία συνεχίζεται από κατάστημα, πλατφόρμα ή μεταφορέα.</p></CustomerHowItWorks>
    </section>

    <section className="shell customer-order-directory account-orders-directory" aria-live="polite" aria-label={`Παραγγελίες: ${selectedLabel}`}>
      <div className="account-orders-results"><div><span className="eyebrow">Αποτελέσματα</span><h2>{selectedLabel} <span>{orders.length}</span></h2></div>{query && <p>Αναζήτηση: <strong>{query}</strong></p>}</div>
      {orders.length ? orders.map((order) => <article className={`customer-order-card account-order-card${/Αναμονή πληρωμής|Έτοιμη για παραλαβή|Χρειάζεται ενέργεια/i.test(order.status) ? " needs-attention" : ""}`} key={order.id}>
        <div className="customer-order-card-head">
          <div><Link href={`/account/orders/${order.id}`}><strong>{order.referenceNumber}</strong></Link><small>{date(order.createdAt)} · {modeLabel(order.fulfilmentMode)}</small></div>
          <div className="customer-order-card-total"><strong>{order.total}</strong><span className="customer-order-card-status">{order.status}</span></div>
        </div>
        <div className="customer-order-card-lines">{order.lines.slice(0, 3).map((line) => <span key={line.id}>{line.quantity}× {line.title}</span>)}{order.lines.length > 3 && <span>+{order.lines.length - 3} ακόμη</span>}</div>
        <details className="account-order-progress"><summary>Πορεία παραγγελίας <span aria-hidden="true">⌄</span></summary><CustomerLifecycle label={`Πορεία παραγγελίας ${order.referenceNumber}`} stages={customerOrderLifecycle(order.status, order.fulfilmentMode)} /></details>
        <div className="customer-order-card-actions"><Link className={orderActionClass(order.status)} href={`/account/orders/${order.id}`}>{orderActionLabel(order.status)}</Link></div>
      </article>) : <div className="account-empty"><h2>{query ? "Δεν βρέθηκε παραγγελία" : "Δεν υπάρχουν παραγγελίες εδώ"}</h2><p>{query ? "Δοκίμασε άλλο αριθμό ή όνομα προϊόντος." : "Δοκίμασε άλλη κατηγορία ή συνέχισε τις αγορές σου."}</p><div className="account-orders-empty-actions"><Link className="button button-secondary" href={emptyCategory || query ? "/account/orders?view=all" : "/account/orders?view=active"}>Προβολή όλων</Link><Link className="button" href="/shop">Ανακάλυψε προϊόντα</Link></div></div>}
    </section>
  </main>;
}
