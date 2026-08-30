import type { Metadata } from "next";
import { AdminGiftCardsClient } from "../../../components/AdminGiftCardsClient";
import { requireAdminSession } from "../../../lib/admin-session";
import { adminGiftCards, giftCardsLiveEnabled } from "../../../lib/gift-card-service";
import { adminVendorPhysicalGiftCards } from "../../../lib/vendor-gift-card-service";

export const metadata: Metadata = { title: "Gift Cards", robots: { index: false, follow: false } };

const euro = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

export default async function Page() {
  const principal = await requireAdminSession();
  const [cards, physicalCards] = await Promise.all([
    adminGiftCards(principal).catch(() => []),
    adminVendorPhysicalGiftCards(principal).catch(() => [])
  ]);
  return <main className="vendor-app">
    <section className="shell vendor-hero vendor-hero-compact"><div><div className="eyebrow">Admin · Gift Cards</div><h1>ΚΟΝΤΑ ΜΟΥ Gift Cards</h1><p className="lead">Έκδοση και παρακολούθηση stored-value δωροκαρτών. Οι δωροκάρτες που εκδίδονται εδώ μπορούν να συνδεθούν σε λογαριασμό πελάτη και να εξαργυρωθούν στο checkout. Η δημόσια αγορά νέων δωροκαρτών παραμένει feature-gated μέχρι να εγκριθεί ο PSP και ο φορολογικός χειρισμός.</p></div></section>
    <section className="shell vendor-section"><AdminGiftCardsClient initial={cards} csrfToken={principal.csrfToken} liveEnabled={giftCardsLiveEnabled()} /></section>
    <section className="shell vendor-section">
      <div className="workspace-tool-panel"><h2>Gift Cards από φυσικά καταστήματα</h2><p>Πλήρης ορατότητα των καρτών που εξέδωσαν ενεργοί συνεργάτες μέσω Daily, με Vendor UID και διαθέσιμο υπόλοιπο.</p></div>
      <div className="workspace-queue-list">
        {physicalCards.length ? physicalCards.map((card) => <article className="workspace-queue-card" key={card.id}>
          <div className="workspace-queue-head"><div><strong>•••{card.suffix} · {euro(card.balanceMinor)}</strong><small>{card.issuedByVendorName} · {card.issuedByVendorId}</small></div><span className="status-pill">{card.status}</span></div>
          <div className="workspace-queue-primary"><span>Initial {euro(card.initialValueMinor)}</span><span>{card.recipientName ?? "No recipient name"}</span><span>{new Date(card.issuedAt).toLocaleString("el-GR")}</span></div>
        </article>) : <div className="workspace-inline-note">Δεν υπάρχουν ακόμη Gift Cards που εκδόθηκαν από φυσικό κατάστημα.</div>}
      </div>
    </section>
  </main>;
}
