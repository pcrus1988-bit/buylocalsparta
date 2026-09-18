import Link from "next/link";
import type { Metadata } from "next";
import { RoleAccessButton } from "../../components/RoleAccessButton";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./page.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/how-it-works", {
    title: "Πώς λειτουργεί το ΚΟΝΤΑ ΜΟΥ",
    description: "Δες πώς λειτουργεί το ΚΟΝΤΑ ΜΟΥ για πελάτες, τοπικές επιχειρήσεις και συνεργάτες τοπικής παράδοσης: αγορά, Ask Local, Flash Sales, Gift Cards, παραγγελίες, pickup, delivery και live tracking."
  });
}

const customerJourney = [
  ["01", "Διαλέγεις την περιοχή σου", "Το ΚΟΝΤΑ ΜΟΥ προσαρμόζει την εμπειρία στην ενεργή τοπική αγορά, ώστε να βλέπεις προϊόντα, καταστήματα και επιλογές εξυπηρέτησης που έχουν πραγματικό νόημα για εσένα."],
  ["02", "Βρίσκεις προϊόντα, κατηγορίες και καταστήματα", "Αναζήτησε απευθείας αυτό που χρειάζεσαι ή ξεκίνα από κατηγορία, ιδέα ή κατάστημα. Η εμπειρία συνδυάζει προϊόντα και πραγματικές τοπικές επιχειρήσεις."],
  ["03", "Ρωτάς την τοπική αγορά όταν η αναζήτηση δεν αρκεί", "Με Ask Local μπορείς να περιγράψεις τι χρειάζεσαι, να λάβεις διευκρινίσεις ή προσφορές και, όπου υποστηρίζεται, να προγραμματίσεις επαφή ή ραντεβού με κατάστημα."],
  ["04", "Ανακαλύπτεις περισσότερους τρόπους να κερδίσεις αξία", "Flash Sales, Gift Cards και BAZAAR δημιουργούν διαφορετικούς τρόπους αγοράς. Στο BAZAAR η κατάσταση του προϊόντος δηλώνεται ξεκάθαρα πριν αγοράσεις."],
  ["05", "Βάζεις προϊόντα από διαφορετικά καταστήματα σε ένα καλάθι", "Δεν χρειάζεται να επαναλαμβάνεις checkout σε κάθε κατάστημα. Η εμπειρία παραμένει ενιαία ακόμη κι όταν η παραγγελία εκτελείται από περισσότερους συνεργάτες."],
  ["06", "Πληρώνεις με ασφάλεια και βλέπεις το τελικό κόστος", "Στο checkout εμφανίζονται η παραγγελία, τα έξοδα παράδοσης όπου υπάρχουν και οι διαθέσιμες μέθοδοι πληρωμής, όπως κάρτα ή Klarna όταν είναι διαθέσιμη."],
  ["07", "Παραλαμβάνεις όπως σε εξυπηρετεί και παρακολουθείς την πορεία", "Ανάλογα με το κατάστημα μπορεί να υπάρχει pickup, τοπική παράδοση ή αποστολή. Για αποστολές εμφανίζονται tracking στοιχεία και, όπου υποστηρίζεται, live ενημέρωση."],
  ["08", "Ο λογαριασμός σου κρατά όλη την εικόνα", "Παραγγελίες, Gift Cards, ειδοποιήσεις, αποθηκευμένα, Ask Local, επιστροφές και υποστήριξη συγκεντρώνονται σε ένα σημείο."]
] as const;

