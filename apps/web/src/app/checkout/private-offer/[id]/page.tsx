import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrivateOfferCheckoutClient } from "../../../../components/PrivateOfferCheckoutClient";
import { SiteFooter } from "../../../../components/SiteFooter";
import { SiteHeader } from "../../../../components/SiteHeader";
import { getAccountSession } from "../../../../lib/account-session";
import { customerCheckoutProfile } from "../../../../lib/customer-address-runtime";
import { customerPrivateOfferBrowserPreview } from "../../../../lib/customer-private-offer-browser-view";
import { vivaPaymentsProviderReadiness } from "../../../../lib/viva-runtime";

export const metadata: Metadata = { title: "Ιδιωτική προσφορά · Checkout", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
type Props = Readonly<{ params: Promise<{ id: string }> }>;

function money(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

export default async function PrivateOfferCheckoutPage({ params }: Props) {
  const { id } = await params;
  const principal = await getAccountSession();
  if (!principal?.roles.includes("customer")) redirect(`/login?next=${encodeURIComponent(`/checkout/private-offer/${id}`)}`);
  const offer = await customerPrivateOfferBrowserPreview(principal, id);
  if (!offer) notFound();
  if (id !== offer.offerId) redirect(`/checkout/private-offer/${encodeURIComponent(offer.offerId)}`);
  const profile = await customerCheckoutProfile(principal);
  const viva = await vivaPaymentsProviderReadiness();
  const checkoutEnabled = process.env.NODE_ENV === "production" ? viva.enabled && viva.ready : true;

  return <main>
    <div className="announcement">Ιδιωτική προσφορά Ask Local · η αποδεκτή τιμή παραμένει δεσμευμένη στη συγκεκριμένη αγορά.</div>
    <SiteHeader compact />
    <section className="shell page-hero">
      <div className="eyebrow">Ask Local {offer.requestId}</div>
      <h1>{offer.existingOrderId ? "Η προσφορά έγινε ήδη παραγγελία." : "Ολοκλήρωσε την αποδεκτή προσφορά."}</h1>
      <p className="lead">{offer.quantity}× {offer.title} · {money(offer.unitPriceMinor)} / τεμ. · από {offer.vendorName}</p>
    </section>

    <section className="shell page-section">
      {offer.existingOrderId ? <div className="empty-state"><h2>Υπάρχει ήδη παραγγελία για αυτή την προσφορά.</h2><p>Για να μην δημιουργηθεί διπλή χρέωση, κάθε αποδεκτή ιδιωτική προσφορά μπορεί να συνδεθεί μόνο με μία παραγγελία.</p><Link className="button" href={`/account/orders/${encodeURIComponent(offer.existingOrderId)}`}>Προβολή παραγγελίας</Link></div>
      : !offer.purchasable ? <div className="empty-state"><h2>Η προσφορά δεν μπορεί ακόμη να ολοκληρωθεί online.</h2><p>{offer.unavailableReason ?? "Χρειάζεται επιβεβαίωση προϊόντος ή αποθέματος από το κατάστημα."}</p><Link className="button button-secondary" href="/account/ask-local">Πίσω στο Ask Local</Link></div>
      : profile.addresses.length === 0 ? <div className="empty-state"><h2>Χρειάζεται διεύθυνση τιμολόγησης.</h2><p>Πρόσθεσε πρώτα τα στοιχεία σου στον λογαριασμό και επέστρεψε στην ιδιωτική προσφορά.</p><Link className="button" href="/account/profile">Στοιχεία λογαριασμού</Link></div>
      : <PrivateOfferCheckoutClient offer={offer} addresses={profile.addresses} csrfToken={principal.csrfToken} checkoutEnabled={checkoutEnabled} />}
    </section>
    <SiteFooter />
  </main>;
}
