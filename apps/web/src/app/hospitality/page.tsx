import Link from "next/link";
import styles from "./hospitality.module.css";

const HOSPITALITY_ORIGIN = "https://hospitality.kontamou.site";
const DRINKSTOCK_PATH = "/drinkStock";

const DRINKSTOCK_FEATURES = [
  { number: "01", title: "Dynamic pricing", copy: "Οι τιμές κινούνται με βάση τη δραστηριότητα, με κανόνες και όρια που ορίζει ο χώρος." },
  { number: "02", title: "Live market screens", copy: "Οπτικοποίηση της αγοράς ποτών σε οθόνες που μπορούν να βλέπουν οι επισκέπτες." },
  { number: "03", title: "Venue control", copy: "Κάθε επιχείρηση διαχειρίζεται τους δικούς της χώρους και τη δική της εμπειρία." },
  { number: "04", title: "POS-ready architecture", copy: "Σχεδιασμός χωρίς εξάρτηση από συγκεκριμένο POS, για μελλοντικές διασυνδέσεις." }
] as const;

const PRINCIPLES = [
  { number: "01", title: "Μία πύλη. Πολλές εφαρμογές.", copy: "Ανακάλυψε τις υπηρεσίες hospitality του KONTA MOY από ένα σταθερό σημείο εισόδου." },
  { number: "02", title: "Ξεχωριστός χώρος για κάθε συνεργάτη.", copy: "Η πρόσβαση ενεργοποιείται μόνο για εγκεκριμένους χρήστες και τις επιχειρήσεις που τους έχουν ανατεθεί." },
  { number: "03", title: "Σχεδιασμένο για να εξελίσσεται.", copy: "Κάθε νέα εφαρμογή μπορεί να ενταχθεί στο ίδιο οικοσύστημα διατηρώντας ξεχωριστές λειτουργίες και δικαιώματα." }
] as const;

