import type { Metadata } from "next";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { requireVivaPayments } from "../../../lib/viva-runtime";

export const metadata: Metadata = { title: "Η πληρωμή δεν ολοκληρώθηκε", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function Page({ searchParams }: Props) {
  const query = await searchParams;
  const transactionId = one(query.t);
  const orderCode = one(query.s);
  let detail = "Η πληρωμή δεν ολοκληρώθηκε. Το καλάθι σου παραμένει διαθέσιμο για νέα προσπάθεια όταν το checkout είναι διαθέσιμο.";
  if (transactionId && orderCode) {
    try {
      const result = await requireVivaPayments().reconcileTransaction({ transactionId, expectedOrderCode: orderCode, source: "redirect", now: Date.now() });
      if (result.paymentStatus === "captured") detail = "Ο πάροχος επιβεβαίωσε τελικά την πληρωμή. Δες την παραγγελία σου στον λογαριασμό σου.";
    } catch {
      // Failure redirects are advisory; webhook/API verification remains authoritative.
    }
  }
  return <main><div className="announcement">Πληρωμή · δεν χρεώνουμε ξανά χωρίς νέα, ρητή προσπάθεια.</div><SiteHeader compact /><section className="shell section checkout-result-page"><div className="eyebrow">Αποτέλεσμα πληρωμής</div><h1>Η πληρωμή δεν ολοκληρώθηκε</h1><p className="lead compact">{detail}</p><div className="hero-actions"><a className="button" href="/checkout">Δοκίμασε ξανά</a><a className="button button-secondary" href="/cart">Πίσω στο καλάθι</a><a className="text-link" href="/payments-security">Πληρωμές & ασφάλεια →</a></div></section><SiteFooter /></main>;
}
