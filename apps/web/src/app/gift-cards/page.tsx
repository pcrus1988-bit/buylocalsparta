import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { giftCardsLiveEnabled } from "../../lib/gift-card-service";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/gift-cards", {
    title: "Gift Cards ΚΟΝΤΑ ΜΟΥ",
    description: "Πώς λειτουργούν οι Gift Cards ΚΟΝΤΑ ΜΟΥ: χρήση online και σε συμμετέχοντα καταστήματα, διαθέσιμο υπόλοιπο, σύνδεση με λογαριασμό και εξαργύρωση."
  });
}

export default function GiftCardsPage() {
  const live = giftCardsLiveEnabled();

  return <main>
    <div className="announcement">ΚΟΝΤΑ ΜΟΥ Gift Cards · online ή «Στο μαγαζί» · το υπόλοιπο μένει διαθέσιμο για επόμενη αγορά.</div>
    <SiteHeader />

    <section className="content-hero content-hero-gift-cards">
      <div className="shell content-hero-grid">
        <div>
          <div className="eyebrow light">Ένα δώρο με πολλές επιλογές</div>
          <h1>Μία Gift Card. Πολλά προϊόντα και πολλά συμμετέχοντα καταστήματα.</h1>
          <p>Η ΚΟΝΤΑ ΜΟΥ Gift Card δίνει στον παραλήπτη την ελευθερία να διαλέξει αυτό που πραγματικά θέλει. Μπορεί να χρησιμοποιηθεί σε επιλέξιμες αγορές μέσα στο ΚΟΝΤΑ ΜΟΥ και, όπου υποστηρίζεται, απευθείας «Στο μαγαζί» σε συμμετέχοντες συνεργάτες.</p>
          <div className="hero-actions">
            <Link className="button button-light" href="/account/gift-cards">Οι Gift Cards μου</Link>
            <Link className="button content-outline" href="/shops">Δες καταστήματα</Link>
          </div>
        </div>
        <div className="gift-card-visual" aria-hidden="true" style={{ minHeight: 210, display: "grid", placeItems: "center" }}>
          <div style={{ width: "min(100%, 330px)", aspectRatio: "1.58 / 1", borderRadius: 24, padding: 24, background: "rgba(255,255,255,.96)", color: "#182019", boxShadow: "0 25px 70px rgba(0,0,0,.18)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".13em" }}>ΚΟΝΤΑ ΜΟΥ</span>
            <strong style={{ fontSize: 30, lineHeight: 1 }}>GIFT CARD</strong>
            <span style={{ fontSize: 13, opacity: .7 }}>ONLINE · ΣΤΟ ΜΑΓΑΖΙ</span>
          </div>
        </div>
      </div>
    </section>

    <section className="shell content-section">
      <div className="content-heading">
        <div>
          <div className="eyebrow">Πώς λειτουργεί</div>
          <h2>Απλή χρήση, χωρίς να χρειάζεται να ξέρεις τεχνικές λεπτομέρειες.</h2>
        </div>
        <p>Η Gift Card έχει συγκεκριμένη αξία και διαθέσιμο υπόλοιπο. Κάθε φορά που χρησιμοποιείται, αφαιρείται μόνο το ποσό της αγοράς που καλύπτει.</p>
      </div>

      <div className="process-list">
        <article><span>01</span><div><h3>Λαμβάνεις τη Gift Card και τον κωδικό της</h3><p>Ο κωδικός είναι το στοιχείο που επιτρέπει τη σύνδεση ή την εξαργύρωση της Gift Card. Φύλαξέ τον όπως θα φύλαγες μια κανονική κάρτα δώρου.</p></div></article>
        <article><span>02</span><div><h3>Τη συνδέεις με τον λογαριασμό σου</h3><p>Από την ενότητα «Οι Gift Cards μου» μπορείς να προσθέσεις τον κωδικό και να βλέπεις το διαθέσιμο υπόλοιπο, την αρχική αξία και, όταν υπάρχει, την ημερομηνία λήξης.</p></div></article>
        <article><span>03</span><div><h3>Τη χρησιμοποιείς online ή «Στο μαγαζί»</h3><p>Online εφαρμόζεται σε επιλέξιμες αγορές προϊόντων στο ΚΟΝΤΑ ΜΟΥ. Σε συμμετέχοντα φυσικά καταστήματα μπορεί να εξαργυρωθεί από το κατάστημα μέσω του ασφαλούς συστήματος Gift Cards.</p></div></article>
        <article><span>04</span><div><h3>Το υπόλοιπο δεν χάνεται μετά από μία αγορά</h3><p>Αν δεν χρησιμοποιήσεις όλη την αξία, το υπόλοιπο παραμένει διαθέσιμο για επόμενη επιλέξιμη αγορά μέχρι να εξαντληθεί ή να λήξει η κάρτα, εφόσον έχει οριστεί ημερομηνία λήξης.</p></div></article>
      </div>
    </section>

    <section className="content-band">
      <div className="shell content-split">
        <div>
          <div className="eyebrow light">Online</div>
          <h2>Χρησιμοποίησέ τη στο checkout για την αξία των προϊόντων.</h2>
          <p>Όταν μια Gift Card είναι συνδεδεμένη με τον λογαριασμό σου και είναι ενεργή, μπορεί να χρησιμοποιηθεί σε επιλέξιμη παραγγελία. Αν η αξία της δεν καλύπτει όλη την αγορά, το υπόλοιπο ποσό πληρώνεται με διαθέσιμη μέθοδο πληρωμής.</p>
          <Link className="button button-light" href="/account/gift-cards">Δες το υπόλοιπό σου</Link>
        </div>
        <div className="content-fact-list">
          <div><strong>Για προϊόντα</strong><span>Η αξία της Gift Card εφαρμόζεται στην αξία των επιλέξιμων προϊόντων της παραγγελίας.</span></div>
          <div><strong>Όχι στα έξοδα παράδοσης</strong><span>Τα έξοδα αποστολής ή τοπικής παράδοσης δεν αφαιρούνται από τη Gift Card και, όταν υπάρχουν, πληρώνονται ξεχωριστά στο checkout.</span></div>
          <div><strong>Μερική χρήση</strong><span>Δεν χρειάζεται να ξοδέψεις ολόκληρο το υπόλοιπο σε μία αγορά. Το μη χρησιμοποιημένο ποσό παραμένει στην κάρτα.</span></div>
          <div><strong>Συνδυασμός πληρωμής</strong><span>Αν η Gift Card καλύπτει μόνο μέρος της παραγγελίας, το υπόλοιπο εξοφλείται με μία από τις διαθέσιμες μεθόδους πληρωμής του checkout.</span></div>
        </div>
      </div>
    </section>

    <section className="shell content-section">
      <div className="content-heading">
        <div>
          <div className="eyebrow">Στο μαγαζί</div>
          <h2>Μπορείς να τη χρησιμοποιήσεις και σε συμμετέχοντα φυσικά καταστήματα.</h2>
        </div>
        <p>Όπου το κατάστημα υποστηρίζει ΚΟΝΤΑ ΜΟΥ Gift Cards, ο συνεργάτης μπορεί να ελέγξει την κάρτα και να αφαιρέσει το ποσό που συμφωνήθηκε για την αγορά σου.</p>
      </div>

      <div className="principle-grid">
        <article><span>QR / CODE</span><h3>Δείχνεις τον κωδικό ή το QR</h3><p>Το κατάστημα ελέγχει ότι η Gift Card είναι ενεργή και βλέπει το διαθέσιμο υπόλοιπο πριν ολοκληρώσει την εξαργύρωση.</p></article>
        <article><span>ΠΟΣΟ</span><h3>Αφαιρείται μόνο ό,τι χρησιμοποιείς</h3><p>Μπορεί να γίνει πλήρης ή μερική εξαργύρωση. Το νέο υπόλοιπο ενημερώνεται αμέσως μετά την καταχώρηση.</p></article>
        <article><span>ΥΠΟΛΟΙΠΟ</span><h3>Η ίδια Gift Card συνεχίζει να ισχύει</h3><p>Αν απομένει αξία μετά την αγορά, μπορείς να την χρησιμοποιήσεις ξανά σε επόμενη επιλέξιμη συναλλαγή.</p></article>
      </div>
    </section>

    <section className="content-band">
      <div className="shell content-split">
        <div>
          <div className="eyebrow light">Αγορά & έκδοση</div>
          <h2>{live ? "Οι Gift Cards είναι ενεργές στο σύστημα ΚΟΝΤΑ ΜΟΥ." : "Οι Gift Cards λειτουργούν ήδη μέσω των συμμετεχόντων συνεργατών."}</h2>
          <p>{live
            ? "Η υπηρεσία Gift Cards είναι ενεργοποιημένη. Ανάλογα με το διαθέσιμο κανάλι, η Gift Card μπορεί να εκδοθεί και να σταλεί στον παραλήπτη με τον ασφαλή κωδικό της."
            : "Συμμετέχοντα φυσικά καταστήματα μπορούν να εκδίδουν Gift Cards μέσα από το ΚΟΝΤΑ ΜΟΥ. Η δημόσια online αγορά Gift Card εμφανίζεται μόνο όταν είναι ενεργοποιημένη από την πλατφόρμα."}</p>
        </div>
        <div className="content-fact-list">
          <div><strong>Αξία Gift Card</strong><span>Η αξία που εκδίδεται καταγράφεται ως διαθέσιμο υπόλοιπο της συγκεκριμένης κάρτας.</span></div>
          <div><strong>Αποστολή στον παραλήπτη</strong><span>Όταν η έκδοση γίνεται από συμμετέχον κατάστημα, ο παραλήπτης μπορεί να λάβει τον κωδικό της Gift Card και ηλεκτρονικά.</span></div>
          <div><strong>Προσωπικός κωδικός</strong><span>Μην κοινοποιείς τον πλήρη κωδικό δημόσια. Όποιος έχει πρόσβαση σε έγκυρο κωδικό μπορεί να επιχειρήσει να χρησιμοποιήσει τη Gift Card.</span></div>
        </div>
      </div>
    </section>

    <section className="shell content-section">
      <div className="content-heading">
        <div>
          <div className="eyebrow">Συχνές απορίες</div>
          <h2>Τα βασικά που αξίζει να γνωρίζεις.</h2>
        </div>
        <p>Η σελίδα «Οι Gift Cards μου» είναι το καλύτερο σημείο για να βλέπεις την πραγματική κατάσταση της κάρτας σου.</p>
      </div>

      <div className="principle-grid">
        <article><span>ΧΑΘΗΚΕ Ο ΚΩΔΙΚΟΣ;</span><h3>Επικοινώνησε με την υποστήριξη</h3><p>Αν η Gift Card έχει ήδη συνδεθεί με τον λογαριασμό σου, μπορείς να βλέπεις την κάρτα και το υπόλοιπό της από εκεί. Για πρόβλημα με τον κωδικό, επικοινώνησε με το Κέντρο βοήθειας.</p></article>
        <article><span>ΑΠΟΡΡΙΦΘΗΚΕ;</span><h3>Έλεγξε κατάσταση και υπόλοιπο</h3><p>Η Gift Card πρέπει να είναι ενεργή, να έχει διαθέσιμο υπόλοιπο και να χρησιμοποιείται σε επιλέξιμη αγορά. Αν το πρόβλημα παραμένει, στείλε μας τα στοιχεία της συναλλαγής χωρίς να δημοσιεύσεις τον πλήρη κωδικό.</p></article>
        <article><span>ΕΠΙΣΤΡΟΦΗ;</span><h3>Οι επιστροφές ακολουθούν την αντίστοιχη αγορά</h3><p>Αν μια αγορά που πληρώθηκε με Gift Card επιστραφεί ή ακυρωθεί, η αποκατάσταση χειρίζεται σύμφωνα με την πραγματική συναλλαγή και την πολιτική επιστροφών του ΚΟΝΤΑ ΜΟΥ.</p></article>
      </div>
    </section>

    <section className="shell content-cta">
      <div>
        <div className="eyebrow">Έχεις ήδη Gift Card;</div>
        <h2>Σύνδεσέ τη με τον λογαριασμό σου και δες το διαθέσιμο υπόλοιπο.</h2>
        <p>Από εκεί μπορείς να βλέπεις την κατάσταση της Gift Card πριν την επόμενη αγορά σου.</p>
      </div>
      <div className="hero-actions">
        <Link className="button" href="/account/gift-cards">Οι Gift Cards μου</Link>
        <Link className="button button-secondary" href="/help">Κέντρο βοήθειας</Link>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
