import type { Metadata } from "next";
import Link from "next/link";
import InterestForm from "./interest-form";
import s from "./interest.module.css";

export const metadata: Metadata = {
  title: "Αίτηση ενδιαφέροντος επιχειρήσεων",
  description: "Αίτηση ενδιαφέροντος για το ΜΑΖΙ με ΑΦΜ, έλεγχο ΓΕΜΗ και ανθρώπινη αξιολόγηση. Η συμμετοχή γίνεται αποκλειστικά κατόπιν πρόσκλησης.",
  robots: { index: true, follow: true }
};

export default function InterestPage() {
  return <main id="content" className={s.main}>
    <section className={s.intro}>
      <div className={s.shell}>
        <div className={s.eyebrow}><span className={s.star} aria-hidden="true">✳</span> 01 / ΕΚΔΗΛΩΣΗ ΕΝΔΙΑΦΕΡΟΝΤΟΣ</div>
        <div className={s.headline}>
          <div><h1>Μαζί αρχίζουμε.<br/><em>Με την επιχείρησή σου.</em></h1>
            <p>Το ΜΑΖΙ ανοίγει τον δρόμο σε ανεξάρτητες ελληνικές επιχειρήσεις. Πες μας ποια επιχείρηση εκπροσωπείς· θα ελέγξουμε τα στοιχεία και θα επικοινωνήσουμε μαζί σου για τα επόμενα βήματα.</p>
          </div>
          <div className={s.seal} aria-hidden="true"><span>Μ</span><small>ΕΝΩΝΟΥΜΕ<br/>ΔΥΝΑΜΕΙΣ</small></div>
        </div>
      </div>
    </section>
    <section className={s.content}>
      <div className={s.shell}>
        <div className={s.steps} aria-label="Διαδικασία">
          <div><span>01</span><strong>ΑΦΜ & στοιχεία</strong><small>Εκδήλωση ενδιαφέροντος</small></div>
          <div><span>02</span><strong>ΓΕΜΗ & έλεγχος</strong><small>Έλεγχος εκπροσώπου από τον διαχειριστή</small></div>
          <div><span>03</span><strong>Ατομική πρόσκληση</strong><small>Μόνο μετά από έγκριση</small></div>
        </div>
        <div className={s.twoColumn}>
          <div className={s.statement}>
            <span className={s.eyebrow}>ΜΙΑ ΚΟΙΝΟΤΗΤΑ ΜΕ ΠΡΑΓΜΑΤΙΚΗ ΕΜΠΙΣΤΟΣΥΝΗ</span>
            <h2>Δεν είναι απλή <em>εγγραφή.</em></h2>
            <p>Κάθε αίτηση εξετάζεται πραγματικά. Η επαλήθευση του ΓΕΜΗ δεν αρκεί από μόνη της: απαιτείται και έλεγχος της νόμιμης εκπροσώπησης και του email επικοινωνίας.</p>
            <div className={s.rule}><span>✳</span><p>Δεν δημιουργούμε λογαριασμό, συνδρομή ή οικονομική υποχρέωση με αυτή την αίτηση.</p></div>
            <p className={s.existing}>Έχεις ήδη λογαριασμό ΜΑΖΙ; <Link href="/join">Σύνδεση μέλους ↗</Link></p>
          </div>
          <InterestForm/>
        </div>
      </div>
    </section>
  </main>;
}
