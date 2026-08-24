import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GiftCardWalletClient } from "../../../components/GiftCardWalletClient";
import { getAccountSession } from "../../../lib/account-session";
import { customerGiftCards } from "../../../lib/gift-card-service";

export const metadata: Metadata = { title: "Οι δωροκάρτες μου", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAccountSession();
  if (!principal) redirect("/account/login?next=/account/gift-cards");
  const cards = await customerGiftCards(principal).catch(() => []);
  return <main className="vendor-app"><section className="shell vendor-hero vendor-hero-compact"><div><div className="eyebrow">Account · Gift Cards</div><h1>Οι δωροκάρτες μου</h1><p className="lead">Σύνδεσε μία ΚΟΝΤΑ ΜΟΥ Gift Card και παρακολούθησε το διαθέσιμο υπόλοιπό της με ασφάλεια.</p></div></section><section className="shell vendor-section"><GiftCardWalletClient initial={cards} csrfToken={principal.csrfToken} /></section></main>;
}
