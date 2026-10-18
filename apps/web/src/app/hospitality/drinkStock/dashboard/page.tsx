import type { Metadata } from "next";
import Link from "next/link";
import { HospitalityLogoutButton } from "../../../../components/HospitalityLogoutButton";
import { redirect } from "next/navigation";
import { accessibleDrinkStockPartners, hospitalityIdentity } from "../../../../lib/hospitality-partner-access";
import styles from "../../hospitality.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "DrinkStock Partner Dashboard", robots: { index: false, follow: false } };

export default async function DrinkStockDashboard() {
  const principal = await hospitalityIdentity();
  if (!principal) redirect("/drinkstock/login");
  let partners;
  try {
    partners = await accessibleDrinkStockPartners(principal.userId);
  } catch {
    // Fail closed: never show partner data from a demo, stale cache or another tenant.
    return <main className={styles.main}><section className={styles.authPane}>
      <h1>Δεν είναι διαθέσιμος ο χώρος συνεργάτη.</h1>
      <p>Δεν είναι προσωρινά δυνατή η επαλήθευση της πρόσβασης. Δοκίμασε ξανά αργότερα.</p>
    </section></main>;
  }
  return <main className={styles.main}>
    <section className={styles.dashboardHeader}>
      <span className={styles.eyebrow}>DRINKSTOCK / PRIVATE WORKSPACE</span>
      <h1>Οι συνεργασίες σου.</h1><HospitalityLogoutButton />
      <p>Εμφανίζονται αποκλειστικά οι επιχειρήσεις στις οποίες ο λογαριασμός σου έχει ενεργή ανάθεση.</p>
    </section>
    {partners.length ? <section className={styles.partnerGrid} aria-label="Authorized partner accounts">
      {partners.map(partner=><article className={styles.partnerCard} key={partner.partnerId}>
        <span>PARTNER / {partner.role.toUpperCase()}</span>
        <h2>{partner.partnerName}</h2>
        <p>{partner.venueCount} ενεργοί χώροι</p>
        <Link className={styles.action} href={"/drinkstock/dashboard/" + partner.partnerId}>Άνοιγμα συνεργάτη ↗</Link>
      </article>)}
    </section> : <section className={styles.authPane}>
      <h2>Δεν υπάρχει ενεργή συνεργασία DrinkStock.</h2>
      <p>Ο λογαριασμός είναι συνδεδεμένος, αλλά δεν έχει λάβει ακόμα εξουσιοδότηση για κάποιον συνεργάτη. Η πρόσβαση δεν δίνεται αυτόματα.</p>
    </section>}
  </main>;
}