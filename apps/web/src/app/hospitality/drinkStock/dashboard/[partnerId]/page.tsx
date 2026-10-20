import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { accessibleDrinkStockPartners, drinkStockPartnerVenues, hospitalityIdentity } from "../../../../../lib/hospitality-partner-access";
import styles from "../../../hospitality.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "DrinkStock Venue Management", robots: { index: false, follow: false } };

export default async function DrinkStockPartnerPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const principal = await hospitalityIdentity();
  if (!principal) redirect("/drinkstock/login");
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
      <Link href="https://hospitality.kontamou.site/drinkstock/dashboard">← Συνεργασίες</Link>
      <span className={styles.eyebrow}>DRINKSTOCK / PARTNER WORKSPACE</span>
      <h1>{partner.partnerName}</h1>
      <p>Ο ρόλος σου: {partner.role}. Η προβολή περιορίζεται στους χώρους αυτού του συνεργάτη.</p>
    </section>
    {["owner","manager"].includes(partner.role)&&<section style={{maxWidth:1240,margin:"24px auto 12px",padding:"18px 22px",borderRadius:18,border:"1px solid #73835b",background:"#d9ff5716",color:"#fff"}}>
     <h2 style={{margin:"4px 0 8px"}}>📊 Trading Intelligence</h2>
     <p style={{color:"#e7e8eb",fontSize:14}}>See per-venue sessions, TV screen modes, demo activity and provider-verified order values. No simulation is counted as a sale.</p>
     <Link href={`/drinkstock/dashboard/${partnerId}/reports`} style={{display:"inline-block",background:"#d9ff57",color:"#182027",padding:"12px 17px",borderRadius:12,fontWeight:850,textDecoration:"none"}}>Open trading reports ↗</Link>
    </section>}
    {partner.role==="owner"&&<section style={{maxWidth:1240,margin:"20px auto",padding:18,border:"1px solid #89b2d0",borderRadius:15}}>
     <h2>💳 Merchant payment & tax connections</h2>
     <p>Connect your own Mollie merchant account and Greek AADE myDATA credentials. Guest checkout stays disabled until fiscal receipts are legally operational.</p>
     <Link href={`/drinkStock/dashboard/${partnerId}/payments`} className={styles.action}>Mollie & AADE setup ↗</Link>
    </section>}
    <section className={styles.partnerGrid} aria-label="Your venues">
      {venues.length ? venues.map(venue=><article className={styles.partnerCard} key={venue.venueId}>
        <span>VENUE / {venue.status.toUpperCase()}</span>
        <h2>{venue.name}</h2>
        <p>Ανεξάρτητος κατάλογος, ελεγχόμενες τιμές και ιστορικό προσομοίωσης αποκλειστικά για αυτόν τον χώρο.</p>
        {venue.status!=="active"?<p>Ο χώρος είναι ανενεργός.</p>:
         partner.role==="staff"?
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
           {venue.barAssigned&&<Link href={`/drinkstock/dashboard/${partnerId}/venues/${venue.venueId}/bar`}
             className={styles.action}>🍸 Bar station ↗</Link>}
           {venue.waiterAssigned&&<Link href={`/drinkstock/dashboard/${partnerId}/venues/${venue.venueId}/waiters`}
             className={styles.action}>🛎 Waiter station ↗</Link>}
          </div>:
          <Link href={`/drinkstock/dashboard/${partnerId}/venues/${venue.venueId}`} className={styles.action}>
           Άνοιγμα Trading Floor ↗
          </Link>}
      </article>) : <article className={styles.partnerCard}>
        <h2>Δεν υπάρχουν καταχωρισμένοι χώροι.</h2>
        <p>Οι χώροι θα εμφανιστούν αφού προστεθούν από την ομάδα διαχείρισης KONTA MOY.</p>
      </article>}
    </section>
  </main>;
}
