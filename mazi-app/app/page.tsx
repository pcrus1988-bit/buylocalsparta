import Link from "next/link";

const pillars = [
  ["01", "Ταμείο Ανάπτυξης", "Συγκεντρώνουμε και αξιολογούμε πραγματικές ανάγκες, με στόχο μελλοντική συλλογική χρηματοδότηση.", "↗"],
  ["02", "Συλλογική προβολή", "Online και offline καμπάνιες που σχεδιάζονται για την παρουσία των μελών στο KONTA ΜΟΥ.", "↗"],
  ["03", "Περισσότερη αγοραστική δύναμη", "Διεκδικούμε καλύτερους όρους σε υπηρεσίες, εργαλεία και προμήθειες.", "↗"],
  ["04", "250 Tokens υπηρεσιών", "Στο μελλοντικό πρόγραμμα πληρωμένης συμμετοχής: 250 νέα μη μεταφερόμενα Tokens κάθε εξοφλημένο μήνα, για υπηρεσίες κατά παραγγελία.", "↗"],
  ["05", "KONTA ΜΟΥ HUB PRO", "Η premium ψηφιακή παρουσία που συνδέεται με την κοινή προβολή, όπου υπάρχει ενεργό HUB.", "↗"],
  ["06", "Δίκτυο που στηρίζει", "Γνώση, συνεργασίες, προτάσεις και ανθρώπινη αλληλοβοήθεια.", "↗"]
];

