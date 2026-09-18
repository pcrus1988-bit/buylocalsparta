import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./page.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/fairness", {
    title: "Δίκαιη έκθεση καταστημάτων · Fair Vendor Exposure",
    description: "Πώς το ΚΟΝΤΑ ΜΟΥ ενοποιεί τα ίδια προϊόντα, ελέγχει επιλεξιμότητα και κατανέμει δίκαια την έκθεση ανάμεσα σε καταστήματα χωρίς πληρωμένη προτεραιότητα."
  });
}

const eligibility = [
  ["Ενεργό κατάστημα", "Το κατάστημα και η τοποθεσία του πρέπει να είναι ενεργά και διαθέσιμα να εξυπηρετήσουν."],
  ["Εγκεκριμένη προσφορά", "Το συγκεκριμένο offer πρέπει να είναι εγκεκριμένο και το προϊόν να επιτρέπεται να πωληθεί."],
  ["Πραγματικό απόθεμα", "Μηδενικό ή παλιό stock δεν συμμετέχει σαν να ήταν διαθέσιμο."],
  ["Μπορεί να εξυπηρετήσει", "Παράδοση, pickup, περιοχή, χωρητικότητα και fulfilment πρέπει να ταιριάζουν στο συγκεκριμένο context."],
  ["Εμπορικά όρια", "Η προσφορά πρέπει να περνά τα εσωτερικά όρια κόστους και λειτουργίας της πλατφόρμας."]
] as const;

const steps = [
  ["01", "Ένα canonical προϊόν", "Ίδιο προϊόν από πολλά καταστήματα δεν χρειάζεται να εμφανίζεται πέντε φορές. Το ΚΟΝΤΑ ΜΟΥ το ενοποιεί σε μία καθαρή εμπειρία για τον πελάτη."],
  ["02", "Eligibility gate", "Πριν γίνει οποιαδήποτε επιλογή, αφαιρούνται offers που δεν μπορούν πραγματικά να εκτελεστούν τώρα: stock, location, capacity, fulfilment, approval."],
  ["03", "Fair rotation ανά merchant", "Αν περισσότεροι merchants είναι επιλέξιμοι, η προηγούμενη qualified exposure λαμβάνεται υπόψη. Ένα κατάστημα με πολλές branches δεν παίρνει πολλαπλά «εισιτήρια» fairness."],
  ["04", "Fulfilment fit & freshness", "Όταν η fairness θέση είναι πολύ κοντά, κερδίζει η καλύτερη πρακτική εκτέλεση: fulfilment fit, πιο πρόσφατο stock confirmation και σταθερό deterministic tie-break."],
  ["05", "Sticky continuity", "Η ανάθεση δεν αλλάζει σαν roulette μέσα στο ίδιο customer journey. Παραμένει σταθερή όσο το offer συνεχίζει να είναι επιλέξιμο."]
] as const;

const notFairness = [
  ["Ίσες πωλήσεις", "Fair exposure δεν σημαίνει ότι κάθε κατάστημα θα έχει ακριβώς τον ίδιο τζίρο ή τις ίδιες παραγγελίες."],
  ["Τυφλή εναλλαγή", "Δεν αγνοούμε stock, delivery capability ή πραγματική δυνατότητα εκτέλεσης μόνο και μόνο για να «έρθει η σειρά» κάποιου."],
  ["Πληρωμένη θέση", "Συνδρομή, commission tier ή ιδιωτική supplier τιμή δεν αγοράζουν την πρώτη θέση στο ίδιο canonical προϊόν."],
  ["Τυχαίο shuffle", "Τα tie-breaks είναι deterministic. Η πλατφόρμα δεν αλλάζει merchant κάθε refresh για να φαίνεται τεχνητά ίση."],
  ["Πολλαπλά tickets από branches", "Ένας merchant με τρεις τοποθεσίες εξακολουθεί να είναι ένας merchant στο fairness rotation. Μετά επιλέγεται η καταλληλότερη τοποθεσία."]
] as const;

