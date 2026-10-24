import Link from "next/link";
import type { PublishedResearchEstimate } from "../../../../lib/research-survey-release";
import { RESEARCH_PUBLIC_CHAPTERS } from "../../../../lib/research-public-chapters";
import { RESEARCH_PUBLIC_RELATIONS } from "../../../../lib/research-public-relations";
import styles from "./ResultsChapters.module.css";

type Estimate = PublishedResearchEstimate;
const numeral = (number: number, max = 1) =>
  new Intl.NumberFormat("el-GR", {maximumFractionDigits:max}).format(number);
const positive = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const sample = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;

function displayEstimate(estimate: Estimate): string {
  const fmt = estimate.metadata.format;
  if (fmt === "proportion") return numeral(estimate.estimate! * 100) + "%";
  return numeral(estimate.estimate!, 2);
}
function formatCI(estimate: Estimate) {
  if (estimate.ciLower == null || estimate.ciUpper == null) return null;
  if (estimate.metadata.format === "proportion") {
    return numeral(estimate.ciLower * 100) + "% – " + numeral(estimate.ciUpper * 100) + "%";
  }
  return numeral(estimate.ciLower,2) + " – " + numeral(estimate.ciUpper,2);
}
function visibleEstimate(raw: Estimate | undefined): raw is Estimate {
  return Boolean(raw && !raw.suppressed && raw.estimate !== null && Number.isFinite(raw.estimate) && raw.unweightedN >= 30);
}
const fallbackLabels: Record<string, string> = {
  "digital_readiness.mean": "Δείκτης ψηφιακής ετοιμότητας",
  "retail_friction.mean": "Δείκτης λειτουργικών δυσκολιών",
  "retail_confidence.mean": "Δείκτης επιχειρηματικής εμπιστοσύνης"
};
function evidenceLabel(estimate: Estimate) {
  const explicit = estimate.metadata.label;
  if (typeof explicit === "string" && explicit.trim()) return explicit;
  return fallbackLabels[estimate.metricKey] ?? estimate.metricKey.replaceAll("."," · ").replaceAll("_"," ");
}