export default function HomePage() {
  return <main id="content">
    <section className="hero"><div className="shell hero-grid">
      <div className="hero-copy">
        <span className="eyebrow light"><span className="signal"/> Η ΝΕΑ ΣΥΛΛΟΓΙΚΗ ΔΥΝΑΜΗ ΤΩΝ ΜΙΚΡΩΝ</span>
        <h1>Μόνος παλεύεις.<br/><em>Μαζί</em> αλλάζουμε τα πράγματα.</h1>
        <p className="hero-intro">Μια νέα πρωτοβουλία για τις ανεξάρτητες ελληνικές επιχειρήσεις. Ενώνουμε πόρους, ιδέες και ανθρώπους — για να αποκτήσουμε δυνατότητες που μόνοι μας δεν έχουμε.</p>
        <div className="hero-actions"><Link className="button peach" href="/benefits">Γνώρισε τα προνόμια <span aria-hidden="true">↗</span></Link><Link className="text-link white" href="/marketing">Κοινή διαφήμιση ↗</Link><Link className="text-link white" href="/interest">Εκδήλωσε ενδιαφέρον <span aria-hidden="true">↗</span></Link></div>
        <p className="hero-note">Δεχόμαστε πραγματικές αιτήσεις ενδιαφέροντος. Δεν υπάρχουν ακόμη συνδρομές, δεσμεύσεις ή χρηματοδοτήσεις.</p>
      </div>
      <div className="hero-art" aria-label="Αφηρημένη σύνθεση συμβολίζει τις ανεξάρτητες επιχειρήσεις που ενώνονται" role="img">
        <div className="art-ring ring-one"/><div className="art-ring ring-two"/>
        <div className="art-circle main-circle"><span>Μ</span></div>
        <div className="art-circle top-circle">Α</div><div className="art-circle bottom-circle">Ζ</div><div className="art-circle side-circle">Ι</div>
        <span className="art-caption">ΜΙΚΡΕΣ ΔΥΝΑΜΕΙΣ<br/>ΜΕΓΑΛΗ ΑΛΛΑΓΗ.</span>
        <div className="art-stamp">01 / ΣΥΛΛΟΓΙΚΑ</div>
      </div>
    </div></section>
    <div className="ticker" aria-hidden="true"><div className="ticker-inner">ΣΤΗΡΙΖΟΥΜΕ • ΣΥΝΕΡΓΑΖΟΜΑΣΤΕ • ΑΝΑΠΤΥΣΣΟΜΑΣΤΕ • ΜΑΖΙ • ΣΤΗΡΙΖΟΥΜΕ • ΣΥΝΕΡΓΑΖΟΜΑΣΤΕ • ΑΝΑΠΤΥΣΣΟΜΑΣΤΕ • ΜΑΖΙ •</div></div>
    <section className="section shell manifesto">
      <div><span className="eyebrow">01 / ΓΙΑΤΙ ΜΑΖΙ</span><div className="mini-figure">✳</div></div>
      <div><h2>Το πρόβλημα δεν είναι ότι είμαστε μικροί. <span>Είναι ότι προσπαθούμε ο καθένας μόνος.</span></h2>
        <p>Οι μικρές επιχειρήσεις κρατούν ζωντανές τις γειτονιές και τις τοπικές οικονομίες. Χρειάζονται όμως πρόσβαση σε κεφάλαια, τεχνολογία, προβολή και συνεργασίες. Το ΜΑΖΙ δημιουργείται ως μια πρακτική απάντηση — από επιχειρήσεις, για επιχειρήσεις.</p>
      </div>
    </section>
    <section className="section muted"><div className="shell">
      <div className="section-top"><span className="eyebrow">02 / ΤΙ ΧΤΙΖΟΥΜΕ</span><span className="side-note">ΕΞΙ ΤΡΟΠΟΙ ΝΑ ΠΑΜΕ ΜΠΡΟΣΤΑ</span></div>
      <h2 className="section-heading">Περισσότερα από <em>ένα</em> ταμείο.</h2>
      <div className="pillars">{pillars.map(([n,title,desc,arrow])=><article className="pillar" key={n}><span className="pillar-index">{n}</span><div className="pillar-content"><h3>{title}</h3><p>{desc}</p></div><span aria-hidden="true" className="pillar-arrow">{arrow}</span></article>)}</div>
    </div></section>
    <section className="section fund-feature shell">
      <div className="feature-lead"><span className="eyebrow">03 / ΤΑΜΕΙΟ ΣΥΛΛΟΓΙΚΗΣ ΑΝΑΠΤΥΞΗΣ</span><h2>Έχεις μια ανάγκη.<br/><em>Έχουμε μια δύναμη.</em></h2><p>Κάθε επαληθευμένη επιχείρηση μπορεί να καταθέτει μία τεκμηριωμένη πρόταση ανά ανοιχτό κύκλο. Τα μέλη θα αξιολογούν και θα ψηφίζουν, ώστε να υποστηρίζονται πολλαπλά έργα με σαφείς κανόνες και διαφάνεια.</p><Link className="button dark" href="/fund">Πώς θα λειτουργεί <span aria-hidden="true">↗</span></Link></div>
      <div className="proposal-display operational-panel">
        <div className="proposal-label">ΠΡΑΓΜΑΤΙΚΗ ΑΙΤΗΣΗ ΕΝΔΙΑΦΕΡΟΝΤΟΣ</div>
        <span className="proposal-quote">Πρώτα γνωριζόμαστε. Έπειτα οργανώνουμε συλλογικά τις ανάγκες μας.</span>
        <p>Η ιδρυτική διαδικασία δέχεται πραγματικές αιτήσεις ενδιαφέροντος. Μετά τον έλεγχο της επιχείρησης και του ΓΕΜΗ, μπορείς να συμμετέχεις στους κύκλους που είναι ανοιχτοί για υποβολές. Σήμερα δεν υπάρχει ενεργή χρηματοδότηση.</p>
        <div className="proposal-bottom"><span className="round-star">✳</span><p>Χωρίς κληρώσεις.<br/>Χωρίς εικονικά κεφάλαια.<br/>Με πραγματική λογοδοσία.</p></div>
        <Link className="button dark" href="/interest">Κάνε αίτηση ενδιαφέροντος ↗</Link>
      </div>
    </section>
    <section className="section quote-section"><div className="shell quote-grid"><span className="quote-mark">“</span><div><blockquote>Όταν η επιχείρηση του διπλανού μας γίνεται πιο δυνατή, μια ολόκληρη τοπική οικονομία μπορεί να προχωρήσει.</blockquote><span className="eyebrow light">Η ΦΙΛΟΣΟΦΙΑ ΤΟΥ ΜΑΖΙ</span></div></div></section>
    <section className="section shell closer"><span className="eyebrow">04 / ΞΕΚΙΝΑΜΕ ΑΠΟ ΤΙΣ ΑΡΧΕΣ</span><h2>Δεν ζητάμε απλώς να μας εμπιστευτείς. <em>Θέλουμε να χτίσουμε τους λόγους.</em></h2><p>Ισότιμη ψήφος, ελεγμένες προτάσεις, σαφείς κανόνες, ανεξάρτητη διαχείριση. Πριν διαχειριστούμε οποιοδήποτε κοινό ποσό, θέτουμε τις δικλίδες που θα το προστατεύουν.</p><div className="closer-actions"><Link href="/charter" className="button dark">Διάβασε τις αρχές <span aria-hidden="true">↗</span></Link><Link href="/interest" className="text-link">Εκδήλωση ενδιαφέροντος →</Link></div></section>
  </main>;
}
