import Link from "next/link";
import type { Metadata } from "next";
import { HelpCenterRequestForm } from "../../components/HelpCenterRequestForm";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./page.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/help", {
    title: "Κέντρο βοήθειας ΚΟΝΤΑ ΜΟΥ",
    description: "Βοήθεια για παραγγελίες, πληρωμές, tracking, παραλαβές, επιστροφές, Gift Cards, Ask Local, λογαριασμούς, καταστήματα και Local Delivery Partners."
  });
}

const quickHelp = [
  ["ΠΑΡΑΓΓΕΛΙΑ", "Πού είναι η παραγγελία μου;", "Δες την τρέχουσα κατάσταση, τα επιμέρους δέματα και το επόμενο βήμα.", "/account/orders", "Οι παραγγελίες μου"],
  ["TRACKING", "Θέλω να παρακολουθήσω αποστολή", "Μάθε πότε ενεργοποιείται το tracking και γιατί μπορεί να υπάρχουν περισσότερα από ένα tracking numbers.", "/delivery-pickup", "Παράδοση & tracking"],
  ["ΕΠΙΣΤΡΟΦΗ", "Θέλω επιστροφή ή έχω πρόβλημα με προϊόν", "Δες τη διαδικασία για υπαναχώρηση, λάθος προϊόν, ζημιά, ελάττωμα ή εγγύηση.", "/returns-refunds", "Επιστροφές & εγγύηση"],
  ["ΠΛΗΡΩΜΗ", "Η πληρωμή απέτυχε ή δεν είμαι σίγουρος αν πέρασε", "Έλεγξε πρώτα την κατάσταση της παραγγελίας και δες πώς λειτουργούν Mollie, κάρτα και Klarna.", "/payments-security", "Πληρωμές & ασφάλεια"],
  ["ASK LOCAL", "Δεν βρίσκω αυτό που χρειάζομαι", "Περιέγραψε την ανάγκη σου και ζήτησε βοήθεια από πραγματικά καταστήματα.", "/ask-local", "Ρώτησε την τοπική αγορά"],
  ["GIFT CARD", "Έχω Gift Card", "Σύνδεσέ τη με τον λογαριασμό σου, δες το υπόλοιπο και μάθε πώς χρησιμοποιείται online ή «Στο μαγαζί».", "/gift-cards", "Βοήθεια για Gift Cards"]
] as const;

const customerLinks = [
  ["Παραγγελίες", "Κατάσταση, λεπτομέρειες και ενέργειες για κάθε αγορά.", "/account/orders"],
  ["Παράδοση & παραλαβή", "Pickup, τοπική παράδοση, ACS, DHL/DPD και tracking.", "/delivery-pickup"],
  ["Επιστροφές & εγγύηση", "Υπαναχώρηση, BAZAAR, ελαττώματα και επιστροφή χρημάτων.", "/returns-refunds"],
  ["Πληρωμές", "Κάρτα, Klarna, Mollie και τι να κάνεις αν μια πληρωμή διακοπεί.", "/payments-security"],
  ["Gift Cards", "Υπόλοιπο, εξαργύρωση και χρήση στο φυσικό κατάστημα.", "/gift-cards"],
  ["Ask Local", "Ζήτησε συμβουλή ή προσφορά όταν τα φίλτρα δεν αρκούν.", "/ask-local"],
  ["Flash Sales", "Πώς λειτουργούν οι ενεργές προσφορές περιορισμένου χρόνου.", "/flash-sale"],
  ["BAZAAR", "Τι σημαίνει open-box, tester, return ή δηλωμένη ατέλεια.", "/bazaar"],
  ["Απόρρητο & δεδομένα", "Ρυθμίσεις ιδιωτικότητας και αιτήματα δεδομένων.", "/privacy-controls"],
  ["Πώς λειτουργεί", "Ολόκληρη η διαδρομή πελάτη, καταστήματος και delivery.", "/how-it-works"]
] as const;

const accountLinks = [
  ["Δεν μπορώ να συνδεθώ", "/login"],
  ["Ξέχασα τον κωδικό μου", "/forgot-password"],
  ["Θέλω να δημιουργήσω λογαριασμό", "/register"],
  ["Ασφάλεια λογαριασμού", "/account/security"],
  ["Οι ειδοποιήσεις μου", "/account/notifications"],
  ["Τα αποθηκευμένα μου", "/account/saved"],
  ["Τα αιτήματα υποστήριξής μου", "/account/support"]
] as const;

