import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GiftCardWalletClient } from "../../../components/GiftCardWalletClient";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerGiftCards } from "../../../lib/gift-card-service";

export const metadata: Metadata = { title: "Οι δωροκάρτες μου", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/gift-cards");
  const cards = await customerGiftCards(principal).catch(() => []);

  return <main className="account-app">
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className="shell customer-account-page">
      <div className="customer-page-heading">
        <div><div className="eyebrow">Οι αγορές μου · Δωροκάρτες</div><h1>Οι δωροκάρτες μου</h1></div>
        <p>Σύνδεσε μία δωροκάρτα ΚΟΝΤΑ ΜΟΥ, δες το διαθέσιμο υπόλοιπο και βρες όλες τις κάρτες σου σε ένα σημείο.</p>
      </div>
      <GiftCardWalletClient initial={cards} csrfToken={principal.csrfToken} />
    </section>
  </main>;
}
