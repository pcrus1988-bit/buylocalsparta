import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/payments-security", {
    title: "Ασφαλείς πληρωμές στο ΚΟΝΤΑ ΜΟΥ",
    description: "Πώς πληρώνεις με ασφάλεια στο ΚΟΝΤΑ ΜΟΥ, ποιες επιλογές πληρωμής μπορεί να εμφανιστούν και πώς προστατεύονται τα στοιχεία της πληρωμής σου μέσω Mollie."
  });
}

export default function PaymentsSecurityPage() {
  return <main>
    <div className="announcement">Ασφαλείς πληρωμές · ξεκάθαρη χρέωση · επιβεβαίωση της παραγγελίας σου.</div>
    <SiteHeader compact />

    <section className="content-hero content-hero-payments">
      <div className="shell content-hero-grid">
        <div>
          <div className="eyebrow light">Πληρωμές με ασφάλεια</div>
          <h1>Πλήρωσε εύκολα, γνωρίζοντας τι συμβαίνει σε κάθε βήμα.</h1>
          <p>Στο ΚΟΝΤΑ ΜΟΥ βλέπεις το ποσό της παραγγελίας σου πριν πληρώσεις και, όταν έρθει η ώρα της πληρωμής, μεταφέρεσαι στο ασφαλές περιβάλλον της Mollie. Το ΚΟΝΤΑ ΜΟΥ δεν αποθηκεύει τα στοιχεία της κάρτας σου.</p>
          <div className="hero-actions">
            <Link className="button button-light" href="/cart">Δες το καλάθι σου</Link>
            <Link className="button content-outline" href="/checkout">Πήγαινε στο checkout</Link>
          </div>
        </div>
        <div className="payment-shield" aria-hidden="true">
          <span><img src="/brand/kontamou-sparta-logo.webp" alt="" width={72} height={48} style={{ width: "72px", height: "48px", objectFit: "contain" }} /></span>
          <strong>ΑΣΦΑΛΗΣ ΠΛΗΡΩΜΗ</strong>
          <small>POWERED BY MOLLIE</small>
        </div>
      </div>
    </section>

    <section className="shell content-section">
      <div className="content-heading">
        <div>
          <div className="eyebrow">Πώς πληρώνεις</div>
          <h2>Απλά και ξεκάθαρα.</h2>
        </div>
        <p>Πριν ολοκληρωθεί η αγορά, βλέπεις τι αγοράζεις, πώς θα το παραλάβεις και πόσο θα πληρώσεις.</p>
      </div>
      <div className="process-list">
        <article><span>01</span><div><h3>Ελέγχεις την παραγγελία σου</h3><p>Βλέπεις προϊόντα, ποσότητες, τρόπο παραλαβής ή παράδοσης και το τελικό ποσό που αντιστοιχεί στην αγορά σου.</p></div></article>
        <article><span>02</span><div><h3>Διαλέγεις πώς θέλεις να πληρώσεις</h3><p>Στο checkout μπορείς να επιλέξεις τις διαθέσιμες μεθόδους πληρωμής, όπως κάρτα ή Klarna, ανάλογα με το τι είναι διαθέσιμο για τη συγκεκριμένη παραγγελία.</p></div></article>
        <article><span>03</span><div><h3>Πληρώνεις στο ασφαλές περιβάλλον της Mollie</h3><p>Για την πληρωμή μεταφέρεσαι στη Mollie. Εκεί εισάγεις τα στοιχεία που χρειάζονται για τον τρόπο πληρωμής που επέλεξες. Το ΚΟΝΤΑ ΜΟΥ δεν αποθηκεύει τον αριθμό της κάρτας σου.</p></div></article>
        <article><span>04</span><div><h3>Λαμβάνεις επιβεβαίωση</h3><p>Μόλις επιβεβαιωθεί η πληρωμή ή η έγκριση της επιλεγμένης μεθόδου, ενημερώνεται και η παραγγελία σου στο ΚΟΝΤΑ ΜΟΥ.</p></div></article>
      </div>
    </section>

    <section className="content-band">
      <div className="shell content-split">
        <div>
          <div className="eyebrow light">Αν κάτι διακοπεί</div>
          <h2>Η πληρωμή δεν χρειάζεται να γίνει δύο φορές.</h2>
          <p>Αν κλείσει το παράθυρο, χαθεί η σύνδεση ή δεν είσαι σίγουρος αν ολοκληρώθηκε η πληρωμή, έλεγξε πρώτα τις παραγγελίες σου. Εκεί θα δεις την πιο πρόσφατη κατάσταση της αγοράς πριν δοκιμάσεις ξανά.</p>
          <Link className="button button-light" href="/account">Δες τις παραγγελίες σου</Link>
        </div>
        <div className="content-fact-list">
          <div><strong>Σε αναμονή</strong><span>Η πληρωμή ή η έγκριση δεν έχει ολοκληρωθεί ακόμη. Περίμενε την ενημέρωση της παραγγελίας πριν ξεκινήσεις νέα πληρωμή.</span></div>
          <div><strong>Δεν ολοκληρώθηκε</strong><span>Αν η πληρωμή ακυρώθηκε ή απέτυχε, μπορείς να επιστρέψεις στην παραγγελία σου και να συνεχίσεις ξανά με ασφάλεια.</span></div>
          <div><strong>Επιβεβαιώθηκε</strong><span>Η παραγγελία σου έχει ενημερωθεί και μπορείς να παρακολουθείς τα επόμενα βήματά της από τον λογαριασμό σου.</span></div>
        </div>
      </div>
    </section>

    <section className="shell content-section">
      <div className="content-heading">
        <div>
          <div className="eyebrow">Τι σημαίνει ασφαλής πληρωμή</div>
          <h2>Τα βασικά που χρειάζεται να ξέρεις.</h2>
        </div>
        <p>Στόχος μας είναι να γνωρίζεις τι πληρώνεις και ποιος χειρίζεται τα στοιχεία της πληρωμής σου.</p>
      </div>
      <div className="principle-grid">
        <article><span>ΠΟΣΟ</span><h3>Βλέπεις τη χρέωση πριν πληρώσεις</h3><p>Το checkout επιβεβαιώνει το ποσό της παραγγελίας σου πριν μεταφερθείς στην πληρωμή.</p></article>
        <article><span>ΚΑΡΤΑ</span><h3>Δεν αποθηκεύουμε τα στοιχεία της κάρτας σου</h3><p>Τα στοιχεία πληρωμής εισάγονται στο ασφαλές περιβάλλον της Mollie και όχι σε φόρμα κάρτας του ΚΟΝΤΑ ΜΟΥ.</p></article>
        <article><span>ΕΠΙΒΕΒΑΙΩΣΗ</span><h3>Η παραγγελία ενημερώνεται μετά την πληρωμή</h3><p>Δεν βασιζόμαστε μόνο σε μια οθόνη «επιτυχίας». Η παραγγελία ενημερώνεται όταν έχουμε επιβεβαίωση για την κατάσταση της πληρωμής.</p></article>
      </div>
    </section>

    <section className="shell content-section">
      <div className="content-heading">
        <div>
          <div className="eyebrow">Κάρτα, Klarna και άλλες επιλογές</div>
          <h2>Οι διαθέσιμες μέθοδοι εμφανίζονται στο checkout.</h2>
        </div>
        <p>Οι επιλογές μπορεί να διαφέρουν ανάλογα με την παραγγελία, τη χώρα, τη συσκευή και τους όρους του παρόχου πληρωμών.</p>
      </div>
      <div className="principle-grid">
        <article><span>ΚΑΡΤΕΣ</span><h3>Πληρωμή με κάρτα</h3><p>Οι υποστηριζόμενες κάρτες εμφανίζονται στη σελίδα πληρωμής της Mollie.</p></article>
        <article><span>KLARNA</span><h3>Αγορά τώρα, πληρωμή αργότερα</h3><p>Όταν η Klarna είναι διαθέσιμη για την παραγγελία σου, μπορείς να την επιλέξεις στο checkout. Η έγκριση και οι όροι καθορίζονται από την Klarna.</p></article>
        <article><span>MOLLIE</span><h3>Payments powered by Mollie</h3><p>Η Mollie είναι ο πάροχος που διαχειρίζεται με ασφάλεια τη διαδικασία της online πληρωμής.</p></article>
      </div>
    </section>

    <section className="shell content-cta">
      <div>
        <div className="eyebrow">Πριν πληρώσεις</div>
        <h2>Έλεγξε προϊόντα, ποσότητες και τρόπο παραλαβής.</h2>
        <p>Μετά μπορείς να συνεχίσεις στην ασφαλή πληρωμή με τη μέθοδο που σε εξυπηρετεί.</p>
      </div>
      <div className="hero-actions">
        <Link className="button" href="/cart">Άνοιξε το καλάθι</Link>
        <Link className="button button-secondary" href="/checkout">Συνέχεια στο checkout</Link>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
