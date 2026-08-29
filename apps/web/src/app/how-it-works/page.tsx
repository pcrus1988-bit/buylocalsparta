import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./page.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/how-it-works", {
    title: "Πώς λειτουργεί το ΚΟΝΤΑ ΜΟΥ",
    description: "Δες ξεχωριστά πώς λειτουργεί το ΚΟΝΤΑ ΜΟΥ για πελάτες και τοπικές επιχειρήσεις: απλή αγορά, Ask Local, ένα checkout, live tracking, τοπική παράδοση και σύγχρονα εργαλεία καταστήματος."
  });
}

const customerJourney = [
  ["01", "Βρίσκεις τοπικά", "Αναζήτησε προϊόν, κατηγορία ή κατάστημα και δες την τοπική αγορά μέσα από έναν καθαρό, οργανωμένο κατάλογο."],
  ["02", "Ρωτάς άνθρωπο που γνωρίζει", "Αν χρειάζεσαι βοήθεια, χρησιμοποίησε τη συμβουλή καταστήματος ή το Ask Local. Δεν χρειάζεται να ψάχνεις μόνος σου από κατάστημα σε κατάστημα."],
  ["03", "Αγοράζεις απλά", "Βάζεις όσα χρειάζεσαι στο καλάθι και ολοκληρώνεις μία καθαρή διαδικασία checkout, ακόμη κι όταν η αγορά σου περιλαμβάνει περισσότερα τοπικά καταστήματα."],
  ["04", "Επιλέγεις τον τρόπο που σε βολεύει", "Στο checkout εμφανίζονται οι διαθέσιμες επιλογές για παραλαβή, τοπική παράδοση ή αποστολή, ανάλογα με το προϊόν και την περιοχή."],
  ["05", "Παρακολουθείς ζωντανά", "Από τον λογαριασμό σου βλέπεις την κατάσταση της παραγγελίας, το επόμενο βήμα και την εξέλιξη της παραλαβής ή της παράδοσης χωρίς τηλεφωνήματα."]
] as const;

const customerBenefits = [
  ["01", "Ένα καλάθι", "Δεν χρειάζεται να ολοκληρώνεις διαφορετικές αγορές σε διαφορετικά sites."],
  ["02", "Ask Local", "Αν δεν βρίσκεις κάτι, περιγράφεις τι χρειάζεσαι και η τοπική αγορά μπορεί να σε βοηθήσει."],
  ["03", "Live tracking", "Η παραγγελία δεν εξαφανίζεται μετά το checkout. Βλέπεις καθαρά τι συμβαίνει και ποιο είναι το επόμενο βήμα."],
  ["04", "Κοντά σημαίνει πρακτικά", "Όταν υπάρχει τοπική διαθεσιμότητα και τοπική παράδοση, η μικρή απόσταση μπορεί να κάνει την εξυπηρέτηση πιο άμεση."]
] as const;

const modernFeatures = [
  ["↗", "Live order tracking", "Κατάσταση, επόμενο βήμα, παραλαβή ή παράδοση συγκεντρωμένα στον λογαριασμό σου."],
  ["◎", "Τοπική παράδοση & pickup", "Βλέπεις τις διαθέσιμες επιλογές εκπλήρωσης και επιλέγεις αυτή που ταιριάζει καλύτερα στην παραγγελία σου."],
  ["1", "Ένα checkout", "Μία ενιαία εμπειρία αγοράς αντί για διαφορετικές διαδικασίες σε κάθε κατάστημα."],
  ["?", "Ask Local", "Το ηλεκτρονικό εμπόριο αποκτά ξανά ανθρώπινη επαφή: ρωτάς την τοπική αγορά όταν η αναζήτηση δεν αρκεί."]
] as const;

