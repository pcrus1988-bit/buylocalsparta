import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../components/SiteFooter";
import { EXTERNAL_STUDIES } from "../../../lib/research-external-analysis";
import styles from "../../../components/ResearchObservatory.module.css";
import external from "../../../components/ResearchExternalSources.module.css";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/market-sentiment", {
    title: "Έρευνες άλλων φορέων & κλίμα αγοράς · Παρατηρητήριο KONTA MOY",
    description: "Επιλεγμένες δημοσιευμένες έρευνες και δείκτες για το ελληνικό λιανεμπόριο από ΙΟΒΕ, ΕΣΕΕ/ΙΝΕΜΥ, ΙΕΛΚΑ, ΕΛΣΤΑΤ και Ευρωπαϊκή Επιτροπή, με συνδέσμους στις πηγές.",
    keywords: ["κλίμα αγοράς", "έρευνες λιανεμπορίου", "ΙΟΒΕ", "ΙΝΕΜΥ", "ΕΣΕΕ", "ΙΕΛΚΑ", "επιχειρηματικές προσδοκίες", "καταναλωτική εμπιστοσύνη"]
  });
}

type SourceKind = "sentiment" | "survey" | "market";
type ExternalSource = Readonly<{
  id: string;
  kind: SourceKind;
  organisation: string;
  title: string;
  takeaway: string;
  comparison?: string;
  clarity: string;
  visualPercent?: number;
  period: string;
  geography: string;
  description: string;
  figure?: string;
  figureLabel?: string;
  context: string;
  sourceUrl: string;
  sourceName: string;
}>;

