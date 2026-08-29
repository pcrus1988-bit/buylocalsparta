import type { Metadata } from "next";
import { AdminGiftCardsClient } from "../../../components/AdminGiftCardsClient";
import { requireAdminSession } from "../../../lib/admin-session";
import { adminGiftCards, giftCardsLiveEnabled } from "../../../lib/gift-card-service";

export const metadata: Metadata = { title: "Gift Cards", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await requireAdminSession(["super_admin"]);
  const cards = await adminGiftCards(principal).catch(() => []);
  return <main className="vendor-app"><section className="shell vendor-hero vendor-hero-compact"><div><div className="eyebrow">Admin · Gift Cards</div><h1>ΚΟΝΤΑ ΜΟΥ Gift Cards</h1><p className="lead">Έκδοση και παρακολούθηση stored-value δωροκαρτών. Οι δωροκάρτες που εκδίδονται εδώ μπορούν να συνδεθούν σε λογαριασμό πελάτη και να εξαργυρωθούν στο checkout. Η δημόσια αγορά νέων δωροκαρτών παραμένει feature-gated μέχρι να εγκριθεί ο PSP και ο φορολογικός χειρισμός.</p></div></section><section className="shell vendor-section"><AdminGiftCardsClient initial={cards} csrfToken={principal.csrfToken} liveEnabled={giftCardsLiveEnabled()} /></section></main>;
}