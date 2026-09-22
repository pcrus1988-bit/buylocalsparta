import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./page.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/about", {
    title: "Τι είναι το ΚΟΝΤΑ ΜΟΥ Σπάρτη",
    description: "Γιατί δημιουργήθηκε το ΚΟΝΤΑ ΜΟΥ στη Σπάρτη, πώς συνδέει πελάτες, τοπικά καταστήματα και παράδοση και ποιο είναι το όραμά του για μια πιο ανθρώπινη ψηφιακή αγορά στην Ελλάδα."
  });
}

const chapters = [
  ["01", "Η ερώτηση", "Γιατί πρέπει να διαλέξουμε ανάμεσα στην άνεση του online και στους ανθρώπους της πόλης μας;"],
  ["02", "Η απάντηση", "Δεν χρειάζεται. Η τοπική αγορά μπορεί να αποκτήσει κοινή ψηφιακή υποδομή χωρίς να χάσει το πρόσωπο, τη γνώση και την ανεξαρτησία της."],
  ["03", "Το πείραμα", "Ξεκινάμε από τη Σπάρτη: μια πραγματική πόλη, με πραγματικά καταστήματα, πραγματικές αποστάσεις και πραγματικές καθημερινές ανάγκες."],
  ["04", "Η φιλοδοξία", "Να δημιουργηθεί ένα μοντέλο που μπορεί να λειτουργήσει πόλη-πόλη και να δώσει στις μικρές επιχειρήσεις τα εργαλεία που μέχρι σήμερα είχαν κυρίως οι μεγάλοι παίκτες."]
] as const;

const differences = [
  ["Δεν ψάχνεις μόνο προϊόν.", "Μπορείς να ρωτήσεις την αγορά.", "Με το Ask Local, η αναζήτηση σταματά να είναι μονόλογος. Περιγράφεις τι χρειάζεσαι και πραγματικοί επαγγελματίες μπορούν να βοηθήσουν."],
  ["Δεν βλέπεις απλώς ένα logo.", "Βλέπεις το κατάστημα πίσω από το προϊόν.", "Η ταυτότητα του συνεργάτη παραμένει μέρος της αγοράς. Η πλατφόρμα δεν χρειάζεται να εξαφανίσει τον άνθρωπο για να είναι εύχρηστη."],
  ["Δεν χρειάζεσαι πέντε checkouts.", "Ένα καλάθι μπορεί να ενώνει πολλά καταστήματα.", "Ο πελάτης έχει μία συνεχή εμπειρία, ακόμη όταν η παραγγελία εκτελείται από διαφορετικούς συνεργάτες."],
  ["Δεν τελειώνουμε στο «πληρώθηκε».", "Η αγορά συνεχίζεται μέχρι την παραλαβή.", "Pickup, τοπική παράδοση, courier shipping, tracking, επιστροφές και υποστήριξη ανήκουν στην ίδια ιστορία παραγγελίας."],
  ["Δεν θέλουμε έναν αγώνα μόνο στη χαμηλότερη τιμή.", "Θέλουμε δίκαιη ευκαιρία να φανεί το σωστό κατάστημα.", "Η λογική του ΚΟΝΤΑ ΜΟΥ σχεδιάστηκε ώστε η κοινή αγορά να μη μετατρέπεται αυτόματα σε δημόσιο πόλεμο ίδιων προσφορών."],
  ["Δεν θεωρούμε την τεχνολογία αυτοσκοπό.", "Καλό software είναι αυτό που εξαφανίζει τη δυσκολία.", "Για τον πελάτη πρέπει να είναι απλό. Για το κατάστημα πρέπει να κάνει την καθημερινή δουλειά πιο καθαρή. Για τον οδηγό πρέπει να λειτουργεί στον δρόμο."]
] as const;

