import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { CustomerHowItWorks, CustomerLifecycle, customerOrderLifecycle } from "../../../components/CustomerAccountPrimitives";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { accountDashboard } from "../../../lib/account-view";

export const metadata: Metadata = { title: "Οι παραγγελίες μου", robots: { index: false, follow: false } };
type Props = Readonly<{ searchParams: Promise<{ view?: string }> }>;

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const complete = (status: string) => /ολοκληρώ|παραλήφθηκε|ακυρ|επιστράφηκαν τα χρήματα/i.test(status);
const modeLabel = (mode: string) => mode === "pickup" ? "Παραλαβή από κατάστημα" : mode === "shipping" ? "Αποστολή" : mode === "local_delivery" ? "Τοπική παράδοση" : mode;
const orderActionLabel = (status: string) => status.includes("Αναμονή πληρωμής") ? "Συνέχιση πληρωμής" : status.includes("Έτοιμη για παραλαβή") ? "Δες QR παραλαβής" : "Λεπτομέρειες παραγγελίας";
const orderActionClass = (status: string) => /Αναμονή πληρωμής|Έτοιμη για παραλαβή/.test(status) ? "button" : "button button-secondary";

export default async function CustomerOrdersPage({ searchParams }: Props) {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/orders");
  const [{ view }, dashboard] = await Promise.all([searchParams, accountDashboard(principal)]);
  const selected = ["active", "pickup", "shipping", "completed", "all"].includes(view ?? "") ? view! : "active";
  const orders = dashboard.orders.filter((order) => {
    if (selected === "all") return true;
    if (selected === "completed") return complete(order.status);
    if (selected === "pickup") return !complete(order.status) && order.fulfilmentMode === "pickup";
    if (selected === "shipping") return !complete(order.status) && order.fulfilmentMode !== "pickup";
    return !complete(order.status);
  });

  const tabs = [
    ["active", "Ενεργές"],
    ["pickup", "Παραλαβή"],
    ["shipping", "Παράδοση / αποστολή"],
    ["completed", "Ολοκληρωμένες"],
    ["all", "Όλες"]
  ] as const;

  return <main className="account-app">
    <div className="announcement">Οι παραγγελίες σου · κατάσταση, επόμενο βήμα και διαθέσιμες ενέργειες.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className="shell customer-account-page">
      <div className="customer-page-heading"><div><div className="eyebrow">Οι αγορές μου</div><h1>Παραγγελίες</h1></div><p>Δες σε μία ματιά τι ολοκληρώθηκε, τι περιμένει το κατάστημα ή τον μεταφορέα και πότε χρειάζεται κάτι από εσένα.</p></div>
      <div className="customer-filter-tabs" aria-label="Φίλτρα παραγγελιών">{tabs.map(([key, label]) => <Link className={selected === key ? "is-active" : undefined} aria-current={selected === key ? "page" : undefined} href={`/account/orders?view=${key}`} key={key}>{label}</Link>)}</div>
      <CustomerHowItWorks title="Πώς λειτουργεί η πορεία μιας παραγγελίας;"><p>Η γραμμή πορείας δείχνει τα βήματα που έχουν ολοκληρωθεί, το σημερινό βήμα και ό,τι ακολουθεί. Πορτοκαλί σημαίνει ότι χρειάζεται ενέργεια από εσένα· μπλε ότι η διαδικασία συνεχίζεται από κατάστημα, πλατφόρμα ή μεταφορέα.</p></CustomerHowItWorks>
    </section>

    <section className="shell customer-order-directory" aria-live="polite">
      {orders.length ? orders.map((order) => <article className="customer-order-card" key={order.id}>
        <div className="customer-order-card-head">
          <div><Link href={`/account/orders/${order.id}`}><strong>{order.referenceNumber}</strong></Link><small>{date(order.createdAt)} · {modeLabel(order.fulfilmentMode)}</small></div>
          <div className="customer-order-card-total"><strong>{order.total}</strong><span className="customer-order-card-status">{order.status}</span></div>
        </div>
        <div className="customer-order-card-lines">{order.lines.slice(0, 5).map((line) => <span key={line.id}>{line.quantity}× {line.title}</span>)}</div>
        <CustomerLifecycle label={`Πορεία παραγγελίας ${order.referenceNumber}`} stages={customerOrderLifecycle(order.status, order.fulfilmentMode)} />
        <div className="customer-order-card-actions"><Link className={orderActionClass(order.status)} href={`/account/orders/${order.id}`}>{orderActionLabel(order.status)}</Link></div>
      </article>) : <div className="account-empty"><h2>Δεν υπάρχουν παραγγελίες σε αυτή την προβολή.</h2><p>Άλλαξε φίλτρο ή συνέχισε τις αγορές σου.</p><Link className="button" href="/shop">Ανακάλυψε προϊόντα</Link></div>}
    </section>
  </main>;
}