// Editorial selection of dated, publicly available publications. This is not a live feed.
// Do not blend these figures into the KONTA MOY study or imply equivalent methods.
const sources: readonly ExternalSource[] = [
  {
    id: "iobe-september-2026",
    takeaway: "Οι έμποροι είναι πιο συγκρατημένοι για το επόμενο τρίμηνο.",
    comparison: "↓ 0,8 μονάδες από τον Ιούλιο (116,8 → 116,0)",
    clarity: "Μειώθηκε λίγο η αισιοδοξία των επιχειρήσεων. Δεν σημαίνει ότι οι πωλήσεις μειώθηκαν κατά 0,8%.",
    kind: "sentiment",
    organisation: "ΙΟΒΕ · DG ECFIN",
    title: "Επιχειρηματικές προσδοκίες στο λιανικό εμπόριο",
    period: "Σεπτέμβριος 2026 · δημοσίευση 02/10/2026",
    geography: "Ελλάδα",
    description: "Ο δείκτης υποχώρησε ελαφρά από τον Ιούλιο, ενώ οι προβλέψεις για τις πωλήσεις του επόμενου τριμήνου έγιναν πιο συγκρατημένες.",
    figure: "116,0",
    figureLabel: "μονάδες · από 116,8 τον Ιούλιο",
    context: "Δείκτης προσδοκιών επιχειρήσεων, όχι ποσοστό πωλήσεων. Εξετάζει εκτιμήσεις και προβλέψεις στον κλάδο.",
    sourceUrl: "https://iobe.gr/wp-content/uploads/2026/10/BCS_02102026_REP_GR.pdf",
    sourceName: "Έκθεση ΙΟΒΕ · σελ. 10"
  },
  {
    id: "ec-september-2026",
    takeaway: "Το οικονομικό κλίμα στην Ευρώπη εξασθένησε ελαφρά.",
    comparison: "↓ 0,4 μονάδες στην ΕΕ / ↓ 0,5 στην Ευρωζώνη από τον Αύγουστο",
    clarity: "Το 100 είναι ο μακροχρόνιος μέσος όρος: το 97,9 είναι λίγο χαμηλότερα. Αφορά την ΕΕ και την Ευρωζώνη, όχι ειδικά την Ελλάδα ή τις πωλήσεις της.",
    kind: "sentiment",
    organisation: "Ευρωπαϊκή Επιτροπή · DG ECFIN",
    title: "Οικονομικό κλίμα και καταναλωτική εμπιστοσύνη",
    period: "Σεπτέμβριος 2026 · δημοσίευση 29/09/2026",
    geography: "ΕΕ και Ευρωζώνη · όχι ειδικά Ελλάδα",
    description: "Το οικονομικό κλίμα υποχώρησε ελαφρά στην ΕΕ και στην Ευρωζώνη. Η σύντομη εκτίμηση καταναλωτικής εμπιστοσύνης επίσης επιδεινώθηκε.",
    figure: "97,9",
    figureLabel: "δείκτης οικονομικού κλίματος · ΕΕ και Ευρωζώνη",
    context: "Ευρωπαϊκό σημείο αναφοράς. Ο αριθμός δεν περιγράφει ειδικά το ελληνικό λιανεμπόριο ούτε ταυτίζεται με τον δείκτη ΙΟΒΕ.",
    sourceUrl: "https://economy-finance.ec.europa.eu/economic-forecast-and-surveys/business-and-consumer-surveys/latest-business-and-consumer-surveys_en",
    sourceName: "Ευρωπαϊκή Επιτροπή · δημοσιεύσεις ερευνών"
  },
  {
    id: "inemy-holidays-2026",
    takeaway: "Πάνω από τις μισές επιχειρήσεις δήλωσαν λιγότερες γιορτινές πωλήσεις.",
    comparison: "Σύγκριση με την προηγούμενη εορταστική περίοδο",
    clarity: "52% από τις 205 επιχειρήσεις που συμμετείχαν στην έρευνα — όχι 52% όλων των ελληνικών καταστημάτων.",
    visualPercent: 52,
    kind: "survey",
    organisation: "ΕΣΕΕ · ΙΝΕΜΥ",
    title: "Η κίνηση των καταστημάτων την εορταστική περίοδο",
    period: "Έρευνα 07–09/01/2026 · δημοσίευση 12/01/2026",
    geography: "Ελλάδα · 205 εμπορικές επιχειρήσεις",
    description: "Περισσότερες από τις μισές επιχειρήσεις που συμμετείχαν δήλωσαν χαμηλότερες πωλήσεις σε σχέση με την προηγούμενη εορταστική περίοδο.",
    figure: "52%",
    figureLabel: "των συμμετεχουσών επιχειρήσεων ανέφεραν μείωση",
    context: "Τηλεφωνική, πανελλαδική, στρωματοποιημένη έρευνα επιχειρήσεων. Οι δηλώσεις δεν είναι επίσημη μέτρηση του συνολικού τζίρου.",
    sourceUrl: "https://www.poee-org.gr/index.php/nea-anakoinoseis/apotelesmata-tis-panelladikis-erevnas-pou-dieksigage-to-inemy-tis-esee-gia-tin-kinisi-ton-emporikon-katastimaton-kata-ti-diarkeia-tis-eortastikis-periodou-2025-2026",
    sourceName: "Δημοσιευμένα αποτελέσματα · αναδημοσίευση ΠΟΕΕ"
  },
  {
    id: "ielka-september-2026",
    takeaway: "Η μέση αξία ανά προϊόν στα μεγάλα σούπερ μάρκετ μειώθηκε λίγο.",
    comparison: "Σεπτέμβριος 2026 σε σύγκριση με Σεπτέμβριο 2025",
    clarity: "Αφορά τη μέση μοναδιαία αξία στις αλυσίδες, όχι απαραίτητα την τιμή κάθε μεμονωμένου προϊόντος.",
    kind: "market",
    organisation: "ΙΕΛΚΑ",
    title: "Μεταβολές τιμών στις μεγάλες αλυσίδες σούπερ μάρκετ",
    period: "Σεπτέμβριος 2026 · δημοσίευση 05/10/2026",
    geography: "Ελλάδα · οργανωμένο λιανεμπόριο τροφίμων",
    description: "Η μελέτη καταγράφει μείωση της μέσης μοναδιαίας αξίας στις αλυσίδες σούπερ μάρκετ έναντι του Σεπτεμβρίου 2025.",
    figure: "−0,75%",
    figureLabel: "ετήσια μεταβολή για το συγκεκριμένο κανάλι",
    context: "Ανάλυση πραγματικών πωλήσεων και όγκων ανά κατηγορία· δεν είναι έρευνα γνώμης, ούτε ο γενικός δείκτης τιμών καταναλωτή.",
    sourceUrl: "https://ielka.gr/anakoinosi-5-10-2026/",
    sourceName: "Επίσημη ανακοίνωση ΙΕΛΚΑ"
  },
  {
    id: "elstat-june-2026",
    takeaway: "Τι δείχνουν οι πραγματικές πωλήσεις του λιανεμπορίου;",
    comparison: "Επίσημα στοιχεία για τον Ιούνιο 2026",
    clarity: "Η ΕΛΣΤΑΤ μετρά τζίρο και όγκο πωλήσεων. Υπάρχουν διαφορετικοί δείκτες, γι’ αυτό δεν τους συγχωνεύουμε σε ένα ποσοστό.",
    kind: "market",
    organisation: "ΕΛΣΤΑΤ",
    title: "Δείκτες κύκλου εργασιών και όγκου λιανικού εμπορίου",
    period: "Μήνας αναφοράς Ιούνιος 2026",
    geography: "Ελλάδα · λιανικό εμπόριο",
    description: "Επίσημοι δείκτες με χρονοσειρές για την πορεία των πωλήσεων και του όγκου του λιανεμπορίου.",
    context: "Στατιστική μέτρηση πραγματικής δραστηριότητας και όχι ερώτηση για προσδοκίες ή εμπιστοσύνη. Οι προσωρινές τιμές ενδέχεται να αναθεωρηθούν.",
    sourceUrl: "https://www.statistics.gr/el/statistics/-/publication/DKT39/2026-M06",
    sourceName: "ΕΛΣΤΑΤ · έκδοση Ιουνίου 2026"
  }
];

