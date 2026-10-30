import Link from "next/link";
import type { SafePublicResultPoint } from "../../../../lib/research-public-results-data";
import {
  scientificReadingCharts,
  scientificReadingIndices,
  type ScientificReadingSummary,
} from "../../../../lib/research-scientific-reading";
import styles from "./ResearchScientificReading.module.css";

const percent = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const integer = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 0 });

export function ResearchScientificReading({
  points, summary
}: {
  points: readonly SafePublicResultPoint[];
  summary: ScientificReadingSummary;
}) {
  const chapters = scientificReadingCharts(points);
  const indices = scientificReadingIndices(points);
  const stages = [
    { label: "Επιλεγμένες επιχειρήσεις", value: summary.selected },
    { label: "Απεσταλμένες προσκλήσεις", value: summary.sent },
    { label: "Παραδοθείσες προσκλήσεις", value: summary.delivered },
    { label: "Ερωτηματολόγια που ξεκίνησαν", value: summary.started },
    { label: "Ολοκληρωμένα ερωτηματολόγια", value: summary.completed },
    { label: "Στην τελική ανάλυση", value: summary.analysed },
  ].filter((stage): stage is { label: string; value: number } => stage.value !== null);

  return <section className={styles.shell} id="results-science" aria-labelledby="results-science-title">
    <div className={styles.heading}>
      <span className={styles.eyebrow}>03 / ΕΠΙΣΤΗΜΟΝΙΚΗ ΑΝΑΓΝΩΣΗ</span>
      <h2 id="results-science-title">Τι δείχνουν οι αριθμοί — και τι όχι.</h2>
      <p>Μικρά, καθαρά διαγράμματα από τις τελικές σταθμισμένες εκτιμήσεις. Κάθε ποσοστό έχει τον δικό του παρονομαστή και κανένα κενό δεδομένων δεν αντικαθίσταται με μηδέν.</p>
    </div>

    {chapters.length > 0 && <div className={styles.chartGrid}>
      {chapters.map(chapter => <article key={chapter.id} className={styles.chartCard}>
        <header>
          <span className={styles.chartEyebrow}>{chapter.id === "digital" ? "ΨΗΦΙΑΚΟΣ ΜΕΤΑΣΧΗΜΑΤΙΣΜΟΣ" : chapter.id === "economy" ? "ΟΙΚΟΝΟΜΙΑ" : "ΠΕΛΑΤΕΣ"}</span>
          <h3>{chapter.title}</h3>
          <p>{chapter.description}</p>
        </header>
        <div className={styles.barList}>
          {chapter.rows.map(row => <div key={row.key} className={styles.barItem}>
            <div className={styles.barLabels}>
              <span>{row.label}</span>
              <strong>{percent.format(row.value * 100)}%</strong>
            </div>
            <div className={styles.track} role="img"
              aria-label={`${row.label}: ${percent.format(row.value * 100)}%, βάση ${integer.format(row.n)} απαντήσεις`}>
              <div className={styles.bar} style={{ width: `${Math.max(0, Math.min(100, row.value * 100))}%` }} />
            </div>
            <small>Βάση απαντήσεων: n={integer.format(row.n)}</small>
          </div>)}
        </div>
        <p className={styles.chartNote}>{chapter.note}</p>
      </article>)}
    </div>}

    {indices.length > 0 && <section className={styles.indices} aria-labelledby="results-indices-title">
      <div className={styles.miniHeading}>
        <h3 id="results-indices-title">Οι τρεις σύνθετοι δείκτες</h3>
        <p>Κλίμακα από 0 έως 100 · διαφορετική βάση έγκυρων απαντήσεων για κάθε δείκτη.</p>
      </div>
      <div className={styles.indexGrid}>
        {indices.map(index => <div key={index.key} className={styles.indexCard}>
          <span>{index.label}</span>
          <strong>{percent.format(index.value)} <small>/ 100</small></strong>
          <div className={styles.indexTrack} aria-hidden="true">
            <div style={{width:`${index.value}%`}}/>
          </div>
          <small>Βάση n={integer.format(index.n)}</small>
        </div>)}
      </div>
    </section>}

    <section className={styles.methods} aria-labelledby="results-method-title">
      <div className={styles.methodsIntro}>
        <span className={styles.eyebrow}>ΠΩΣ ΠΡΟΕΚΥΨΑΝ ΤΑ ΕΥΡΗΜΑΤΑ</span>
        <h3 id="results-method-title">Μεθοδολογία, χωρίς ψιλά γράμματα.</h3>
        <p>Οι μετρήσεις βασίζονται σε δηλώσεις επιχειρήσεων. Η στάθμιση προσαρμόζει τη σύνθεση του τελικού δείγματος ως προς διαθέσιμα στοιχεία του επιχειρηματικού πλαισίου· δεν εξαλείφει την πιθανή μεροληψία μη απόκρισης.</p>
        <Link href="/research/greek-retail-2026/methodology">Διαβάστε την πλήρη μεθοδολογία <span aria-hidden="true">↗</span></Link>
      </div>
      <div className={styles.methodsDetails}>
        {stages.length > 0 && <div className={styles.funnel}>
          <h4>Από τις προσκλήσεις στις τελικές απαντήσεις</h4>
          <dl>
            {stages.map(stage => <div key={stage.label}>
              <dt>{stage.label}</dt>
              <dd>{integer.format(stage.value)}</dd>
            </div>)}
          </dl>
          {summary.excluded !== null && <p>Δεν συμπεριλήφθηκαν στην ανάλυση: {integer.format(summary.excluded)} ολοκληρωμένα ερωτηματολόγια μετά τον έλεγχο ποιότητας.</p>}
          {summary.completionsPerSent !== null &&
            <p><strong>{percent.format(summary.completionsPerSent * 100)}%</strong> = καταγεγραμμένες ολοκληρώσεις / μοναδικές αποσταλείσες προσκλήσεις. Δεν αποτελεί από μόνο του εκτίμηση του ποσοστού απόκρισης όλου του πληθυσμού.</p>}
        </div>}
        <div className={styles.methodPoints}>
          <div><strong>Τι σημαίνει το n;</strong><p>Είναι ο πραγματικός, μη σταθμισμένος αριθμός έγκυρων απαντήσεων για τον συγκεκριμένο δείκτη — όχι το συνολικό πλήθος επιχειρήσεων που αντιπροσωπεύουν τα βάρη.</p></div>
          <div><strong>Πόσο βέβαιες είναι οι διαφορές;</strong><p>{summary.hasConventionalSamplingIntervals
            ? "Διαστήματα αβεβαιότητας εμφανίζονται μόνο όπου έχουν εγκριθεί και υπολογιστεί για τον αντίστοιχο δείκτη. Οι απλές διαφορές δεν αρκούν για ισχυρισμούς σημαντικότητας."
            : "Για τις δημόσιες περιγραφικές εκτιμήσεις δεν έχει εγκριθεί έγκυρος υπολογισμός διαστημάτων εμπιστοσύνης ή συμβατικού περιθωρίου σφάλματος. Δεν παρουσιάζονται τεχνητά διαστήματα ούτε ισχυρισμοί στατιστικής σημαντικότητας."}</p></div>
          <div><strong>Τι γίνεται με τους νομούς;</strong><p>Τα στοιχεία ανά νομό δημοσιεύονται μόνο όταν πληρούν τα κριτήρια διαθεσιμότητας και προστασίας δεδομένων. Βάση n=5–29 σημαίνει ιδιαίτερα ασταθή περιγραφική εικόνα· η απουσία τιμής δεν σημαίνει μηδέν.</p></div>
          {(summary.administrativelyFinalised || summary.earlyCloseDocumented) &&
            <div><strong>Μεταβολές στη διαδικασία</strong><p>
              {summary.administrativelyFinalised && "Μέρος των αποθηκευμένων, πλήρως απαντημένων ερωτηματολογίων ολοκληρώθηκε διοικητικά με ξεχωριστή καταγραφή, χωρίς να υπονοείται ότι πατήθηκε τελική υποβολή. "}
              {summary.earlyCloseDocumented && "Η συλλογή ολοκληρώθηκε νωρίτερα από την αρχικά προγραμματισμένη ώρα, γεγονός που τεκμηριώνεται στη μεθοδολογία."}
            </p></div>}
        </div>
      </div>
    </section>
  </section>;
}