export default function HospitalityGateway() {
  return (
    <main id="hospitality-gateway-main" className={styles.gatewayMain}>
      <section className={styles.gatewayHero} aria-labelledby="hospitality-heading">
        <div className={styles.gatewayHeroGlow} aria-hidden="true" />
        <div className={styles.gatewayHeroContent}>
          <div className={styles.gatewayKicker}><span className={styles.gatewayKickerDot} /> KONTA MOY / HOSPITALITY UNIVERSE</div>
          <h1 id="hospitality-heading">The future of<br /><span>hospitality</span><br />starts here<span className={styles.gatewayPeriod}>.</span></h1>
          <p className={styles.gatewayHeroLead}>Ένας νέος ψηφιακός κόσμος για bars, εστίαση και χώρους διασκέδασης. Εξειδικευμένες εφαρμογές, μία ενιαία πύλη και απόλυτος έλεγχος για κάθε συνεργάτη.</p>
          <div className={styles.gatewayHeroActions}>
            <Link className={styles.gatewayPrimaryButton} href={DRINKSTOCK_PATH}>Γνώρισε το DrinkStock <span aria-hidden="true">↗</span></Link>
            <a className={styles.gatewayGhostButton} href="#applications">Δες τις εφαρμογές <span aria-hidden="true">↓</span></a>
          </div>
          <p className={styles.gatewayHeroCaption}>Η πρώτη μας εφαρμογή βρίσκεται σε ενεργή ανάπτυξη. Η επίδειξη δεν πραγματοποιεί πραγματικές παραγγελίες ή πληρωμές.</p>
          <div className={styles.gatewayHeroTags} aria-label="Platform principles">
            <span>Cloud-first vision</span><span>Partner-specific access</span><span>Built in Sparta, Greece</span>
          </div>
        </div>
        <div className={styles.gatewayVisual} aria-hidden="true">
          <div className={styles.gatewayVisualTop}><span className={styles.gatewayPulse}><i /> DRINKSTOCK / CONCEPT PREVIEW</span><span>01</span></div>
          <div className={styles.gatewayVisualHeading}>The bar<br /><em>is the market.</em></div>
          <div className={styles.gatewayMarketBoard}>
            <div className={styles.gatewayMarketHeader}><span>ILLUSTRATIVE MARKET</span><span>PRICE MOVEMENT</span></div>
            <div className={styles.gatewayMarketRow}><span>01</span><strong>GIN & TONIC</strong><span>€ 7.20</span><b className={styles.gatewayUp}>↗</b></div>
            <div className={styles.gatewayMarketRow}><span>02</span><strong>DRAFT BEER</strong><span>€ 4.80</span><b className={styles.gatewayDown}>↘</b></div>
            <div className={styles.gatewayMarketRow}><span>03</span><strong>MOJITO</strong><span>€ 8.40</span><b className={styles.gatewayUp}>↗</b></div>
            <div className={styles.gatewayMarketFooter}><span>NO REAL TRADES</span><span>DEMO VALUES ONLY</span></div>
          </div>
          <div className={styles.gatewayVisualBottom}><span>INTERACTIVE EXPERIENCES</span><span>POWERED BY KONTA MOY ↗</span></div>
        </div>
      </section>

      <div className={styles.gatewayMarquee} aria-label="Core values"><span>ONE ECOSYSTEM</span><i aria-hidden="true">✳</i><span>INDEPENDENT WORKSPACES</span><i aria-hidden="true">✳</i><span>MORE EXPERIENCES AHEAD</span></div>

      <section className={styles.gatewaySection} id="applications" aria-labelledby="applications-heading">
        <div className={styles.gatewaySectionTop}>
          <div><span className={styles.gatewaySectionEyebrow}>01 / THE APP COLLECTION</span><h2 id="applications-heading">Οι εφαρμογές μας<span className={styles.gatewayAccent}>.</span></h2></div>
          <p>Ξεκινάμε με μία νέα εμπειρία για το bar. Το Hospitality Gateway θα υποδέχεται περισσότερες αυτόνομες υπηρεσίες καθώς θα αναπτύσσονται.</p>
        </div>
        <div className={styles.gatewayAppShowcase}>
          <article className={styles.gatewayFeaturedApp}>
            <div className={styles.gatewayFeaturedTop}><span className={styles.gatewayAppOrdinal}>APPLICATION / 001</span><span className={styles.gatewayStatus}><i /> IN DEVELOPMENT · DEMO AVAILABLE</span></div>
            <div className={styles.gatewayFeaturedIdentity}><div className={styles.gatewayFeaturedMark} aria-hidden="true">D<span>S</span></div><div><span>INTERACTIVE DRINK EXCHANGE</span><h3>DrinkStock<span>®</span></h3></div></div>
            <p>Μια διαδραστική χρηματιστηριακή εμπειρία ποτών. Η ζήτηση γίνεται μέρος του παιχνιδιού, οι τιμές κινούνται σε ελεγχόμενα όρια και κάθε χώρος διατηρεί τον δικό του πίνακα.</p>
            <div className={styles.gatewayFeatureChips}><span>Dynamic pricing</span><span>Market display</span><span>Venue management</span><span>POS-independent vision</span></div>
            <div className={styles.gatewayFeaturedActions}>
              <Link href={DRINKSTOCK_PATH} className={styles.gatewayPrimaryButton}>Ανακάλυψε το DrinkStock <span aria-hidden="true">↗</span></Link>
              <Link href={`${HOSPITALITY_ORIGIN}/drinkStock/login`} className={styles.gatewayTextLink}>Είσοδος συνεργάτη <span aria-hidden="true">→</span></Link>
            </div>
          </article>
          <article className={styles.gatewayUpcomingApp}>
            <div className={styles.gatewayUpcomingTop}><span>THE NEXT CHAPTER</span><span className={styles.gatewayUpcomingSymbol} aria-hidden="true">+</span></div>
            <div><div className={styles.gatewayUpcomingOrb} aria-hidden="true"><span>✳</span></div><h3>More to<br /><em>come.</em></h3><p>Νέες εφαρμογές για την καθημερινή λειτουργία και την εμπειρία του επισκέπτη θα βρίσκουν εδώ τη θέση τους.</p></div>
            <span className={styles.gatewayUpcomingBottom}>UPCOMING / NOT YET AVAILABLE</span>
          </article>
        </div>
      </section>

      <section className={styles.gatewaySection} id="drinkstock" aria-labelledby="drinkstock-heading">
        <div className={styles.gatewaySectionTop}>
          <div><span className={styles.gatewaySectionEyebrow}>02 / FIRST EXPERIENCE</span><h2 id="drinkstock-heading">Meet DrinkStock<span className={styles.gatewayAccent}>.</span></h2></div>
          <p>Ένα διαφορετικό εργαλείο εμπειρίας για επιχειρήσεις που θέλουν να κάνουν τη διασκέδαση πιο διαδραστική.</p>
        </div>
        <div className={styles.gatewayCapabilityGrid}>
          {DRINKSTOCK_FEATURES.map(feature => <article className={styles.gatewayCapability} key={feature.number}>
            <span>{feature.number} /</span><div className={styles.gatewayCapabilityIcon} aria-hidden="true">{feature.number === "01" ? "↗" : feature.number === "02" ? "▦" : feature.number === "03" ? "◎" : "⇄"}</div><h3>{feature.title}</h3><p>{feature.copy}</p>
          </article>)}
        </div>
        <Link href={DRINKSTOCK_PATH} className={styles.gatewayInlineArrow}>Εξερεύνησε την εφαρμογή και το διαδραστικό demo <span aria-hidden="true">↗</span></Link>
      </section>

      <section className={styles.gatewayProcessSection} id="how-it-works" aria-labelledby="process-heading">
        <div className={styles.gatewaySectionTop}><div><span className={styles.gatewaySectionEyebrow}>03 / HOW IT WORKS</span><h2 id="process-heading">Built around<br />your business<span className={styles.gatewayAccent}>.</span></h2></div><p>Από την πρώτη γνωριμία έως τη διαχείριση μιας επιχείρησης, κάθε βήμα παραμένει ξεκάθαρο.</p></div>
        <div className={styles.gatewaySteps}>
          {PRINCIPLES.map(principle => <article key={principle.number} className={styles.gatewayStep}><span>{principle.number} —</span><h3>{principle.title}</h3><p>{principle.copy}</p></article>)}
        </div>
      </section>

      <section className={styles.gatewayFaqSection} id="questions" aria-labelledby="faq-heading">
        <div className={styles.gatewaySectionTop}><div><span className={styles.gatewaySectionEyebrow}>04 / GOOD TO KNOW</span><h2 id="faq-heading">Οι συχνές ερωτήσεις<span className={styles.gatewayAccent}>.</span></h2></div></div>
        <div className={styles.gatewayFaqList}>
          <details><summary>Τι είναι το KONTA MOY Hospitality;<span aria-hidden="true">+</span></summary><p>Είναι η κεντρική πύλη εφαρμογών του οικοσυστήματος KONTA MOY για επιχειρήσεις φιλοξενίας, εστίασης και διασκέδασης. Το DrinkStock είναι η πρώτη εφαρμογή της.</p></details>
          <details><summary>Μπορώ να χρησιμοποιήσω ήδη το DrinkStock;<span aria-hidden="true">+</span></summary><p>Μπορείς να εξερευνήσεις το δημόσιο διαδραστικό demo. Οι πραγματικοί χώροι συνεργατών ενεργοποιούνται μόνο για εγκεκριμένους λογαριασμούς, ενώ το σύστημα βρίσκεται ακόμη σε ανάπτυξη.</p></details>
          <details><summary>Έχει ο κάθε συνεργάτης δικό του λογαριασμό;<span aria-hidden="true">+</span></summary><p>Η διαχείριση είναι οργανωμένη ανά συνεργάτη και χώρο. Απαιτείται εξουσιοδότηση συγκεκριμένου εγγεγραμμένου χρήστη· ένας γενικός λογαριασμός KONTA MOY δεν παρέχει αυτόματα πρόσβαση.</p></details>
          <details><summary>Χρειάζεται συγκεκριμένο σύστημα POS;<span aria-hidden="true">+</span></summary><p>Όχι για το δημόσιο demo. Οι μελλοντικές διασυνδέσεις POS σχεδιάζονται ώστε να υποστηρίζουν διαφορετικούς παρόχους· δεν παρουσιάζονται ακόμη ως διαθέσιμες ενσωματώσεις.</p></details>
        </div>
      </section>

      <section className={styles.gatewayBottomCta} aria-labelledby="gateway-last-word">
        <div><span>YOUR NEXT HOSPITALITY EXPERIENCE</span><h2 id="gateway-last-word">Ready to explore<br /><em>what's next?</em></h2><p>Ξεκίνα από το DrinkStock και γνώρισε τις δυνατότητες του νέου hospitality universe.</p></div>
        <Link href={DRINKSTOCK_PATH} className={styles.gatewayPrimaryButton}>Explore DrinkStock <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  );
}