const vendorBenefits = [
  ["Χωρίς να χρειάζεσαι δικό σου e-shop", "Το κατάστημα μπορεί να αποκτήσει οργανωμένη online παρουσία, προϊόντα και λειτουργίες πώλησης χωρίς να συντηρεί μόνο του ολόκληρη υποδομή ηλεκτρονικού εμπορίου."],
  ["Το κατάστημα παραμένει ορατό", "Η ταυτότητα, οι άνθρωποι, η τεχνογνωσία και η τοποθεσία του καταστήματος παραμένουν μέρος της εμπειρίας — δεν μετατρέπεται σε ένα ανώνυμο κουτάκι προϊόντος."],
  ["Ένα σύγχρονο vendor workspace", "Κατάλογος, stock, παραγγελίες, αιτήματα πελατών και βασική λειτουργική εικόνα συγκεντρώνονται σε ένα περιβάλλον σχεδιασμένο για καθημερινή χρήση."],
  ["Περισσότερη τοπική και online ορατότητα", "Το κατάστημα γίνεται ευκολότερο να ανακαλυφθεί από κατοίκους της περιοχής και, όπου υποστηρίζεται αποστολή, μπορεί να εξυπηρετεί και πελάτες πέρα από τη Σπάρτη."],
  ["Λιγότερη τεχνική πολυπλοκότητα", "Το ΚΟΝΤΑ ΜΟΥ αναλαμβάνει την κοινή εμπειρία marketplace ώστε ο επαγγελματίας να επικεντρώνεται στο προϊόν, στον πελάτη και στην εκτέλεση της παραγγελίας."],
  ["Συμβουλή που δημιουργεί σχέση", "Μέσω Ask Local και συμβουλής καταστήματος, η γνώση του επαγγελματία γίνεται πραγματικό πλεονέκτημα και όχι κάτι που χάνεται online."]
] as const;

const customerFaq = [
  ["Χρειάζεται να κάνω ξεχωριστή αγορά σε κάθε κατάστημα;", "Όχι. Η εμπειρία του πελάτη είναι σχεδιασμένη ώστε να παραμένει ενιαία, με ένα καλάθι και μία καθαρή διαδικασία checkout."],
  ["Μπορώ να δω πού βρίσκεται η παραγγελία μου;", "Ναι. Από τον λογαριασμό σου βλέπεις την τρέχουσα κατάσταση, το επόμενο βήμα και την εξέλιξη της παραλαβής ή της παράδοσης."],
  ["Τι κάνω αν δεν βρίσκω αυτό που θέλω;", "Χρησιμοποίησε το Ask Local. Περιγράφεις τι ψάχνεις και το ΚΟΝΤΑ ΜΟΥ σε βοηθά να συνδεθείς με την κατάλληλη τοπική επιχείρηση."],
  ["Η τοπική παράδοση είναι πάντα άμεση;", "Η ταχύτητα εξαρτάται από τη διαθεσιμότητα, τον χρόνο προετοιμασίας και τον διαθέσιμο τρόπο παράδοσης. Όπου υπάρχει τοπική εκπλήρωση, η μικρή απόσταση μπορεί να κάνει τη διαδικασία σημαντικά πιο άμεση."],
  ["Μπορώ να παραλάβω από κατάστημα;", "Όταν το συγκεκριμένο προϊόν και κατάστημα υποστηρίζουν παραλαβή, η διαθέσιμη επιλογή εμφανίζεται στη ροή της παραγγελίας σου."]
] as const;