const sections: ReadonlyArray<{ id: SourceKind; eyebrow: string; title: string; explanation: string }> = [
  { id: "sentiment", eyebrow: "01 · Κλίμα αγοράς", title: "Πώς βλέπουν την οικονομία οι επιχειρήσεις και οι καταναλωτές;", explanation: "Αυτά τα στοιχεία δείχνουν αισιοδοξία ή ανησυχία — όχι πόσο πραγματικά πουλήθηκε." },
  { id: "survey", eyebrow: "02 · Έρευνες φορέων", title: "Τι είπαν τα καταστήματα στις έρευνες;", explanation: "Απαντήσεις επιχειρήσεων που συμμετείχαν σε συγκεκριμένες έρευνες, όχι στοιχεία για όλα τα καταστήματα." },
  { id: "market", eyebrow: "03 · Στοιχεία αγοράς", title: "Τι άλλαξε πραγματικά στις πωλήσεις και στις τιμές;", explanation: "Μετρήσεις αγοράς και συναλλαγών, όχι εκτιμήσεις ή γνώμες." }
];

export default function ExternalMarketSentimentPage() {
  return <main className={styles.shell}>
    <div className={styles.frame}>
      <div className={styles.topbar}>
        <Link className={styles.brand} href="/research">KONTA MOY · ΕΡΕΥΝΑ</Link>
        <nav className={styles.nav} aria-label="Έρευνα">
          <Link href="/research">Οι μελέτες μας</Link>
          <Link href="/research/market-sentiment" aria-current="page" className={external.currentNav}>Άλλοι φορείς</Link>
          <Link href="/research/compare">Σύγκριση</Link>
          <Link href="/research/privacy">Ιδιωτικότητα</Link>
        </nav>
      </div>

      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Παρατηρητήριο Ελληνικού Λιανεμπορίου · Εξωτερικές πηγές</span>
          <h1>Η εικόνα της αγοράς, από περισσότερες φωνές.</h1>
          <p>Επιλεγμένες έρευνες, επιχειρηματικές προσδοκίες και στοιχεία αγοράς από αναγνωρισμένους φορείς. Διαβάστε τα βασικά ευρήματα και μεταβείτε απευθείας στις δημοσιεύσεις τους.</p>
          <div className={styles.heroBadges}>
            <span className={styles.badge}>{EXTERNAL_STUDIES.length} τεκμηριωμένες δημοσιεύσεις</span>
            <span className={styles.badge}>Πηγές με αναφορά φορέα</span>
            <span className={styles.badge}>Ενημέρωση επιλογής: 08/10/2026</span>
          </div>
          <div className={styles.sectionActions}>
            <a className={[styles.actionButton, styles.primaryButton].join(" ")} href="#sentiment">Δείτε το κλίμα αγοράς</a>
            <Link className={styles.actionButton} href="/research">Οι δικές μας μελέτες</Link>
          </div>
        </div>
        <aside className={styles.heroAside}>
          <span>Συμπληρωματική εικόνα</span>
          <strong className={external.asideTitle}>Ανεξάρτητες πηγές</strong>
          <hr />
          <span>Περιλαμβάνει</span>
          <strong className={external.asideText}>Έρευνες · Προσδοκίες · Στατιστικές</strong>
          <hr />
          <span>Τα στοιχεία αποδίδονται στους οργανισμούς που τα δημοσίευσαν. Δεν αποτελούν αποτελέσματα έρευνας του KONTA MOY.</span>
        </aside>
      </header>

      <section className={styles.section} aria-labelledby="market-analysis-link-title">
        <div className={styles.sectionHead}>
          <div><span className={styles.eyebrow}>Εξερευνήστε τα δεδομένα</span><h2 id="market-analysis-link-title">Όλες οι συγκρίσεις σε ένα μέρος.</h2></div>
          <p>Γραφήματα, μεταβολές ανά έτος, επικάλυψη περιόδων, σύγκριση πηγών και δική σας ανάλυση CSV βρίσκονται πλέον στο κοινό εργαστήριο.</p>
        </div>
        <div className={styles.sectionActions}>
          <Link className={[styles.actionButton, styles.primaryButton].join(" ")} href="/research/compare">Ανοίξτε το εργαστήριο συγκρίσεων →</Link>
          <Link className={styles.actionButton} href="/research/compare?view=ours">Οι μελέτες KONTA MOY →</Link>
          <Link className={styles.actionButton} href="/research/compare#income-spending-relations">Εισόδημα, πληθωρισμός & δαπάνες →</Link>
        </div>
      </section>

      <div className={external.readingGuide} role="note">
        <strong>Με μια ματιά</strong>
        <span>Πρώτα διαβάστε το συμπέρασμα. Ο αριθμός και η σύγκριση ακολουθούν. Αν θέλετε λεπτομέρειες, ανοίξτε το «Τι ακριβώς μετρήθηκε;».</span>
      </div>

      <nav className={external.jumpNav} aria-label="Θεματικές εξωτερικών ερευνών">
        {sections.map((section) => <a href={"#" + section.id} key={section.id}>{section.eyebrow} <span aria-hidden="true">↗</span></a>)}
      </nav>

      {sections.map((section) => <section className={[styles.section, external.sourceSection].join(" ")} id={section.id} key={section.id} aria-labelledby={section.id + "-heading"}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>{section.eyebrow} · Επιλεγμένη παρουσίαση</span>
            <h2 id={section.id + "-heading"}>{section.title}</h2>
          </div>
          <p>{section.explanation}</p>
        </div>
        <div className={external.sourceGrid}>
          {sources.filter((item) => item.kind === section.id).map((item) => <article className={external.sourceCard} key={item.id}>
            <div className={external.cardHeading}>
              <span className={external.organisation}>{item.organisation}</span>
              <span className={external.geography}>{item.geography}</span>
            </div>
            <h3 className={external.takeaway}>{item.takeaway}</h3>
            {item.figure && <div className={external.figure}>
              <strong>{item.figure}</strong>
              <span>{item.figureLabel}</span>
            </div>}
            {typeof item.visualPercent === "number" && <div className={external.resultTrack}
              role="img" aria-label={item.visualPercent + "% των επιχειρήσεων που συμμετείχαν ανέφεραν μείωση πωλήσεων"}>
              <span style={{ width: item.visualPercent + "%" }} />
            </div>}
            {item.comparison && <p className={external.comparison}>{item.comparison}</p>}
            <p className={external.clarity}>{item.clarity}</p>
            <p className={external.period}>Πότε: {item.period}</p>
            <details className={external.details}>
              <summary>Τι ακριβώς μετρήθηκε;</summary>
              <div className={external.detailsBody}>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <p>{item.context}</p>
                <p>Πεδίο: {item.geography}</p>
              </div>
            </details>
            <a className={external.sourceLink} href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={"Άνοιγμα πηγής: " + item.sourceName}>
              Δείτε την αρχική δημοσίευση <span aria-hidden="true">↗</span>
            </a>
          </article>)}
        </div>
      </section>)}

      <section className={styles.section} aria-labelledby="method-note-heading">
        <div className={external.disclaimer}>
          <div>
            <span className={styles.eyebrow}>Πώς επιλέγουμε και παρουσιάζουμε πηγές</span>
            <h2 id="method-note-heading">Διαφάνεια πριν από τη σύγκριση.</h2>
          </div>
          <p>Κάθε δημοσίευση διατηρεί τη δική της προέλευση, χρονική περίοδο, γεωγραφική κάλυψη και μέθοδο. Δεν συνδυάζουμε διαφορετικούς δείκτες σε έναν αυθαίρετο «βαθμό αγοράς», ούτε παρουσιάζουμε τις εξωτερικές έρευνες ως δικά μας αποτελέσματα.</p>
          <p>Η επιλογή είναι συντακτική και δεν ανανεώνεται αυτόματα. Για νεότερα στοιχεία ελέγξτε την πρωτότυπη πηγή. Οι σύνδεσμοι οδηγούν σε ιστοτόπους τρίτων.</p>
          <Link className={styles.cardLink} href="/research/compare">Αναλύστε και συγκρίνετε τα διαθέσιμα στοιχεία →</Link>
        </div>
      </section>

      <div className={styles.footer}>KONTA MOY Research · Έρευνες άλλων φορέων · Κλίμα αγοράς</div>
    </div>
    <SiteFooter />
  </main>;
}
