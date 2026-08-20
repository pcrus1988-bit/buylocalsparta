import type { Metadata } from "next";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { VivaPaymentResultClient } from "../../../components/VivaPaymentResultClient";
import { finalizeCapturedCustomerPayment } from "../../../lib/customer-payment-finalization";
import { reconcileVivaTransactionSafely } from "../../../lib/viva-runtime";

export const metadata: Metadata = { title: "Επιβεβαίωση πληρωμής", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function Page({ searchParams }: Props) {
  const query = await searchParams;
  const transactionId = one(query.t);
  const orderCode = one(query.s);
  let confirmed = false;
  let orderId: string | undefined;
  let orderNumber: string | undefined;
  let message = "Η πληρωμή ελέγχεται με τον πάροχο πληρωμών.";
  try {
    if (!transactionId || !orderCode) throw new Error("Missing Viva return identifiers");
    const result = await reconcileVivaTransactionSafely({ transactionId, expectedOrderCode: orderCode, source: "redirect", now: Date.now() });
    confirmed = ["captured", "partially_refunded", "refunded"].includes(result.paymentStatus);
    orderId = result.orderId;
    message = confirmed ? "Η πληρωμή επιβεβαιώθηκε και η παραγγελία σου καταχωρήθηκε." : "Η πληρωμή δεν έχει ακόμη επιβεβαιωθεί οριστικά. Η παραγγελία παραμένει σε αναμονή μέχρι την επιβεβαίωση του παρόχου.";
  } catch {
    message = "Δεν μπορέσαμε να επιβεβαιώσουμε την πληρωμή από τη σελίδα επιστροφής. Η παραγγελία δεν θεωρείται πληρωμένη μέχρι να επιβεβαιωθεί από τον πάροχο και το ασφαλές webhook.";
  }

  if (confirmed && orderId) {
    const finalized = await finalizeCapturedCustomerPayment(orderId, Date.now()).catch(() => undefined);
    orderNumber = finalized?.orderNumber;
  }

  return <main><div className="announcement">Πληρωμή · η κατάσταση της παραγγελίας βασίζεται στην επιβεβαίωση του παρόχου.</div><SiteHeader compact /><section className="shell section checkout-result-page"><VivaPaymentResultClient confirmed={confirmed}/><div className="eyebrow">Επιβεβαίωση πληρωμής</div><h1>{confirmed ? "Η πληρωμή ολοκληρώθηκε" : "Η πληρωμή ελέγχεται"}</h1><p className="lead compact">{message}</p>{orderId && <p><strong>Παραγγελία:</strong> {orderNumber ?? orderId}</p>}<div className="hero-actions"><a className="button" href="/account">Ο λογαριασμός μου</a><a className="button button-secondary" href="/shop">Συνέχεια στις αγορές</a></div></section><SiteFooter /></main>;
}
