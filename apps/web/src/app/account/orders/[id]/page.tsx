import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../../components/AccountSectionNavigation";
import { CustomerHowItWorks, CustomerLifecycle, customerOrderLifecycle } from "../../../../components/CustomerAccountPrimitives";
import { SiteHeader } from "../../../../components/SiteHeader";
import { OrderDetailClient } from "../../../../components/OrderDetailClient";
import { getAccountSession } from "../../../../lib/account-session";
import { accountOrderDetail } from "../../../../lib/account-view";
import { reconcileCustomerMollieOrder } from "../../../../lib/customer-mollie-reconciliation";

type Props = Readonly<{ params: Promise<{ id: string }> }>;
export const metadata: Metadata = { title: "Παραγγελία", robots: { index: false, follow: false } };

export default async function OrderPage({ params }: Props) {
  const { id } = await params;
  const principal = await getAccountSession();
  if (!principal) redirect(`/login?next=${encodeURIComponent(`/account/orders/${id}`)}`);
  try {
    try {
      await reconcileCustomerMollieOrder(principal, id, "manual");
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "mollie.customer_order_reconciliation_failed",
        orderId: id,
        message: error instanceof Error ? error.message : String(error)
      }));
    }
    const detail = await accountOrderDetail(principal, id);
    if (id !== detail.referenceNumber) redirect(`/account/orders/${encodeURIComponent(detail.referenceNumber)}`);
    return <main className="account-app account-order-page">
      <div className="announcement">Παραγγελία · πού βρίσκεται τώρα, τι ακολουθεί και τι χρειάζεται από εσένα.</div>
      <SiteHeader compact />
      <AccountSectionNavigation />
      <section className="shell customer-account-page account-order-intro" style={{paddingBottom:18}}>
        <div className="customer-page-heading"><div><div className="eyebrow">Οι αγορές μου · Λεπτομέρειες</div><h1>Παραγγελία {detail.referenceNumber}</h1><span className="account-order-status-highlight">{detail.status}</span></div><Link className="text-link" href="/account/orders">← Όλες οι παραγγελίες</Link></div>
        <nav className="account-order-quicklinks" aria-label="Μετάβαση σε στοιχεία παραγγελίας">{detail.sourceStatus === "pending_payment" && <a className="account-order-jump-attention" href="#order-payment">Πληρωμή</a>}{detail.pickups.some((pickup) => pickup.status === "ready") && <a className="account-order-jump-attention" href="#order-pickups">QR παραλαβής</a>}<a href="#order-products">Προϊόντα</a>{detail.fulfilments.length > 0 && detail.sourceStatus !== "pending_payment" && <a href="#order-fulfilment">Εξέλιξη</a>}{(detail.returns.length > 0 || detail.lines.some((line) => line.returnableQuantity > 0)) && <a href="#order-returns">Επιστροφές</a>}<a href="#order-summary">Σύνοψη</a><a href="#order-support">Βοήθεια</a></nav>
        <CustomerLifecycle label={`Πορεία παραγγελίας ${detail.referenceNumber}`} stages={customerOrderLifecycle(detail.status, detail.fulfilmentMode)} />
        <CustomerHowItWorks title="Τι σημαίνει η κατάσταση;"><p>Τα ολοκληρωμένα βήματα σημειώνονται με ✓. Το τρέχον βήμα δείχνει ποιος έχει τη σκυτάλη τώρα. Όταν χρειάζεται ενέργεια από εσένα, το βήμα επισημαίνεται ξεχωριστά και η διαθέσιμη ενέργεια εμφανίζεται μέσα στη σελίδα.</p></CustomerHowItWorks>
      </section>
      <OrderDetailClient initial={detail} />
    </main>;
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") notFound();
    throw error;
  }
}