const faq = [
  ["Γιατί δεν δείχνετε όλες τις ίδιες προσφορές δίπλα-δίπλα;", "Επειδή θέλουμε ο πελάτης να βλέπει το προϊόν και όχι έναν εσωτερικό πόλεμο μεταξύ ίδιων offers. Η πλατφόρμα κρατά το catalogue καθαρό και λύνει το fulfilment στο παρασκήνιο."],
  ["Άρα όλα τα καταστήματα παίρνουν ακριβώς 50/50 έκθεση;", "Όχι απαραίτητα. Η κατανομή γίνεται μόνο μεταξύ επιλέξιμων merchants και μπορεί να προσαρμόζεται σε πραγματική capacity. Αν κάποιος είναι out of stock ή δεν μπορεί να εξυπηρετήσει, δεν συμμετέχει μέχρι να ξαναγίνει επιλέξιμος."],
  ["Μπορεί ένα ακριβότερο subscription να αγοράσει καλύτερη θέση;", "Όχι στο Fair Vendor Exposure του ίδιου canonical προϊόντος. Το plan μπορεί να αλλάζει εργαλεία ή υπηρεσίες του vendor, όχι να αγοράζει κρυφή προτεραιότητα στη δίκαιη ανάθεση."],
  ["Τι γίνεται αν το κατάστημα που είχε ανατεθεί δεν μπορεί τελικά να εκτελέσει;", "Η sticky ανάθεση ισχύει μόνο όσο παραμένει επιλέξιμη. Αν πάψει να είναι, η πλατφόρμα μπορεί να επανεκτιμήσει το pool ώστε η παραγγελία ή το journey να συνεχιστεί."],
  ["Το Ask Local ακολουθεί τους ίδιους κανόνες;", "Όταν το αίτημα συνδέεται με canonical προϊόν, η λογική δίκαιης ανάθεσης παραμένει μέρος του workflow. Σε γενικές ανάγκες χωρίς συγκεκριμένο canonical προϊόν, η δρομολόγηση μπορεί να λειτουργεί διαφορετικά."],
  ["Μπορεί η πλατφόρμα να ελέγξει αν κάτι φαίνεται άδικο;", "Ναι. Η παραγωγική λειτουργία κρατά fairness evidence, rotation state και governance records. Υπάρχει επίσης διαδικασία review/appeal ώστε μια πιθανή απόκλιση να εξετάζεται αντί να αλλάζουν σιωπηρά τα weights."]
] as const;

