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

export function ResearchScientificReading({ points, summary }: { points: readonly SafePublicResultPoint[]; summary: ScientificReadingSummary }) {
  const chapters = scientificReadingCharts(points);
  const indices = scientificReadingIndices(points);
  return <section className={styles.shell} id="results-science" aria-labelledby="results-science-title">
    <div className={styles.heading}>
      <span className={styles.eyebrow}>02 / ΤΑ ΔΕΔΟΜΕΝΑ</span>
      <h2 id="results-science-title">Οι δείκτες πίσω από την εικόνα.</h2>
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

    <details className={styles.scientificContext}>
      <summary>Πριν συγκρίνετε ευρήματα: τι χρειάζεται προσοχή;</summary>
      <div>
        <p>Η στάθμιση προσαρμόζει τη σύνθεση των {summary.analysed === null ? "εγκεκριμένων" : integer.format(summary.analysed)} απαντήσεων· δεν εξαλείφει τη <strong>μεροληψία μη απόκρισης</strong> ή το γεγονός ότι η συμμετοχή ήταν προαιρετική.</p>
        <p><strong>Τι γίνεται με τους νομούς;</strong> Για n=5–29 οι περιγραφικές εκτιμήσεις είναι ιδιαίτερα ασταθείς. Οι νομοί με n=1–4 παραμένουν ορατοί ως περιοχές χωρίς δημοσιεύσιμη εκτίμηση. Η απουσία τιμής <strong>δεν σημαίνει μηδέν</strong>.</p>
        <p>{summary.hasConventionalSamplingIntervals
          ? "Διαστήματα αβεβαιότητας παρουσιάζονται μόνο όπου έχουν υπολογιστεί και εγκριθεί για τον συγκεκριμένο δείκτη, όχι για κάθε σύγκριση."
          : "Δεν παρουσιάζονται τεχνητά διαστήματα εμπιστοσύνης ή συμβατικό περιθώριο σφάλματος για τις δημόσιες σταθμισμένες περιγραφικές εκτιμήσεις."}</p>
        <Link href="/research/greek-retail-2026/methodology">Αναλυτική μεθοδολογία, περιορισμοί και τεκμηρίωση ↗</Link>
      </div>
    </details>

  </section>;
}