const vendorJourney = [
  ["01", "Γίνε συνεργάτης και στήσε το δημόσιο προφίλ σου", "Μετά την ένταξη οργανώνεις την εικόνα του καταστήματος, τα στοιχεία επικοινωνίας, τις φωτογραφίες και τις λειτουργίες που θέλεις να προσφέρεις."],
  ["02", "Φέρε τον κατάλογό σου στο ΚΟΝΤΑ ΜΟΥ", "Διαχειρίζεσαι προϊόντα, τιμές, stock, φωτογραφίες και κατηγορίες. Όπου είναι ενεργοποιημένο, μπορείς επίσης να χρησιμοποιείς διαθέσιμες dropshipping πηγές μέσα από ξεχωριστή ροή."],
  ["03", "Δούλεψε καθημερινά από Vendor Workspace ή Daily", "Οι παραγγελίες που χρειάζονται ενέργεια εμφανίζονται πρώτες. Από κινητό μπορείς να χρησιμοποιείς Daily για προετοιμασία, QR, ειδοποιήσεις, Quick Add και άλλες γρήγορες εργασίες."],
  ["04", "Εξυπηρέτησε πελάτες, όχι απλώς παραγγελίες", "Ask Local, μηνύματα, ραντεβού και ιδιωτικές προσφορές επιτρέπουν στο κατάστημα να αξιοποιεί τη γνώση και την ανθρώπινη εξυπηρέτηση που ήδη έχει offline."],
  ["05", "Διάλεξε πώς παραδίδεις", "Μπορείς να ενεργοποιείς pickup, τοπική παράδοση ή αποστολή όπου υποστηρίζεται. Το ΚΟΝΤΑ ΜΟΥ κρατά την παραγγελία και τις επιμέρους καταστάσεις οργανωμένες."],
  ["06", "Χρησιμοποίησε QR και σαφή επόμενα βήματα", "Pickup, handover και επιλεγμένες λειτουργίες ολοκληρώνονται με ασφαλείς επιβεβαιώσεις ώστε το κατάστημα να ξέρει τι έχει παραδοθεί και τι απομένει."],
  ["07", "Παρακολούθησε οικονομικά και απόδοση", "Ο χώρος συνεργάτη συγκεντρώνει παραστατικά, πληρωμές, πωλήσεις, αποθέματα, analytics και αναφορές ώστε να μην χρειάζεται ξεχωριστό σύστημα για κάθε λειτουργία."],
  ["08", "Χτίσε μεγαλύτερη ψηφιακή παρουσία", "Το κατάστημα παραμένει αναγνωρίσιμο μέσα στο marketplace, ενώ η οργανωμένη δομή προϊόντων, καταστήματος και τοπικής αγοράς βοηθά την online ανακάλυψη."]
] as const;

const deliveryJourney = [
  ["01", "Συνδέεσαι από το κινητό και ξεκινάς βάρδια", "Η εφαρμογή οδηγού είναι mobile-first. Με το clock in δηλώνεις διαθεσιμότητα και ενεργοποιείται η λειτουργική παρουσία που χρειάζεται για τις αναθέσεις."],
  ["02", "Λαμβάνεις προτάσεις εργασίας", "Ο dispatcher μπορεί να εμφανίζει διαθέσιμες παραδόσεις ή επιστροφές. Αποδέχεσαι την εργασία ή δηλώνεις συγκεκριμένο λόγο αν δεν μπορείς να την αναλάβεις."],
  ["03", "Βλέπεις τη σωστή σειρά στάσεων", "Μετά την ανάθεση εμφανίζονται τα επόμενα σημεία της διαδρομής. Οι διευθύνσεις πελάτη παραμένουν προστατευμένες μέχρι να υπάρχει πραγματική ανάγκη πρόσβασης."],
  ["04", "Παραλαμβάνεις από τα καταστήματα με επιβεβαίωση", "Στα pickup σημεία χρησιμοποιείται QR όπου προβλέπεται, ώστε κάθε παραλαβή να συνδέεται με τη σωστή εργασία και το σωστό κατάστημα."],
  ["05", "Ενεργοποιείς το τελικό σκέλος προς τον πελάτη", "Όταν ολοκληρωθούν οι παραλαβές, το Final leg δηλώνει ότι ξεκινάς πραγματικά προς τον πελάτη και ενεργοποιεί το αντίστοιχο live tracking όπου υποστηρίζεται."],
  ["06", "Ολοκληρώνεις την παράδοση με QR", "Στον προορισμό, η παράδοση ή η επιστροφή επιβεβαιώνεται από τη σωστή ροή QR ώστε η κατάσταση να ενημερώνεται άμεσα."],
  ["07", "Βλέπεις ώρες, ιστορικό και απόδοση", "Ο οδηγός έχει πρόσβαση σε βάρδιες, χρόνο εργασίας, ιστορικό εργασιών και βασικά στατιστικά για τις παραδόσεις του."]
] as const;

