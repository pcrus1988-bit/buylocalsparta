import type { SafePublicResultPoint } from "../../../../lib/research-public-results-data";
import {
  scientificReadingCharts,
  scientificReadingIndices,
} from "../../../../lib/research-scientific-reading";
import styles from "./ResearchScientificReading.module.css";

const percent = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const integer = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 0 });

export function ResearchScientificReading({ points }: { points: readonly SafePublicResultPoint[] }) {
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

  </section>;
}