const today = [
  ["Ανακάλυψη", "Προϊόντα, κατηγορίες, καταστήματα και τοπικές προτάσεις σε μία κοινή αγορά."],
  ["Ask Local", "Ρώτησε αυτό που δεν χωράει σε ένα φίλτρο και δώσε χώρο στη γνώση του επαγγελματία."],
  ["Flash Sales", "Περιορισμένες προσφορές και ευκαιρίες για εγγεγραμμένους χρήστες."],
  ["BAZAAR", "Pre-owned, open-box, returns, testers ή προϊόντα με δηλωμένη ατέλεια, με καθαρή παρουσίαση της κατάστασής τους."],
  ["Gift Cards", "Αξία που μπορεί να χρησιμοποιείται online και, όπου υποστηρίζεται, «Στο μαγαζί»."],
  ["Ένα checkout", "Πιο απλή αγορά ακόμη όταν εμπλέκονται περισσότερα από ένα καταστήματα."],
  ["Τοπική παράδοση", "Pickup, local delivery και mobile εργαλεία για συνεργάτες παράδοσης."],
  ["Tracking", "Η παραγγελία δεν εξαφανίζεται μετά την πληρωμή. Ο πελάτης βλέπει την πορεία της."],
  ["Vendor Workspace", "Κατάλογος, stock, παραγγελίες, πελάτες, οικονομικά και analytics για τον συνεργάτη."],
  ["KONTA MOY Daily", "Γρήγορες καθημερινές ενέργειες από κινητό: παραγγελίες, QR, ειδοποιήσεις, pickup και Quick Add."]
] as const;

const beliefs = [
  ["Η μικρή επιχείρηση δεν χρειάζεται να γίνει εταιρεία τεχνολογίας.", "Χρειάζεται πρόσβαση σε καλή τεχνολογία."],
  ["Η ευκολία δεν ανήκει μόνο στις μεγάλες πλατφόρμες.", "Μπορεί να υπάρχει και δίπλα σου."],
  ["Η ανθρώπινη συμβουλή δεν είναι παλιό μοντέλο.", "Είναι πλεονέκτημα που το σημερινό e-commerce συχνά έχασε."],
  ["Το «τοπικό» δεν σημαίνει μικρή φιλοδοξία.", "Μπορεί να ξεκινά σε μία πόλη και να σχεδιάζεται για ολόκληρη τη χώρα."]
] as const;