const platformUpgrades = [
  ["ASK LOCAL", "Συμβουλή πριν την αγορά", "Ο πελάτης μπορεί να ζητήσει βοήθεια από πραγματικά καταστήματα, αντί να περιορίζεται σε φίλτρα και αναζήτηση."],
  ["ONE CHECKOUT", "Ένα καλάθι, πολλές επιχειρήσεις", "Η εμπειρία αγοράς παραμένει ενιαία ακόμη όταν διαφορετικά προϊόντα εκτελούνται από διαφορετικούς συνεργάτες."],
  ["FLASH SALES", "Προσφορές με πραγματικό χρονικό όριο", "Οι εγγεγραμμένοι χρήστες μπορούν να βλέπουν ενεργές Flash Sales και την πραγματική διαθεσιμότητα της προσφοράς."],
  ["BAZAAR", "Δεύτερη ζωή σε προϊόντα", "Pre-owned, open-box, returns, testers ή προϊόντα με δηλωμένες ατέλειες παρουσιάζονται με ξεκάθαρη κατάσταση πριν την αγορά."],
  ["GIFT CARDS", "Online και «Στο μαγαζί»", "Η αξία μπορεί να χρησιμοποιείται σε επιλέξιμες αγορές και, όπου υποστηρίζεται, σε συμμετέχοντα φυσικά καταστήματα."],
  ["TRACKING", "Από το κατάστημα μέχρι εσένα", "Pickup, τοπική παράδοση, courier tracking και live ενημέρωση συνδέονται με τη συγκεκριμένη παραγγελία."],
  ["PAYMENTS", "Ασφαλές checkout", "Οι online πληρωμές περνούν από Mollie και εμφανίζονται οι διαθέσιμες επιλογές, όπως κάρτα ή Klarna όπου υποστηρίζεται."],
  ["RETURNS", "Επιστροφές και εγγύηση με σαφή διαδρομή", "Ο πελάτης ξεκινά από την παραγγελία του και το ΚΟΝΤΑ ΜΟΥ κρατά συγκεντρωμένη την υπόθεση επιστροφής, ελαττώματος ή εγγύησης."]
] as const;

const customerFaq = [
  ["Χρειάζεται να αγοράζω ξεχωριστά από κάθε κατάστημα;", "Όχι. Το ΚΟΝΤΑ ΜΟΥ έχει σχεδιαστεί για ένα καλάθι και μία ενιαία εμπειρία checkout, ακόμη όταν η παραγγελία περιλαμβάνει περισσότερους συνεργάτες."],
  ["Πώς βλέπω πού βρίσκεται η παραγγελία μου;", "Από τον λογαριασμό σου βλέπεις την κατάσταση της παραγγελίας και τα διαθέσιμα tracking στοιχεία. Για επιλεγμένες τοπικές παραδόσεις μπορεί να υπάρχει και live ενημέρωση."],
  ["Τι κάνω αν δεν βρίσκω αυτό που θέλω;", "Χρησιμοποίησε Ask Local και περιέγραψε τι χρειάζεσαι. Η τοπική αγορά μπορεί να απαντήσει με διευκρινίσεις, προτάσεις ή ιδιωτικές προσφορές."],
  ["Μπορώ να παραλάβω από κατάστημα;", "Ναι, όταν ο συγκεκριμένος συνεργάτης και η παραγγελία υποστηρίζουν local pickup. Η επιλογή εμφανίζεται στη ροή αγοράς και λαμβάνεις επιβεβαίωση όταν είναι έτοιμη."]
] as const;

const vendorFaq = [
  ["Χρειάζομαι δικό μου e-shop;", "Όχι. Το ΚΟΝΤΑ ΜΟΥ παρέχει κοινή υποδομή marketplace, ενώ εσύ διαχειρίζεσαι την επιχείρηση, τον κατάλογο, το stock και την εξυπηρέτηση."],
  ["Τι είναι το KONTA MOY Daily;", "Είναι η γρήγορη mobile εμπειρία για καθημερινές εργασίες όπως παραγγελίες, pickup, QR, ειδοποιήσεις, Quick Add και άλλες λειτουργίες καταστήματος."],
  ["Μπορώ να προσφέρω pickup ή τοπική παράδοση;", "Ναι, όπου η λειτουργία είναι διαθέσιμη και έχει ενεργοποιηθεί για το κατάστημά σου. Οι επιλογές εμφανίζονται στον πελάτη όταν ταιριάζουν στην παραγγελία."],
  ["Πώς μπαίνω στον χώρο συνεργάτη;", "Η είσοδος γίνεται από τον ιδιωτικό χώρο συνεργάτη. Η σελίδα πρόσβασης δεν προβάλλεται ως δημόσιος προορισμός αναζήτησης."]
] as const;