const partnerLinks = [
  ["Έχω κατάστημα και θέλω να συνεργαστώ", "Δες προϋποθέσεις, προγράμματα και ξεκίνα την αίτηση συνεργασίας.", "/join"],
  ["Είμαι ήδη συνεργάτης", "Μπες στον χώρο συνεργάτη για παραγγελίες, κατάλογο, stock, Daily και οικονομικά.", "/vendor/login"],
  ["Είμαι Local Delivery Partner", "Άνοιξε την εφαρμογή οδηγού για βάρδιες, εργασίες, QR και παραδόσεις.", "/driver/login"],
  ["Θέλω να καταλάβω το μοντέλο", "Δες πώς συνδέονται πελάτες, καταστήματα και τοπική παράδοση.", "/how-it-works#vendors"]
] as const;

const faq = [
  ["Πρέπει να επικοινωνήσω με το κατάστημα ή με το ΚΟΝΤΑ ΜΟΥ;", "Για μια online παραγγελία ξεκίνα από το ΚΟΝΤΑ ΜΟΥ και τη συγκεκριμένη παραγγελία σου. Έτσι το αίτημα συνδέεται με τη σωστή αγορά και μπορούμε να δούμε ποιο επόμενο βήμα χρειάζεται."],
  ["Η παραγγελία μου έχει προϊόντα από διαφορετικά καταστήματα. Είναι φυσιολογικό να έρθουν χωριστά;", "Ναι. Μία αγορά μπορεί να εκτελείται από περισσότερους συνεργάτες, οπότε μπορεί να υπάρχουν διαφορετικοί χρόνοι προετοιμασίας, δέματα ή tracking numbers."],
  ["Το tracking δεν έχει κίνηση. Σημαίνει ότι χάθηκε το δέμα;", "Όχι απαραίτητα. Μετά τη δημιουργία της αποστολής μπορεί να χρειαστεί χρόνος μέχρι ο μεταφορέας να κάνει το πρώτο scan. Αν η κατάσταση παραμένει αμετάβλητη για ασυνήθιστα μεγάλο διάστημα, άνοιξε αίτημα υποστήριξης."],
  ["Μπορώ να αλλάξω ή να ακυρώσω παραγγελία αφού πληρώσω;", "Εξαρτάται από την κατάσταση της παραγγελίας. Άνοιξε τη συγκεκριμένη αγορά από τον λογαριασμό σου για να δεις τις διαθέσιμες ενέργειες. Αν έχει ήδη προχωρήσει η εκτέλεση, μπορεί να χρειαστεί διαδικασία επιστροφής."],
  ["Έκανα πληρωμή αλλά δεν ξέρω αν ολοκληρώθηκε.", "Μην πληρώσεις αμέσως δεύτερη φορά. Έλεγξε πρώτα την παραγγελία σου. Η κατάσταση ενημερώνεται όταν επιβεβαιωθεί η πληρωμή από τον πάροχο."],
  ["Μπορώ να ζητήσω βοήθεια χωρίς αριθμό παραγγελίας;", "Ναι. Ο αριθμός παραγγελίας βοηθά όταν το θέμα αφορά συγκεκριμένη αγορά, αλλά μπορείς να ανοίξεις αίτημα και για λογαριασμό, τεχνικό θέμα, ιδιωτικότητα ή άλλη απορία."],
  ["Πού θα δω την απάντηση της υποστήριξης;", "Τα αιτήματα υποστήριξης έχουν δική τους σελίδα στον λογαριασμό σου. Εκεί βλέπεις τον αριθμό ticket, την κατάσταση, τις απαντήσεις της ομάδας και μπορείς να απαντήσεις στο ίδιο νήμα."],
  ["Έχω κατάστημα. Χρησιμοποιώ την ίδια υποστήριξη με τον πελάτη;", "Ο χώρος συνεργάτη έχει διαφορετικές λειτουργικές διαδρομές από τον λογαριασμό πελάτη. Για καθημερινές εργασίες ξεκίνα από το Vendor Workspace και το KONTA MOY Daily."]
] as const;

