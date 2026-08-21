import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../../components/AccountSectionNavigation";
import { CustomerHowItWorks, CustomerLifecycle, customerOrderLifecycle } from "../../../../components/CustomerAccountPrimitives";
import { SiteHeader } from "../../../../components/SiteHeader";
import { OrderDetailClient } from "../../../../components/OrderDetailClient";
import { getAccountSession } from "../../../../lib/account-session";
import { accountOrderDetail } from "../../../../lib/account-view";

type Props = Readonly<{ params: Promise<{ id: string }> }>;
export const metadata: Metadata = { title: "Παραγγελία", robots: { index: false, follow: false } };

export default async function OrderPage({ params }: Props) {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/orders");
  const { id } = await params;
  try {
    const detail = await accountOrderDetail(principal, id);
    if (id !== detail.referenceNumber) redirect(`/account/orders/${encodeURIComponent(detail.referenceNumber)}`);
    return <main className="account-order-page">
      <div className="announcement">Παραγγελία · πού βρίσκεται τώρα, τι ακολουθεί και τι χρειάζεται από εσένα.</div>
      <SiteHeader compact />
      <AccountSectionNavigation />
      <section className="shell customer-account-page" style={{paddingBottom:18}}>
        <div className="customer-page-heading"><div><div className="eyebrow">Παραγγελία {detail.referenceNumber}</div><h1>{detail.status}</h1></div><Link className="text-link" href="/account/orders">← Όλες οι παραγγελίες</Link></div>
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