const vendorFaq = [
  ["Χρειάζομαι ήδη ηλεκτρονικό κατάστημα;", "Όχι. Το ΚΟΝΤΑ ΜΟΥ έχει σχεδιαστεί ώστε ένα τοπικό κατάστημα να μπορεί να αποκτήσει ουσιαστική online παρουσία και εργαλεία πώλησης χωρίς να χρειάζεται να λειτουργεί μόνο του πλήρες e-shop."],
  ["Χάνεται η ταυτότητα του καταστήματός μου μέσα στο marketplace;", "Όχι. Η φιλοσοφία του ΚΟΝΤΑ ΜΟΥ είναι να παραμένουν ορατά το κατάστημα, οι άνθρωποι και η γνώση τους, ώστε ο πελάτης να ξέρει ότι αγοράζει από πραγματική τοπική επιχείρηση."],
  ["Τι μπορώ να διαχειρίζομαι;", "Το vendor workspace συγκεντρώνει βασικές καθημερινές λειτουργίες όπως προϊόντα, stock, παραγγελίες και σχετικά αιτήματα πελατών, με στόχο να μειώνει την πολυπλοκότητα."],
  ["Μπορώ να απευθυνθώ και σε πελάτες εκτός Σπάρτης;", "Ναι, όπου το προϊόν και ο τρόπος εκπλήρωσης υποστηρίζουν αποστολή. Έτσι η τοπική επιχείρηση μπορεί να αποκτήσει μεγαλύτερη online ορατότητα χωρίς να χάνει την τοπική της ταυτότητα."],
  ["Πώς μπορώ να γίνω συνεργάτης;", "Από τη σελίδα συνεργασίας μπορείς να δεις τα διαθέσιμα προγράμματα, τα κριτήρια συμμετοχής και να ξεκινήσεις την αίτηση ένταξης."]
] as const;

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [...customerFaq, ...vendorFaq].map(([question, answer]) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer }
  }))
};

