import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import { FlashSaleGame } from "../../components/FlashSaleGame";
import { getAccountSession } from "../../lib/account-session";
import { getTodayFlashSale } from "../../lib/flash-sale-runtime";
import styles from "./flash-sale.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ΚΟΝΤΑ ΜΟΥ Flash Sale | 10 προϊόντα, 10 swipes",
  description: "Το καθημερινό παιχνίδι προσφορών του ΚΟΝΤΑ ΜΟΥ για εγγεγραμμένα μέλη. 10 τυχαία προϊόντα και extra -20% στις επιλογές σου.",
  robots: { index: false, follow: true }
};

export default async function FlashSalePage() {
  const principal = await getAccountSession();
  const initialState = principal ? await getTodayFlashSale(principal.userId).catch(() => undefined) : undefined;

  return <>
    <SiteHeader />
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>ΜΟΝΟ ΓΙΑ ΜΕΛΗ · ΚΑΘΕ ΜΕΡΑ</span>
            <h1>ΚΟΝΤΑ ΜΟΥ <em>Flash Sale</em></h1>
            <p>Δεν ψάχνεις τις προσφορές. Οι προσφορές έρχονται σε εσένα. Δέκα τυχαία προϊόντα που είναι ήδη τουλάχιστον 60% κάτω από MSRP — και extra 20% σε όσα κρατήσεις.</p>
            <div className={styles.heroStats}>
              <div className={styles.heroStat}><strong>10</strong><span>προϊόντα ανά ημέρα</span></div>
              <div className={styles.heroStat}><strong>≥ -60%</strong><span>ήδη από MSRP</span></div>
              <div className={styles.heroStat}><strong>EXTRA -20%</strong><span>με δεξί swipe</span></div>
            </div>
          </div>
          <div className={styles.heroArt} aria-hidden="true">
            <div className={styles.heroCard} />
            <div className={styles.heroCard} />
            <div className={styles.heroBurst}>SWIPE &<strong>SAVE</strong></div>
          </div>
        </section>

        {principal ? <FlashSaleGame initialState={initialState} csrfToken={principal.csrfToken} /> : <section className={styles.guestPanel}>
          <div>
            <span className={styles.kicker}>Η ΣΗΜΕΡΙΝΗ ΠΑΡΤΙΔΑ ΕΙΝΑΙ ΚΛΕΙΔΩΜΕΝΗ</span>
            <h2>Μπες στο παιχνίδι. Ξεκλείδωσε τις δικές σου 10 Flash επιλογές.</h2>
            <p>Οι πραγματικές σημερινές επιλογές μένουν κρυφές μέχρι να συνδεθείς. Η εγγραφή είναι δωρεάν και κάθε λογαριασμός έχει μία συμμετοχή την ημέρα.</p>
            <div className={styles.authLinks}>
              <Link className={styles.primaryLink} href="/register?next=/flash-sale">ΕΓΓΡΑΦΗ & ΠΑΙΞΕ</Link>
              <Link className={styles.secondaryLink} href="/login?next=/flash-sale">Έχω ήδη λογαριασμό</Link>
            </div>
            <p className={styles.finePrint}>Η extra έκπτωση εφαρμόζεται σε 1 τεμάχιο ανά δεξί swipe, εφόσον το προϊόν παραμένει διαθέσιμο και επιλέξιμο στο checkout.</p>
          </div>
          <div className={styles.guestTeaser} aria-label="Κρυφό προϊόν Flash Sale">
            <div className={styles.guestFakeProduct} />
            <div className={styles.guestLock}><div><span>🔒</span><strong>-60%+ & EXTRA -20%</strong><small>Εγγραφή για αποκάλυψη</small></div></div>
          </div>
        </section>}
      </div>
    </main>
    <SiteFooter />
  </>;
}
