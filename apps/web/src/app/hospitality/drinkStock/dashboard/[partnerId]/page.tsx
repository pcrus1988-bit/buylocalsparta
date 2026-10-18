import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { accessibleDrinkStockPartners, drinkStockPartnerVenues, hospitalityIdentity } from "../../../../../lib/hospitality-partner-access";
import styles from "../../../hospitality.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "DrinkStock Venue Management", robots: { index: false, follow: false } };

export default async function DrinkStockPartnerPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const principal = await hospitalityIdentity();
  if (!principal) redirect("/drinkStock/login");
  const { partnerId } = await params;
  let partner; let venues;
  try {
    partner = (await accessibleDrinkStockPartners(principal.userId)).find(p=>p.partnerId===partnerId);
    if (!partner) notFound();
    venues = await drinkStockPartnerVenues(principal.userId, partnerId);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    throw new Error("HOSPITALITY_PARTNER_UNAVAILABLE");
  }
  return <main className={styles.main}>
    <section className={styles.dashboardHeader}>
      <Link href="/drinkStock/dashboard">← Συνεργασίες</Link>
      <span className={styles.eyebrow}>DRINKSTOCK / PARTNER WORKSPACE</span>
      <h1>{partner.partnerName}</h1>
      <p>Ο ρόλος σου: {partner.role}. Η προβολή περιορίζεται σε χώρους αυτού του συνεργάτη.</p>
    </section>
    <section className={styles.partnerGrid} aria-label="Your venues">
      {venues.length ? venues.map(venue=><article className={styles.partnerCard} key={venue.venueId}>
        <span>VENUE / {venue.status.toUpperCase()}</span>
        <h2>{venue.name}</h2>
        <p>Ο πίνακας διαχείρισης τιμών και οθονών του χώρου βρίσκεται σε ανάπτυξη.</p>
      </article>) : <article className={styles.partnerCard}>
        <h2>Δεν υπάρχουν καταχωρισμένοι χώροι.</h2>
        <p>Οι χώροι θα εμφανιστούν αφού προστεθούν από την ομάδα διαχείρισης KONTA MOY.</p>
      </article>}
    </section>
  </main>;
}