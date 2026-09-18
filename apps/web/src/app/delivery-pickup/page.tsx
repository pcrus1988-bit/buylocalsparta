import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/delivery-pickup", {
    title: "Παράδοση, παραλαβή & tracking",
    description: "Πώς λειτουργούν η τοπική παραλαβή, η τοπική παράδοση, οι αποστολές σε όλη την Ελλάδα και την Ευρώπη και η παρακολούθηση παραγγελίας στο ΚΟΝΤΑ ΜΟΥ."
  });
}

export default function DeliveryPickupPage() {
  return <main>
    <div className="announcement">Παραλαβή από κατάστημα · τοπική παράδοση · αποστολή σε Ελλάδα & Ευρώπη · tracking από την παραγγελία σου.</div>
    <SiteHeader />

    <section className="content-hero content-hero-delivery">
      <div className="shell content-hero-grid">
        <div>
          <div className="eyebrow light">Παράδοση όπως σε εξυπηρετεί</div>
          <h1>Παραλαβή από κατάστημα, τοπική παράδοση ή αποστολή στον προορισμό σου.</h1>
          <p>Ο τρόπος παράδοσης εξαρτάται από το προϊόν, το κατάστημα που το διαθέτει και τον προορισμό σου. Στο checkout εμφανίζονται μόνο οι επιλογές που είναι διαθέσιμες για τη συγκεκριμένη αγορά, μαζί με το αντίστοιχο κόστος πριν πληρώσεις.</p>
          <div className="hero-actions">
            <Link className="button button-light" href="/shop">Βρες προϊόντα</Link>
            <Link className="button content-outline" href="/cart">Δες το καλάθι σου</Link>
          </div>
        </div>
        <div className="delivery-route" aria-hidden="true"><span>SHOP</span><i>→</i><span>TRACK</span><i>→</i><span>YOU</span></div>
      </div>
    </section>

    <section className="shell content-section">
      <div className="content-heading">
        <div>
          <div className="eyebrow">Στη Σπάρτη και την τοπική περιοχή</div>
          <h2>Οι συνεργάτες μπορεί να προσφέρουν παραλαβή ή τοπική παράδοση.</h2>
        </div>
        <p>Δεν προσφέρουν όλα τα καταστήματα τις ίδιες επιλογές. Το checkout ελέγχει τι είναι διαθέσιμο για τα συγκεκριμένα προϊόντα του καλαθιού σου.</p>
      </div>
      <div className="mode-grid">
        <article>
          <span>01</span>
          <h3>Παραλαβή από κατάστημα</h3>
          <p>Όταν το κατάστημα προσφέρει local pickup, μπορείς να επιλέξεις παραλαβή από το σημείο του. Μετά την αγορά θα ενημερωθείς μόλις η παραγγελία είναι έτοιμη.</p>
          <strong>Πήγαινε για παραλαβή μόνο αφού λάβεις επιβεβαίωση ότι είναι έτοιμη.</strong>
        </article>
        <article>
          <span>02</span>
          <h3>Τοπική παράδοση</h3>
          <p>Ορισμένοι συνεργάτες μπορούν να προσφέρουν παράδοση στην τοπική περιοχή. Για αυτή την υπηρεσία μπορεί να ισχύει μια μικρή χρέωση παράδοσης.</p>
          <strong>Το ακριβές κόστος υπολογίζεται και εμφανίζεται στο checkout πριν την πληρωμή.</strong>
        </article>
        <article>
          <span>03</span>
          <h3>Περισσότερα από ένα καταστήματα</h3>
          <p>Μπορείς να αγοράσεις προϊόντα από διαφορετικούς συνεργάτες με μία παραγγελία. Η παράδοση ή παραλαβή κάθε μέρους μπορεί να γίνει ξεχωριστά, ανάλογα με το κατάστημα και το προϊόν.</p>
          <strong>Όλες οι ενημερώσεις συγκεντρώνονται στον λογαριασμό σου.</strong>
        </article>
      </div>
    </section>

    <section className="content-band">
      <div className="shell content-split">
        <div>
          <div className="eyebrow light">Αποστολές σε όλη την Ελλάδα</div>
          <h2>Η παραγγελία ταξιδεύει με τον κατάλληλο συνεργάτη μεταφοράς.</h2>
          <p>Για αποστολές εκτός της τοπικής περιοχής, η παράδοση γίνεται συνήθως με ACS ή με άλλο συνεργαζόμενο μεταφορέα, ανάλογα με το κατάστημα, το προϊόν, τον προορισμό και τη διαθέσιμη υπηρεσία αποστολής.</p>
          <Link className="button button-light" href="/account">Δες τις παραγγελίες σου</Link>
        </div>
        <div className="content-fact-list">
          <div><strong>ACS ή άλλος carrier</strong><span>Ο μεταφορέας επιλέγεται ανάλογα με το κατάστημα και την αποστολή. Δεν είναι απαραίτητα ο ίδιος για κάθε προϊόν ή παραγγελία.</span></div>
          <div><strong>Κόστος πριν την πληρωμή</strong><span>Όπου υπάρχει χρέωση αποστολής, εμφανίζεται στο checkout πριν ολοκληρώσεις την αγορά.</span></div>
          <div><strong>Πιθανές ξεχωριστές αποστολές</strong><span>Αν η παραγγελία περιλαμβάνει προϊόντα από διαφορετικά καταστήματα, μπορεί να λάβεις περισσότερα από ένα δέματα και περισσότερους από έναν αριθμούς tracking.</span></div>
        </div>
      </div>
    </section>

    <section className="shell content-section">
      <div className="content-heading">
        <div>
          <div className="eyebrow">Αποστολές στην Ευρώπη</div>
          <h2>Για ευρωπαϊκούς προορισμούς χρησιμοποιούνται συνήθως DHL ή DPD.</h2>
        </div>
        <p>Ο τελικός μεταφορέας μπορεί να διαφέρει ανάλογα με το κατάστημα, τη χώρα προορισμού, το μέγεθος ή βάρος του προϊόντος και τη διαθέσιμη υπηρεσία.</p>
      </div>
      <div className="principle-grid">
        <article><span>DHL / DPD</span><h3>Συνήθεις ευρωπαϊκές αποστολές</h3><p>Οι περισσότερες ευρωπαϊκές αποστολές εκτελούνται μέσω DHL ή DPD, όταν η συγκεκριμένη υπηρεσία είναι διαθέσιμη για την παραγγελία.</p></article>
        <article><span>CHECKOUT</span><h3>Βλέπεις την επιλογή πριν πληρώσεις</h3><p>Η διαθεσιμότητα αποστολής και το αντίστοιχο κόστος υπολογίζονται σύμφωνα με τον προορισμό και τα προϊόντα του καλαθιού.</p></article>
        <article><span>ΠΑΡΑΔΟΣΗ</span><h3>Οι χρόνοι εξαρτώνται από τον προορισμό</h3><p>Ο εκτιμώμενος χρόνος μπορεί να διαφέρει ανά χώρα, μεταφορέα, προϊόν και περίοδο αυξημένης κίνησης.</p></article>
      </div>
    </section>

    <section className="content-band">
      <div className="shell content-split">
        <div>
          <div className="eyebrow light">Tracking</div>
          <h2>Παρακολούθησε την πορεία της παραγγελίας σου από τον λογαριασμό σου.</h2>
          <p>Μόλις μια αποστολή παραδοθεί στον μεταφορέα και εκδοθεί αριθμός αποστολής, εμφανίζουμε τα διαθέσιμα στοιχεία tracking στην παραγγελία σου. Όπου υποστηρίζεται, οι αλλαγές κατάστασης ενημερώνονται αυτόματα.</p>
          <Link className="button button-light" href="/account">Άνοιξε τον λογαριασμό σου</Link>
        </div>
        <div className="content-fact-list">
          <div><strong>Αριθμός tracking</strong><span>Όταν ο μεταφορέας τον παρέχει, θα τον βρεις μέσα στη συγκεκριμένη παραγγελία και μπορείς να τον χρησιμοποιήσεις και στην υπηρεσία tracking του carrier.</span></div>
          <div><strong>Πολλαπλά δέματα</strong><span>Μία παραγγελία μπορεί να έχει περισσότερα από ένα tracking numbers αν προϊόντα αποστέλλονται ξεχωριστά.</span></div>
          <div><strong>Τοπική παράδοση</strong><span>Για τοπικές παραδόσεις μπορεί να εμφανίζεται ενημέρωση προόδου μέσα στο ΚΟΝΤΑ ΜΟΥ, ανάλογα με τον τρόπο που εκτελείται η παράδοση.</span></div>
          <div><strong>Καθυστέρηση ενημέρωσης</strong><span>Μετά την παραλαβή του δέματος από τον μεταφορέα μπορεί να χρειαστεί λίγος χρόνος μέχρι να ενεργοποιηθεί ή να ανανεωθεί το tracking.</span></div>
        </div>
      </div>
    </section>

    <section className="shell content-section">
      <div className="content-heading">
        <div>
          <div className="eyebrow">Τι γίνεται μετά την αγορά</div>
          <h2>Η παραγγελία σου παραμένει το κεντρικό σημείο ενημέρωσης.</h2>
        </div>
        <p>Δεν χρειάζεται να επικοινωνείς ξεχωριστά με κάθε κατάστημα για να δεις την πορεία της αγοράς σου.</p>
      </div>
      <div className="process-list">
        <article><span>01</span><div><h3>Επιβεβαιώνεται η παραγγελία</h3><p>Βλέπεις τα προϊόντα, τον τρόπο παράδοσης ή παραλαβής και τα στοιχεία που έδωσες στο checkout.</p></div></article>
        <article><span>02</span><div><h3>Το κατάστημα ετοιμάζει το προϊόν</h3><p>Για παραλαβή θα ενημερωθείς όταν είναι έτοιμο. Για αποστολή, προετοιμάζεται και παραδίδεται στον αντίστοιχο μεταφορέα.</p></div></article>
        <article><span>03</span><div><h3>Ενεργοποιείται το tracking</h3><p>Όταν δημιουργηθεί αποστολή, προστίθενται τα διαθέσιμα στοιχεία παρακολούθησης στην παραγγελία σου.</p></div></article>
        <article><span>04</span><div><h3>Παραλαβή ή παράδοση</h3><p>Ολοκληρώνεις την παραλαβή από το κατάστημα ή παραλαμβάνεις το δέμα στη διεύθυνση ή στο σημείο που έχει συμφωνηθεί.</p></div></article>
      </div>
    </section>

    <section className="shell content-cta">
      <div>
        <div className="eyebrow">Πριν ολοκληρώσεις την αγορά</div>
        <h2>Το checkout σου δείχνει τις διαθέσιμες επιλογές για τη συγκεκριμένη παραγγελία.</h2>
        <p>Έλεγξε τον τρόπο παράδοσης ή παραλαβής, τη διεύθυνση και τυχόν κόστος μεταφοράς πριν προχωρήσεις στην πληρωμή.</p>
      </div>
      <div className="hero-actions">
        <Link className="button" href="/cart">Άνοιξε το καλάθι</Link>
        <Link className="button button-secondary" href="/help">Χρειάζομαι βοήθεια</Link>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