export default function AboutPage() {
  return <main>
    <div className="announcement">Developed in Sparta for Greece · Η τεχνολογία πιο κοντά στην πραγματική αγορά.</div>
    <SiteHeader />

    <section className={styles.hero}>
      <div className="shell">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <div className="eyebrow light">Η ιστορία πίσω από το ΚΟΝΤΑ ΜΟΥ</div>
            <h1>Δεν ξεκινήσαμε για να φτιάξουμε άλλο ένα marketplace.</h1>
            <p className={styles.heroLead}>Ξεκινήσαμε από μια πιο απλή ερώτηση: <strong>γιατί η ευκολία του online πρέπει να σημαίνει ότι χάνεται η πόλη, το κατάστημα και ο άνθρωπος πίσω από το προϊόν;</strong></p>
            <p>Το ΚΟΝΤΑ ΜΟΥ γεννήθηκε στη Σπάρτη για να δοκιμάσει μια διαφορετική απάντηση — μια κοινή ψηφιακή αγορά που μπορεί να είναι σύγχρονη χωρίς να γίνεται απρόσωπη.</p>
            <div className="hero-actions">
              <Link className="button button-light" href="/how-it-works">Δες πώς λειτουργεί</Link>
              <Link className="button content-outline" href="/shops">Γνώρισε τα καταστήματα</Link>
            </div>
          </div>
          <div className={styles.heroMark} aria-label="Developed in Sparta for Greece">
            <img src="/brand/kontamou-sparta-logo.webp" alt="ΚΟΝΤΑ ΜΟΥ Sparta" width={480} height={320} />
            <div className={styles.originStamp}>
              <span>DEVELOPED IN</span>
              <strong>SPARTA</strong>
              <i>FOR GREECE</i>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="shell content-section" id="what-is-kontamou">
      <div className="content-heading">
        <div><div className="eyebrow">Τι είναι το ΚΟΝΤΑ ΜΟΥ</div><h2>Τι είναι το ΚΟΝΤΑ ΜΟΥ Σπάρτη</h2></div>
        <p>Το ΚΟΝΤΑ ΜΟΥ είναι πλατφόρμα τοπικού εμπορίου από τη Σπάρτη. Συνδέει πελάτες και τοπικά καταστήματα με ένα καλάθι και μία διαδικασία ολοκλήρωσης αγοράς.</p>
      </div>
      <p><strong>Υποδομή για μικρές επιχειρήσεις:</strong> κάθε συνεργαζόμενο κατάστημα μπορεί να αξιοποιεί κοινά εργαλεία ανακάλυψης, παραγγελιών και λειτουργίας, χωρίς να χρειάζεται να συντηρεί μόνο του ένα πλήρες ηλεκτρονικό κατάστημα.</p>
    </section>

    <section className={`shell content-section ${styles.opening}`}>
      <div className={styles.openingStatement}>
        <span>Η βασική ιδέα</span>
        <h2>Το internet δεν χρειάζεται να αντικαταστήσει την τοπική αγορά. Μπορεί να της δώσει υπερδυνάμεις.</h2>
      </div>
      <div className={styles.openingText}>
        <p>Σήμερα ένας πελάτης μπορεί να αγοράσει σχεδόν οτιδήποτε μέσα σε λίγα λεπτά. Αυτό είναι εξαιρετικό. Το πρόβλημα είναι ότι η ευκολία συχνά έρχεται με ένα τίμημα: τα τοπικά καταστήματα γίνονται αόρατα, η συμβουλή χάνεται και η κάθε μικρή επιχείρηση καλείται μόνη της να πληρώσει για e-shop, marketing, logistics, πληρωμές, SEO και τεχνολογία.</p>
        <p>Το ΚΟΝΤΑ ΜΟΥ προσπαθεί να αλλάξει ακριβώς αυτό. Όχι πολεμώντας το e-commerce — αλλά <strong>φέρνοντας τις δυνατότητές του στην τοπική αγορά ως κοινή υποδομή.</strong></p>
      </div>
    </section>

    <section className={styles.storyBand}>
      <div className="shell">
        <div className={styles.sectionIntroLight}>
          <div className="eyebrow light">Από μία ερώτηση σε ένα σύστημα</div>
          <h2>Η ιστορία σε τέσσερα κεφάλαια.</h2>
        </div>
        <div className={styles.chapterGrid}>
          {chapters.map(([number,title,body]) => <article key={number}>
            <span>{number}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>)}
        </div>
      </div>
    </section>

    <section className="shell content-section">
      <div className={styles.spartaGrid}>
        <div className={styles.spartaVisual}>
          <div className={styles.mapPulse} aria-hidden="true"><span>ΣΠΑΡΤΗ</span></div>
        </div>
        <div>
          <div className="eyebrow">Γιατί Σπάρτη;</div>
          <h2>Επειδή αν δουλεύει σε μια πραγματική πόλη, έχει κάτι να αποδείξει.</h2>
          <p>Η Σπάρτη δεν είναι εργαστήριο με υποθετικούς χρήστες. Είναι μια πόλη όπου ο πελάτης ξέρει το κατάστημα, ο καταστηματάρχης ξέρει την αγορά και οι αποστάσεις είναι αρκετά μικρές ώστε η λέξη «κοντά» να έχει πρακτικό νόημα.</p>
          <p>Εδώ μπορείς να δεις αν ένα μοντέλο πραγματικά βοηθά: αν κάνει ένα προϊόν ευκολότερο να βρεθεί, αν φέρνει μια παραγγελία σε ένα κατάστημα που διαφορετικά δεν θα την έπαιρνε, αν η τοπική παράδοση γίνεται πιο απλή και αν ο πελάτης νιώθει ότι αγοράζει από μια πραγματική αγορά — όχι από έναν απρόσωπο κατάλογο.</p>
          <blockquote>Η Σπάρτη είναι η αφετηρία. Το ζητούμενο είναι ένα μοντέλο που μπορεί να ταξιδέψει.</blockquote>
        </div>
      </div>
    </section>

    <section className={styles.differenceSection}>
      <div className="shell">
        <div className="content-heading">
          <div><div className="eyebrow">Η διαφορά</div><h2>Τι θέλουμε να κάνει διαφορετικά το ΚΟΝΤΑ ΜΟΥ.</h2></div>
          <p>Όχι slogans. Μερικές πολύ συγκεκριμένες σχεδιαστικές επιλογές που αλλάζουν την εμπειρία για πελάτες και επιχειρήσεις.</p>
        </div>
        <div className={styles.differenceList}>
          {differences.map(([before,after,body],index) => <article key={after}>
            <span>{String(index+1).padStart(2,"0")}</span>
            <div><small>{before}</small><h3>{after}</h3></div>
            <p>{body}</p>
          </article>)}
        </div>
      </div>
    </section>

    <section className={styles.nowSection}>
      <div className="shell">
        <div className={styles.nowIntro}>
          <div>
            <div className="eyebrow light">Και σήμερα;</div>
            <h2>Η αρχική ιδέα έχει ήδη γίνει πολύ μεγαλύτερη.</h2>
          </div>
          <p>Από μια κοινή ψηφιακή βιτρίνα, το ΚΟΝΤΑ ΜΟΥ εξελίχθηκε σε σύστημα που συνδέει ανακάλυψη, συμβουλή, αγορά, πληρωμή, λειτουργία καταστήματος και παράδοση.</p>
        </div>
        <div className={styles.nowGrid}>
          {today.map(([title,body],index)=><article key={title}>
            <span>{String(index+1).padStart(2,"0")}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>)}
        </div>
      </div>
    </section>

    <section className="shell content-section">
      <div className={styles.beliefHeader}>
        <div className="eyebrow">Τέσσερις πεποιθήσεις</div>
        <h2>Αυτά είναι τα πράγματα στα οποία δεν θέλουμε να κάνουμε έκπτωση.</h2>
      </div>
      <div className={styles.beliefGrid}>
        {beliefs.map(([line1,line2],index)=><article key={line1}>
          <span>0{index+1}</span>
          <p>{line1}</p>
          <strong>{line2}</strong>
        </article>)}
      </div>
    </section>

    <section className={styles.notSection}>
      <div className="shell">
        <div className={styles.notGrid}>
          <div>
            <div className="eyebrow light">Τι δεν είναι</div>
            <h2>Το ΚΟΝΤΑ ΜΟΥ δεν είναι προσπάθεια να βάλουμε απλώς περισσότερα προϊόντα σε μία οθόνη.</h2>
          </div>
          <div className={styles.notList}>
            <div><b>×</b><span><strong>Δεν είναι κατάλογος χωρίς ανθρώπους.</strong> Η γνώση και η ταυτότητα του καταστήματος έχουν θέση μέσα στην εμπειρία.</span></div>
            <div><b>×</b><span><strong>Δεν είναι μηχανή που επιβραβεύει μόνο όποιον κατεβάζει περισσότερο την τιμή.</strong> Η ορατότητα πρέπει να μπορεί να είναι δίκαιη και ελέγξιμη.</span></div>
            <div><b>×</b><span><strong>Δεν είναι «φτιάξε μόνος σου ένα e-shop και καλή τύχη».</strong> Η αξία βρίσκεται στην κοινή υποδομή.</span></div>
            <div><b>×</b><span><strong>Δεν είναι αντίπαλος του φυσικού καταστήματος.</strong> Θέλουμε το online να μπορεί να οδηγεί και σε συμβουλή, pickup και αγορά «Στο μαγαζί».</span></div>
          </div>
        </div>
      </div>
    </section>

    <section className="shell content-section">
      <div className={styles.future}>
        <span className={styles.futureKicker}>Από τη Σπάρτη για την Ελλάδα</span>
        <h2>Το όραμα είναι μεγαλύτερο από μία πόλη. Η μέθοδος όμως παραμένει τοπική.</h2>
        <p>Η λογική του ΚΟΝΤΑ ΜΟΥ είναι να μπορεί κάθε πόλη να έχει τη δική της ζωντανή ψηφιακή αγορά: πραγματικά καταστήματα, τοπική γνώση, κοινά εργαλεία, τοπική παράδοση όπου έχει νόημα και δυνατότητα να φτάνει σε πελάτες σε όλη την Ελλάδα.</p>
        <p>Όχι μια κεντρική πλατφόρμα που κάνει κάθε πόλη να μοιάζει ίδια. <strong>Ένα κοινό τεχνολογικό υπόβαθρο που αφήνει κάθε τοπική αγορά να παραμένει δική της.</strong></p>
        <div className={styles.futureLine}><span>SPARTA</span><i>→</i><span>GREECE</span></div>
      </div>
    </section>

    <section className={styles.finalSection}>
      <div className="shell">
        <div className={styles.finalGrid}>
          <div>
            <div className="eyebrow light">Η πιο απλή περιγραφή μας</div>
            <h2>ΚΟΝΤΑ ΜΟΥ σημαίνει να μπορείς να ξεκινήσεις online και να παραμένεις κοντά.</h2>
          </div>
          <div>
            <p>Κοντά στο προϊόν που χρειάζεσαι. Κοντά στο κατάστημα που το γνωρίζει. Κοντά στην πόλη που θέλεις να παραμένει ζωντανή.</p>
            <div className="hero-actions">
              <Link className="button button-light" href="/shop">Ανακάλυψε την αγορά</Link>
              <Link className="button content-outline" href="/join">Έχω κατάστημα</Link>
            </div>
          </div>
        </div>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