const deliveryFaq = [
  ["Η εφαρμογή οδηγού λειτουργεί σε desktop;", "Η βασική εφαρμογή οδηγού είναι σχεδιασμένη για κινητό, επειδή χρειάζεται χρήση εν κινήσει, GPS, QR και γρήγορη πρόσβαση στις ενεργές εργασίες."],
  ["Πότε εμφανίζεται η διεύθυνση πελάτη;", "Η εφαρμογή περιορίζει την πρόσβαση στα στοιχεία προορισμού μέχρι να υπάρχει πραγματική λειτουργική ανάγκη, όπως μετά την αποδοχή της εργασίας."],
  ["Πώς επιβεβαιώνεται η παράδοση;", "Η ροή χρησιμοποιεί QR όπου προβλέπεται, ώστε pickup, final leg και παράδοση να συνδέονται με τη σωστή εργασία."],
  ["Βλέπω το ιστορικό των βαρδιών μου;", "Ναι. Η εφαρμογή διαθέτει στοιχεία βάρδιας, ώρες, ιστορικό εργασιών και βασικά operational statistics."]
] as const;

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [...customerFaq, ...vendorFaq, ...deliveryFaq].map(([question, answer]) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer }
  }))
};

function Journey({ items }: { items: readonly (readonly [string, string, string])[] }) {
  return <div className={styles.journeyGrid}>
    {items.map(([number, title, body]) => <article className={styles.journeyCard} key={number}>
      <span className={styles.journeyNumber}>{number}</span>
      <div><h3>{title}</h3><p>{body}</p></div>
    </article>)}
  </div>;
}