export default function HelpPage() {
  return <main>
    <div className="announcement">Κέντρο βοήθειας · βρες απάντηση, άνοιξε τη σωστή σελίδα ή δημιούργησε αίτημα υποστήριξης.</div>
    <SiteHeader />

    <section className={styles.hero}>
      <div className="shell">
        <div className={styles.heroGrid}>
          <div>
            <div className="eyebrow light">Κέντρο βοήθειας ΚΟΝΤΑ ΜΟΥ</div>
            <h1>Πώς μπορούμε να βοηθήσουμε;</h1>
            <p>Ξεκίνα από το θέμα που σε αφορά. Οι περισσότερες απαντήσεις και ενέργειες είναι διαθέσιμες αμέσως — και αν χρειάζεσαι άνθρωπο, μπορείς να ανοίξεις πραγματικό αίτημα υποστήριξης.</p>
            <div className="hero-actions">
              <a className="button button-light" href="#quick-help">Βρες γρήγορη λύση</a>
              <a className="button content-outline" href="#contact-support">Επικοινωνία με υποστήριξη</a>
            </div>
          </div>
          <div className={styles.heroPanel} aria-hidden="true">
            <span>HELP CENTER</span>
            <strong>?</strong>
            <small>ORDER · PAY · TRACK · RETURN · ASK</small>
          </div>
        </div>
      </div>
    </section>

    <section className={`shell ${styles.quickSection}`} id="quick-help">
      <div className={styles.sectionHeading}>
        <div><div className="eyebrow">Γρήγορη βοήθεια</div><h2>Ποιο από αυτά σε έφερε εδώ;</h2></div>
        <p>Οι πιο συχνές περιπτώσεις οδηγούν κατευθείαν στο σωστό σημείο.</p>
      </div>
      <div className={styles.quickGrid}>
        {quickHelp.map(([kicker,title,body,href,action]) => <article key={title}>
          <span>{kicker}</span><h3>{title}</h3><p>{body}</p><Link href={href}>{action} →</Link>
        </article>)}
      </div>
    </section>

    <section className={styles.customerSection}>
      <div className="shell">
        <div className={styles.sectionHeading}>
          <div><div className="eyebrow">Για πελάτες</div><h2>Όλα τα βασικά σε ένα σημείο.</h2></div>
          <p>Από την αναζήτηση μέχρι την επιστροφή, άνοιξε απευθείας τον οδηγό ή τη λειτουργία που χρειάζεσαι.</p>
        </div>
        <div className={styles.linkDirectory}>
          {customerLinks.map(([title,body,href]) => <Link href={href} key={title}><strong>{title}</strong><span>{body}</span><i>→</i></Link>)}
        </div>
      </div>
    </section>

    <section className="shell content-section">
      <div className={styles.splitHelp}>
        <div>
          <div className="eyebrow">Λογαριασμός</div>
          <h2>Σύνδεση, κωδικός και προσωπικές λειτουργίες.</h2>
          <div className={styles.simpleLinks}>
            {accountLinks.map(([title,href]) => <Link href={href} key={title}>{title}<span>→</span></Link>)}
          </div>
        </div>
        <div className={styles.tipCard}>
          <span>Χρήσιμη συμβουλή</span>
          <h3>Αν το θέμα αφορά συγκεκριμένη αγορά, ξεκίνα πάντα από την παραγγελία.</h3>
          <p>Εκεί υπάρχουν η πραγματική κατάσταση, τα προϊόντα, η πληρωμή, ο τρόπος παράδοσης και οι διαθέσιμες ενέργειες. Αυτό γλιτώνει χρόνο και αποφεύγει παρεξηγήσεις.</p>
          <Link className="button button-secondary" href="/account/orders">Άνοιξε τις παραγγελίες</Link>
        </div>
      </div>
    </section>

    <section className={styles.partnerSection}>
      <div className="shell">
        <div className={styles.sectionHeadingDark}>
          <div><div className="eyebrow light">Καταστήματα & Delivery Partners</div><h2>Είσαι συνεργάτης;</h2></div>
          <p>Πήγαινε απευθείας στον χώρο που αντιστοιχεί στον ρόλο σου.</p>
        </div>
        <div className={styles.partnerGrid}>
          {partnerLinks.map(([title,body,href]) => <article key={title}><h3>{title}</h3><p>{body}</p><Link href={href}>Συνέχεια →</Link></article>)}
        </div>
      </div>
    </section>

    <section className={`shell ${styles.supportSection}`} id="contact-support">
      <div className={styles.supportIntro}>
        <div>
          <div className="eyebrow">Δεν λύθηκε;</div>
          <h2>Στείλε το θέμα σου στην ομάδα υποστήριξης.</h2>
        </div>
        <p>Γράψε από τώρα τι έχει συμβεί. Αν χρειάζεται σύνδεση, θα συνεχίσεις από τον λογαριασμό σου χωρίς να ξεκινήσεις πάλι από την αρχή. Το τελικό αίτημα γίνεται ticket ώστε να μπορείς να παρακολουθείς την πορεία και τις απαντήσεις.</p>
      </div>
      <div className={styles.supportCard}>
        <HelpCenterRequestForm />
      </div>
    </section>

    <section className={styles.faqSection}>
      <div className="shell">
        <div className={styles.sectionHeadingDark}>
          <div><div className="eyebrow light">Συχνές ερωτήσεις</div><h2>Μερικές απαντήσεις πριν χρειαστείς ticket.</h2></div>
        </div>
        <div className={styles.faqList}>
          {faq.map(([question,answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
        </div>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