export function ResearchResultsChapters({estimates}:{estimates:readonly Estimate[]}) {
  const overall = new Map(
    estimates.filter(e=>Object.keys(e.segment).length===0)
      .map(e=>[e.metricKey,e] as const)
  );

  return <div className={styles.wrapper}>
    <nav className={styles.jump} aria-label="Θεματικές ενότητες αποτελεσμάτων">
      {RESEARCH_PUBLIC_CHAPTERS.map(chapter=>
        <a key={chapter.id} href={"#"+chapter.id}>
          <span>{chapter.number}</span>{chapter.title}
        </a>
      )}
    </nav>

    <section className={styles.explanation}>
      <strong>Τι σημαίνουν οι επιστημονικοί αριθμοί;</strong>
      <p>Οι κεντρικές εκτιμήσεις προέρχονται αποκλειστικά από την εγκεκριμένη σταθμισμένη τελική ανάλυση,
        με τον αντίστοιχο μη σταθμισμένο αριθμό απαντήσεων (n) και διάστημα εμπιστοσύνης 95%
        μόνο όταν υποστηρίζεται από τη μεθοδολογία. Οι συγκρίσεις μεταξύ δύο ομάδων
        είναι <strong>εξερευνητικές, μη προεγγεγραμμένες</strong> και δεν αποδεικνύουν αιτιότητα.
        Δεν αποδίδονται p-values ή αδικαιολόγητα διαστήματα εμπιστοσύνης σε αυτές τις συγκρίσεις.</p>
      <Link href="/research/greek-retail-2026/methodology">Μεθοδολογία και περιορισμοί →</Link>
    </section>

    {RESEARCH_PUBLIC_CHAPTERS.map(chapter => {
      const metrics = chapter.metrics
        .map(key => overall.get(key))
        .filter(visibleEstimate);
      const relations = chapter.relationIds.map(id => ({
        description: RESEARCH_PUBLIC_RELATIONS.find(relation => relation.id===id),
        estimate: overall.get("relationship."+id+".difference")
      }));
      return <section key={chapter.id} id={chapter.id} className={styles.chapter}
        aria-labelledby={chapter.id+"-heading"}>
        <header className={styles.heading}>
          <div className={styles.number}>ΕΝΟΤΗΤΑ {chapter.number} / 06</div>
          <h2 id={chapter.id+"-heading"}>{chapter.title}</h2>
          <p>{chapter.subtitle}</p>
          <small>Πηγές ερωτήσεων: {chapter.questions.join(" · ")}</small>
        </header>

        <div className={styles.metricGrid} aria-label="Αριθμητικά ευρήματα">
          {metrics.length ? metrics.map(metric=>
            <article key={metric.metricKey} className={styles.metric}>
              <span>{evidenceLabel(metric)}</span>
              <strong>{displayEstimate(metric)}</strong>
              <small>n = {numeral(metric.unweightedN,0)}
                {formatCI(metric)
                  ? " · 95% ΔΕ: "+formatCI(metric)
                  : " · Δεν τεκμηριώνεται διάστημα εμπιστοσύνης"}
              </small>
            </article>
          ): <div className={styles.pending}>
            Δεν έχουν εγκριθεί ακόμη αριθμητικές εκτιμήσεις για αυτή την ενότητα.
          </div>}
        </div>

        <div className={styles.relationships}>
          <h3>Διασταυρώσεις απαντήσεων</h3>
          {relations.map(({description,estimate}) => {
            if (!description) return null;
            const m = estimate?.metadata ?? {};
            const a = positive(m.groupAShare), b = positive(m.groupBShare);
            const na = sample(m.groupAN), nb = sample(m.groupBN);
            const ready = visibleEstimate(estimate) &&
              typeof a === "number" && typeof b === "number" &&
              typeof na === "number" && typeof nb === "number" &&
              na >= 30 && nb >= 30;
            const delta = ready ? (a-b)*100 : null;
            return <article key={description.id} className={styles.relation}>
              <div>
                <strong>{description.title}</strong>
                <small>Μεταβλητές: {description.questionCodes.join(" × ")}</small>
              </div>
              {ready && delta !== null ? <>
                <div className={styles.comparison}>
                  <div><span>{description.groupALabel}</span>
                    <strong>{numeral(a*100)}%</strong>
                    <small>n={numeral(na,0)}</small></div>
                  <div><span>{description.groupBLabel}</span>
                    <strong>{numeral(b*100)}%</strong>
                    <small>n={numeral(nb,0)}</small></div>
                  <div className={styles.delta}>
                    <span>Διαφορά Α−Β</span>
                    <strong>{delta>0?"+":""}{numeral(delta)} μ.π.</strong>
                    <small>Σταθμισμένη περιγραφική σύγκριση</small>
                  </div>
                </div>
                <p>Η εκτιμώμενη διαφορά μεταξύ των δύο ομάδων είναι {numeral(Math.abs(delta))} ποσοστιαίες μονάδες
                  {delta===0?" (χωρίς καταγεγραμμένη διαφορά)":" υπέρ της ομάδας "+(delta>0?"Α":"Β")}.
                  Δεν έχει εκτιμηθεί ελεγμένο, σχεδιαστικά ορθό διάστημα αβεβαιότητας για αυτή τη διαφορά
                  και επομένως δεν μπορεί να χαρακτηριστεί στατιστικά σημαντική.</p>
              </> : <p className={styles.pending}>
                Η συγκεκριμένη σύγκριση δεν έχει δημοσιεύσιμα δεδομένα
                (απαιτούνται τουλάχιστον 30 έγκυρες απαντήσεις σε καθεμία από τις δύο ομάδες).
              </p>}
            </article>;
          })}
        </div>
        <div className={styles.science}>
          <strong>Επιστημονική ερμηνεία</strong>
          <p>{chapter.scientificNote}</p>
        </div>
      </section>;
    })}
  </div>;
}