export default function HowItWorksPage() {
  return <main>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData).replaceAll("<", "\\u003c") }} />
    <div className="announcement">Τρεις διαδρομές · μία κοινή τοπική αγορά.</div>
    <SiteHeader />

    <section className="content-hero content-hero-process">
      <div className="shell content-hero-grid">
        <div>
          <div className="eyebrow light">Πώς λειτουργεί σήμερα το ΚΟΝΤΑ ΜΟΥ</div>
          <h1>Άλλη εμπειρία για τον πελάτη. Άλλη για το κατάστημα. Άλλη για την τοπική παράδοση.</h1>
          <p>Το ΚΟΝΤΑ ΜΟΥ δεν είναι μόνο ένα storefront. Είναι ένα συνδεδεμένο σύστημα αγοράς, εξυπηρέτησης και παράδοσης, με ξεχωριστό χώρο για κάθε ρόλο.</p>
          <div className="hero-actions">
            <a className="button button-light" href="#customers">Πελάτης</a>
            <a className="button content-outline" href="#vendors">Κατάστημα</a>
            <a className="button content-outline" href="#delivery-partners">Delivery Partner</a>
          </div>
        </div>
        <div className={styles.heroSignal} aria-hidden="true">
          <div className={styles.signalCore}>
            <strong>DISCOVER · SELL · DELIVER</strong>
            <span>ASK</span><span>BUY</span><span>PACK</span><span>TRACK</span><span>DELIVER</span><span>RETURN</span>
          </div>
        </div>
      </div>
    </section>

    <section className={`shell ${styles.audienceNav}`} aria-label="Επίλεξε τον ρόλο σου">
      <a className={styles.audienceCard} href="#customers">
        <span className={styles.audienceKicker}>Customer</span>
        <h2>Θέλω να αγοράσω.</h2>
        <p>Ανακάλυψη, Ask Local, Flash Sales, Gift Cards, ένα checkout, pickup, delivery και tracking.</p>
        <span className={styles.audienceLink}>Δες τη διαδρομή πελάτη →</span>
      </a>
      <a className={styles.audienceCard} href="#vendors">
        <span className={styles.audienceKicker}>Vendor</span>
        <h2>Θέλω να πουλάω.</h2>
        <p>Κατάλογος, stock, παραγγελίες, Daily, εξυπηρέτηση, fulfilment, οικονομικά και analytics.</p>
        <span className={styles.audienceLink}>Δες τη διαδρομή καταστήματος →</span>
      </a>
      <a className={styles.audienceCard} href="#delivery-partners">
        <span className={styles.audienceKicker}>Local Delivery</span>
        <h2>Θέλω να παραδίδω.</h2>
        <p>Mobile driver app, shifts, dispatcher, pickup QR, GPS, final leg, delivery confirmation και history.</p>
        <span className={styles.audienceLink}>Δες τη διαδρομή delivery →</span>
      </a>
    </section>

    <section className="shell content-section" aria-labelledby="upgrades-title">
      <div className="content-heading">
        <div><div className="eyebrow">Τι έχει εξελιχθεί</div><h2 id="upgrades-title">Περισσότερο από marketplace προϊόντων.</h2></div>
        <p>Οι τελευταίες αναβαθμίσεις συνδέουν πλέον την ανακάλυψη, τη συμβουλή, την πληρωμή, την τοπική λειτουργία και την παράδοση σε μία συνεχή εμπειρία.</p>
      </div>
      <div className={styles.upgradeGrid}>
        {platformUpgrades.map(([kicker, title, body]) => <article className={styles.upgradeCard} key={kicker}>
          <span>{kicker}</span><h3>{title}</h3><p>{body}</p>
        </article>)}
      </div>
    </section>

    <section className={styles.roleSection} id="customers" aria-labelledby="customers-title">
      <div className="shell">
        <div className={styles.roleHeader}>
          <div>
            <span className={styles.roleBadge}>01 · CUSTOMER</span>
            <h2 id="customers-title">Από την ανάγκη μέχρι την παραλαβή — χωρίς να κυνηγάς διαφορετικά συστήματα.</h2>
            <p>Ο πελάτης βλέπει μία ενιαία εμπειρία, ενώ το ΚΟΝΤΑ ΜΟΥ οργανώνει στο παρασκήνιο τα διαφορετικά καταστήματα, τις επιλογές παράδοσης και τις ενημερώσεις.</p>
          </div>
          <div className={styles.roleActions}>
            <RoleAccessButton destination="/login" className="button">Σύνδεση πελάτη</RoleAccessButton>
            <Link className="button button-secondary" href="/shop">Δες προϊόντα</Link>
          </div>
        </div>
        <Journey items={customerJourney} />
      </div>
    </section>

    <section className={styles.roleSectionAlt} id="vendors" aria-labelledby="vendors-title">
      <div className="shell">
        <div className={styles.roleHeader}>
          <div>
            <span className={styles.roleBadge}>02 · VENDOR</span>
            <h2 id="vendors-title">Το φυσικό κατάστημα αποκτά ένα πλήρες ψηφιακό λειτουργικό περιβάλλον.</h2>
            <p>Η δημόσια παρουσία και η καθημερινή λειτουργία είναι ξεχωριστές: οι πελάτες βλέπουν το κατάστημά σου, ενώ εσύ δουλεύεις μέσα σε ιδιωτικό workspace που εμφανίζει μόνο ό,τι αφορά την επιχείρησή σου.</p>
          </div>
          <div className={styles.roleActions}>
            <RoleAccessButton destination="/vendor/login" className="button">Σύνδεση συνεργάτη</RoleAccessButton>
            <Link className="button button-secondary" href="/join">Γίνε συνεργάτης</Link>
          </div>
        </div>
        <Journey items={vendorJourney} />
      </div>
    </section>

    <section className={styles.deliverySection} id="delivery-partners" aria-labelledby="delivery-title">
      <div className="shell">
        <div className={styles.roleHeader}>
          <div>
            <span className={styles.roleBadgeLight}>03 · LOCAL DELIVERY PARTNER</span>
            <h2 id="delivery-title">Μία mobile εφαρμογή για τη βάρδια, τις αναθέσεις και την απόδειξη κάθε βήματος.</h2>
            <p>Η εφαρμογή οδηγού είναι σχεδιασμένη για πραγματική χρήση στον δρόμο: διαθέσιμες εργασίες, σειρά στάσεων, GPS, QR, live tracking και ιστορικό χωρίς περιττό back-office.</p>
          </div>
          <div className={styles.roleActions}>
            <RoleAccessButton destination="/driver/login" className="button button-light">Σύνδεση Delivery Partner</RoleAccessButton>
          </div>
        </div>
        <Journey items={deliveryJourney} />
      </div>
    </section>

    <section className="shell content-section" aria-labelledby="together-title">
      <div className={styles.ecosystem}>
        <div>
          <div className="eyebrow">Πώς συνδέονται οι τρεις ρόλοι</div>
          <h2 id="together-title">Μία παραγγελία περνά από διαφορετικά χέρια — αλλά παραμένει μία εμπειρία.</h2>
          <p>Ο πελάτης αγοράζει. Το κατάστημα προετοιμάζει. Ο delivery partner παραλαμβάνει και παραδίδει. Το ΚΟΝΤΑ ΜΟΥ κρατά την κοινή κατάσταση ώστε κάθε πλευρά να βλέπει μόνο ό,τι χρειάζεται τη σωστή στιγμή.</p>
        </div>
        <div className={styles.ecosystemFlow} aria-label="Customer to vendor to delivery flow">
          <div><span>1</span><strong>Customer</strong><small>Αγορά & επιλογή παράδοσης</small></div>
          <i>→</i>
          <div><span>2</span><strong>Vendor</strong><small>Προετοιμασία & handover</small></div>
          <i>→</i>
          <div><span>3</span><strong>Delivery</strong><small>Pickup, final leg & QR</small></div>
          <i>→</i>
          <div><span>4</span><strong>Customer</strong><small>Tracking & παραλαβή</small></div>
        </div>
      </div>
    </section>

    <section className={styles.faqSection} aria-labelledby="faq-title">
      <div className={`shell ${styles.faqInner}`}>
        <div className={styles.faqHeader}>
          <div><div className="eyebrow light">Q&A ανά ρόλο</div><h2 id="faq-title">Βρες γρήγορα αυτό που σε αφορά.</h2></div>
          <p>Οι ιδιωτικές περιοχές πρόσβασης είναι ξεχωριστές από το δημόσιο site. Τα κουμπιά σύνδεσης παραπάνω δεν αποδίδονται ως κανονικοί crawlable σύνδεσμοι.</p>
        </div>
        <div className={styles.faqColumns}>
          <div className={styles.faqColumn}><span className={styles.faqColumnTitle}>Customer</span>{customerFaq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
          <div className={styles.faqColumn}><span className={styles.faqColumnTitle}>Vendor</span>{vendorFaq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
          <div className={styles.faqColumn}><span className={styles.faqColumnTitle}>Local Delivery</span>{deliveryFaq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
        </div>
      </div>
    </section>

    <section className="shell content-section" aria-label="Επόμενο βήμα">
      <div className={styles.tripleCta}>
        <article className={styles.ctaCard}>
          <span className={styles.featureKicker}>Customer</span>
          <h2>Βρες κάτι που χρειάζεσαι.</h2>
          <p>Αναζήτησε προϊόντα, καταστήματα και ιδέες ή ζήτησε βοήθεια από την τοπική αγορά.</p>
          <div className={styles.ctaActions}><Link className="button" href="/shop">Shop</Link><Link className="button button-secondary" href="/ask-local">Ask Local</Link></div>
        </article>
        <article className={styles.ctaCard}>
          <span className={styles.featureKicker}>Vendor</span>
          <h2>Βάλε το κατάστημά σου στην πλατφόρμα.</h2>
          <p>Δες τις επιλογές συνεργασίας και ξεκίνα την ένταξη της επιχείρησής σου.</p>
          <div className={styles.ctaActions}><Link className="button" href="/join">Συνεργασία</Link><Link className="button button-secondary" href="/join/requirements">Προϋποθέσεις</Link></div>
        </article>
        <article className={styles.ctaCardDark}>
          <span className={styles.featureKickerLight}>Delivery</span>
          <h2>Είσαι ήδη συνεργάτης παράδοσης;</h2>
          <p>Η είσοδος στην driver εφαρμογή γίνεται από τον ιδιωτικό χώρο πρόσβασης στο κινητό σου.</p>
          <div className={styles.ctaActions}><RoleAccessButton destination="/driver/login" className="button button-light">Άνοιγμα Driver Login</RoleAccessButton></div>
        </article>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