export default function FairnessPage() {
  return <main className={styles.page}>
    <div className="announcement">Fair Vendor Exposure · ο πελάτης βλέπει καθαρά, ο merchant συμμετέχει με κανόνες.</div>
    <SiteHeader />

    <section className={styles.hero}>
      <div className={"shell " + styles.heroGrid}>
        <div>
          <div className={styles.kicker}>Fairness by design</div>
          <h1>Ένα προϊόν.<br/>Πολλά επιλέξιμα καταστήματα.<br/><em>Καμία αγορά της πρώτης θέσης.</em></h1>
          <p className={styles.heroLead}>Το ΚΟΝΤΑ ΜΟΥ δεν θέλει να μετατρέπει την τοπική αγορά σε μια σελίδα όπου πέντε γείτονες εμφανίζουν το ίδιο προϊόν και ανταγωνίζονται μόνο σε μία γραμμή τιμής. Ενοποιούμε το προϊόν και κατανέμουμε την επιλέξιμη έκθεση στο παρασκήνιο με κανόνες.</p>
          <div className={styles.heroActions}>
            <Link className="button button-light" href="/shop">Δες τον κατάλογο</Link>
            <Link className={styles.ghostButton} href="/how-it-works">Πώς λειτουργεί →</Link>
          </div>
        </div>

        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.productCore}><small>CANONICAL</small><strong>1</strong><span>PRODUCT</span></div>
          <div className={styles.vendorNode + " " + styles.nodeA}><b>A</b><span>eligible</span></div>
          <div className={styles.vendorNode + " " + styles.nodeB}><b>B</b><span>eligible</span></div>
          <div className={styles.vendorNode + " " + styles.nodeC}><b>C</b><span>eligible</span></div>
          <div className={styles.routeLabel}>FAIR ROUTING</div>
        </div>
      </div>
    </section>

    <section className={"shell " + styles.statementSection}>
      <div className={styles.statementNumber}>01</div>
      <div>
        <div className={styles.kickerDark}>Η βασική ιδέα</div>
        <h2>Fairness δεν σημαίνει «όλοι παίρνουν μία πώληση με τη σειρά».</h2>
        <p>Σημαίνει ότι <strong>κανείς δεν αγοράζει αόρατη προτεραιότητα</strong>, ότι η πλατφόρμα κοιτάζει πρώτα αν ένα κατάστημα μπορεί πραγματικά να εκτελέσει, και ότι μεταξύ των κατάλληλων merchants η προηγούμενη έκθεση λαμβάνεται υπόψη ώστε η ίδια ευκαιρία να μην καταλήγει μόνιμα στους ίδιους.</p>
      </div>
    </section>

    <section className={styles.flowSection}>
      <div className="shell">
        <div className={styles.sectionHeading}>
          <div><div className={styles.kicker}>Από το προϊόν στην εκτέλεση</div><h2>Πέντε βήματα, όχι ένα κρυφό ranking.</h2></div>
          <p>Η επιλογή γίνεται αφού περάσουν οι πραγματικοί περιορισμοί της αγοράς. Fairness λειτουργεί μέσα σε αυτό το επιλέξιμο pool — όχι αντί για αυτό.</p>
        </div>
        <div className={styles.flowGrid}>{steps.map(([number,title,body])=><article key={number}>
          <span>{number}</span><h3>{title}</h3><p>{body}</p>
        </article>)}</div>
      </div>
    </section>

    <section className={"shell " + styles.eligibilitySection}>
      <div className={styles.sectionHeadingDark}>
        <div><div className={styles.kickerDark}>Eligibility first</div><h2>Πριν μοιραστεί η έκθεση, πρέπει να μπορείς να εκτελέσεις.</h2></div>
        <p>Το fairness pool δεν περιλαμβάνει offers απλώς επειδή υπάρχουν στη βάση. Η διαθεσιμότητα πρέπει να είναι πραγματική και χρήσιμη για το συγκεκριμένο journey.</p>
      </div>
      <div className={styles.checkGrid}>{eligibility.map(([title,body])=><article key={title}><span>✓</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div>
    </section>

    <section className={styles.stickySection}>
      <div className={"shell " + styles.stickyGrid}>
        <div>
          <div className={styles.kicker}>Consistency matters</div>
          <h2>Δίκαιο δεν σημαίνει να αλλάζει ο merchant κάθε φορά που κάνεις refresh.</h2>
          <p>Η πλατφόρμα χρησιμοποιεί sticky attribution ώστε ένα qualified customer journey να παραμένει συνεπές. Αν ο merchant εξακολουθεί να είναι επιλέξιμος, η ανάθεση επαναχρησιμοποιείται αντί να ξεκινά από την αρχή κάθε φορά.</p>
          <div className={styles.timeline}>
            <div><strong>7 ημέρες</strong><span>τυπικό qualified view / discovery journey</span></div>
            <div><strong>30 ημέρες</strong><span>μετά από chat, appointment, cart ή checkout context</span></div>
            <div><strong>30+ ημέρες</strong><span>counter-offer journey με πρόσθετο cooling window</span></div>
          </div>
        </div>
        <div className={styles.stickyCard}>
          <small>EXAMPLE</small>
          <div className={styles.stickyProduct}>Bosch drill · canonical variant</div>
          <div className={styles.stickyArrow}>↓</div>
          <div className={styles.stickyVendor}>Merchant B</div>
          <p>Παραμένει η ίδια ανάθεση όσο stock, eligibility και fulfilment συνεχίζουν να ισχύουν.</p>
          <div className={styles.stickyBadge}>STICKY, NOT LOCKED FOREVER</div>
        </div>
      </div>
    </section>

    <section className={"shell " + styles.notSection}>
      <div className={styles.sectionHeadingDark}>
        <div><div className={styles.kickerDark}>Τι δεν είναι fairness</div><h2>Μερικές σημαντικές παρεξηγήσεις.</h2></div>
      </div>
      <div className={styles.notGrid}>{notFairness.map(([title,body],index)=><article key={title}><span>{String(index+1).padStart(2,"0")}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>

    <section className={styles.transparencySection}>
      <div className={"shell " + styles.transparencyGrid}>
        <div>
          <div className={styles.kicker}>Governance</div>
          <h2>Fairness που μπορεί να ελεγχθεί.</h2>
          <p>Οι operational αποφάσεις δεν χρειάζεται να εκθέτουν δημόσια supplier costs ή εσωτερικά scores για να είναι ελέγξιμες. Η πλατφόρμα διατηρεί fairness state και evidence για investigation, ενώ admin interventions και appeals αφήνουν governance trail.</p>
        </div>
        <div className={styles.transparencyCards}>
          <article><strong>Rotation state</strong><span>qualified exposure και fairness deficit ανά eligible merchant pool.</span></article>
          <article><strong>Appeals</strong><span>review queue με status, resolution και audit trail.</span></article>
          <article><strong>Anomalies</strong><span>δυνατότητα εντοπισμού ουσιαστικής απόκλισης έκθεσης όταν υπάρχει επαρκές sample.</span></article>
          <article><strong>No silent boost</strong><span>appeal outcome ή paid promotion δεν αλλάζουν κρυφά τα assignment weights.</span></article>
        </div>
      </div>
    </section>

    <section className={"shell " + styles.threeViews}>
      <div className={styles.sectionHeadingDark}><div><div className={styles.kickerDark}>Τρεις οπτικές</div><h2>Άλλο βλέπει ο πελάτης, άλλο χρειάζεται ο merchant, άλλο ελέγχει το Admin.</h2></div></div>
      <div className={styles.viewGrid}>
        <article><span>CUSTOMER</span><h3>Καθαρό catalogue</h3><p>Ένα προϊόν, μία συνεπής εμπειρία και fulfilment που δουλεύει χωρίς να χρειάζεται να καταλάβει ο χρήστης τον εσωτερικό supplier pool.</p></article>
        <article><span>MERCHANT</span><h3>Δίκαιη ευκαιρία</h3><p>Συμμετοχή όταν είναι πραγματικά eligible, χωρίς να χρειάζεται να αγοράσει κρυφή θέση για να πάρει exposure στο ίδιο canonical προϊόν.</p></article>
        <article><span>ADMIN</span><h3>Evidence, όχι υποθέσεις</h3><p>Rotation snapshots, appeals και governance evidence για να ελέγχεται μια πιθανή αδικία με δεδομένα αντί με impressions.</p></article>
      </div>
    </section>

    <section className={styles.faqSection}>
      <div className="shell">
        <div className={styles.sectionHeading}>
          <div><div className={styles.kicker}>Συχνές ερωτήσεις</div><h2>Τα πρακτικά ερωτήματα γύρω από το Fair Vendor Exposure.</h2></div>
        </div>
        <div className={styles.faqList}>{faq.map(([question,answer])=><details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
      </div>
    </section>

    <section className={"shell " + styles.finalCta}>
      <div><div className={styles.kickerDark}>KONTA MOY principle</div><h2>Η τεχνολογία πρέπει να οργανώνει την αγορά — όχι να κρύβει ποιος πλήρωσε για να φαίνεται πρώτος.</h2><p>Fair exposure σημαίνει καθαρό catalogue για τον πελάτη και πραγματική, ελέγξιμη ευκαιρία για τον merchant.</p></div>
      <div className={styles.finalActions}>
        <Link className="button" href="/ask-local">Δοκίμασε Ask Local</Link>
        <Link className="button button-secondary" href="/shops">Δες τα καταστήματα</Link>
        <Link className={styles.textLink} href="/help">Έχεις ερώτηση; Help Center →</Link>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