export default function HowItWorksPage() {
  return <main>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData).replaceAll("<", "\\u003c") }} />
    <div className="announcement">Αγοράζεις τοπικά, online, χωρίς περιττή πολυπλοκότητα.</div>
    <SiteHeader />

    <section className="content-hero content-hero-process">
      <div className="shell content-hero-grid">
        <div>
          <div className="eyebrow light">Για πελάτες & τοπικές επιχειρήσεις</div>
          <h1>Η τοπική αγορά, τόσο απλή όσο ένα σύγχρονο e-shop.</h1>
          <p>Βρίσκεις, ρωτάς, αγοράζεις και παρακολουθείς. Τα καταστήματα κρατούν την ταυτότητα και τη γνώση τους· ο πελάτης κερδίζει μία καθαρή, σύγχρονη εμπειρία αγοράς.</p>
          <div className="hero-actions">
            <a className="button button-light" href="#customers">Είμαι πελάτης</a>
            <a className="button content-outline" href="#vendors">Έχω κατάστημα</a>
          </div>
        </div>
        <div className={styles.heroSignal} aria-hidden="true">
          <div className={styles.signalCore}>
            <strong>Κοντά σου. Απλά. Σύγχρονα.</strong>
            <span>FIND</span><span>ASK</span><span>BUY</span><span>TRACK</span>
          </div>
        </div>
      </div>
    </section>

    <section className={`shell ${styles.audienceNav}`} aria-label="Επίλεξε πώς θέλεις να μάθεις περισσότερα">
      <a className={styles.audienceCard} href="#customers">
        <span className={styles.audienceKicker}>Για καταναλωτές</span>
        <h2>Θέλω να αγοράσω.</h2>
        <p>Δες πώς το ΚΟΝΤΑ ΜΟΥ κάνει την αναζήτηση, τη συμβουλή, την αγορά και την παρακολούθηση μιας τοπικής παραγγελίας απλές.</p>
        <span className={styles.audienceLink}>Πώς λειτουργεί για εμένα →</span>
      </a>
      <a className={styles.audienceCard} href="#vendors">
        <span className={styles.audienceKicker}>Για επιχειρήσεις</span>
        <h2>Θέλω να πουλάω.</h2>
        <p>Δες πώς ένα φυσικό κατάστημα αποκτά σύγχρονη online παρουσία, εργαλεία και μεγαλύτερη ορατότητα χωρίς να χάνει την ταυτότητά του.</p>
        <span className={styles.audienceLink}>Πώς λειτουργεί για το κατάστημά μου →</span>
      </a>
    </section>

    <section className="shell content-section" id="customers" aria-labelledby="customer-journey-title">
      <div className="content-heading">
        <div><div className="eyebrow">Για τον πελάτη</div><h2 id="customer-journey-title">Πέντε βήματα. Χωρίς να σκέφτεσαι τι συμβαίνει στο παρασκήνιο.</h2></div>
        <p>Ο πελάτης χρειάζεται να βλέπει μόνο ό,τι τον βοηθά να πάρει απόφαση, να αγοράσει με σιγουριά και να ξέρει τι συμβαίνει μετά την αγορά.</p>
      </div>
      <div className="process-list">{customerJourney.map(([number, title, body]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div>
    </section>

    <section className="shell content-section" aria-labelledby="customer-benefits-title">
      <div className="content-heading">
        <div><div className="eyebrow">Τι κερδίζεις</div><h2 id="customer-benefits-title">Το online γίνεται πιο ανθρώπινο και πιο κοντινό.</h2></div>
        <p>Η αξία δεν είναι μόνο ότι μπορείς να αγοράσεις online. Είναι ότι μπορείς να αγοράσεις από την πόλη σου με εργαλεία που περιμένεις από μια σύγχρονη πλατφόρμα.</p>
      </div>
      <div className={styles.benefitGrid}>{customerBenefits.map(([number, title, body]) => <article className={styles.benefitCard} key={number}><span className={styles.benefitIndex}>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>

    <section className={styles.modernBand} aria-labelledby="modern-title">
      <div className={`shell ${styles.modernBandInner}`}>
        <div className={styles.modernHeading}>
          <div><div className="eyebrow light">Σύγχρονοι μηχανισμοί</div><h2 id="modern-title">Η ευκολία ενός μεγάλου e-commerce, με την εγγύτητα της τοπικής αγοράς.</h2></div>
          <p>Το ΚΟΝΤΑ ΜΟΥ σχεδιάζεται γύρω από πραγματικές καθημερινές ανάγκες: να μη χάνεσαι σε διαφορετικά sites, να μη χρειάζεται να τηλεφωνείς για κάθε ενημέρωση και να ξέρεις τι γίνεται με την παραγγελία σου.</p>
        </div>
        <div className={styles.modernGrid}>{modernFeatures.map(([icon, title, body]) => <article className={styles.modernCard} key={title}><span className={styles.modernIcon}>{icon}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
      </div>
    </section>

    <section className="shell content-section" aria-labelledby="local-title">
      <div className={styles.localSection}>
        <div className={styles.localVisual} aria-hidden="true"><strong>Λιγότερη απόσταση. Περισσότερη επαφή.</strong></div>
        <div className={styles.localCopy}>
          <span className={styles.localKicker}>Γιατί τοπικά</span>
          <h2 id="local-title">Η Σπάρτη δεν είναι απλώς φίλτρο τοποθεσίας. Είναι μέρος της εμπειρίας.</h2>
          <p>Όταν το προϊόν βρίσκεται κοντά, ανοίγουν δυνατότητες που ένα μακρινό fulfillment δεν προσφέρει εύκολα: άμεση επικοινωνία, παραλαβή από κατάστημα και — όπου είναι διαθέσιμη — γρήγορη τοπική παράδοση.</p>
          <div className={styles.localPoints}>
            <div className={styles.localPoint}><b>1</b><div><strong>Παραλαβή από κοντά</strong><span>Παίρνεις το προϊόν από πραγματικό τοπικό κατάστημα όταν υποστηρίζεται pickup.</span></div></div>
            <div className={styles.localPoint}><b>2</b><div><strong>Μικρότερη διαδρομή</strong><span>Η τοπική εκπλήρωση μπορεί να μειώσει την απόσταση και να κάνει την εξυπηρέτηση πιο άμεση.</span></div></div>
            <div className={styles.localPoint}><b>3</b><div><strong>Πραγματικοί άνθρωποι</strong><span>Πίσω από το προϊόν υπάρχει κατάστημα της περιοχής που γνωρίζει την κατηγορία και μπορεί να βοηθήσει.</span></div></div>
          </div>
        </div>
      </div>
    </section>

    <section className={styles.vendorSection} id="vendors" aria-labelledby="vendors-title">
      <div className={`shell ${styles.vendorInner}`}>
        <div className={styles.vendorIntro}>
          <div>
            <span className={styles.vendorKicker}>Για τοπικές επιχειρήσεις</span>
            <h2 id="vendors-title">Δεν χρειάζεται να γίνεις εταιρεία τεχνολογίας για να πουλάς σύγχρονα.</h2>
            <p>Το ΚΟΝΤΑ ΜΟΥ δημιουργεί την κοινή ψηφιακή υποδομή που δύσκολα συντηρεί μόνο του ένα μικρό ή μεσαίο κατάστημα. Εσύ κρατάς την επιχείρηση, τη γνώση και τη σχέση με τον πελάτη.</p>
            <div className={styles.vendorActions}><a className="button" href="/join">Δες τη συνεργασία</a><a className="button button-secondary" href="/join/requirements">Έλεγξε αν μπορείς να συμμετέχεις</a></div>
          </div>
          <div className={styles.vendorBenefits}>{vendorBenefits.map(([title, body]) => <article className={styles.vendorBenefit} key={title}><strong>{title}</strong><span>{body}</span></article>)}</div>
        </div>
      </div>
    </section>

    <section className={styles.faqSection} aria-labelledby="faq-title">
      <div className={`shell ${styles.faqInner}`}>
        <div className={styles.faqHeader}>
          <div><div className="eyebrow light">Q&A</div><h2 id="faq-title">Οι ερωτήσεις που έχουν πραγματική σημασία.</h2></div>
          <p>Χωρίσαμε τις απαντήσεις για πελάτες και επιχειρήσεις, ώστε να βρίσκεις γρήγορα αυτό που σε αφορά χωρίς τεχνική ή εσωτερική πληροφορία που δεν χρειάζεσαι.</p>
        </div>
        <div className={styles.faqColumns}>
          <div className={styles.faqColumn}><span className={styles.faqColumnTitle}>Για πελάτες</span>{customerFaq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
          <div className={styles.faqColumn}><span className={styles.faqColumnTitle}>Για επιχειρήσεις</span>{vendorFaq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
        </div>
      </div>
    </section>

    <section className="shell content-section" aria-label="Επόμενο βήμα">
      <div className={styles.dualCta}>
        <article className={styles.ctaCard}>
          <span className={styles.featureKicker}>Θέλω να αγοράσω</span>
          <h2>Ξεκίνα από κάτι που χρειάζεσαι σήμερα.</h2>
          <p>Αναζήτησε προϊόντα και τοπικά καταστήματα ή χρησιμοποίησε το Ask Local όταν δεν βρίσκεις ακριβώς αυτό που ψάχνεις.</p>
          <div className={styles.ctaActions}><a className="button" href="/shop">Δες προϊόντα</a><a className="button button-secondary" href="/ask-local">Ask Local</a></div>
        </article>
        <article className={styles.ctaCard}>
          <span className={styles.featureKicker}>Έχω κατάστημα</span>
          <h2>Βάλε την επιχείρησή σου στην κοινή τοπική ψηφιακή αγορά.</h2>
          <p>Δες τι περιλαμβάνει η συνεργασία, ποια καταστήματα μπορούν να συμμετέχουν και πώς ξεκινά η διαδικασία ένταξης.</p>
          <div className={styles.ctaActions}><a className="button button-light" href="/join">Γίνε συνεργάτης</a><a className={`button ${styles.ctaSecondary}`} href="/help">Έχω ερώτηση</a></div>
        </article>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
