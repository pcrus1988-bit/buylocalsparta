import Link from "next/link";
import { externalGroup } from "../lib/research-external-analysis";
import {
  RESEARCH_PRESET_CATEGORIES,
  RESEARCH_PRESET_COUNT
} from "../lib/research-comparison-presets";
import styles from "./ResearchComparisonPresets.module.css";

const statusLabels = {
  direct: "Συγκρίσιμη σειρά",
  "trend-only": "Προσεκτική παράθεση",
  descriptive: "Περιγραφικά ευρήματα"
} as const;

export function ResearchComparisonPresets({ activeIndicator }: { activeIndicator: string }) {
  const activeCategory = RESEARCH_PRESET_CATEGORIES.find(category =>
    category.presets.some(preset => preset.indicator === activeIndicator)
  )?.id ?? "households";

  return <section className={styles.library} aria-labelledby="research-presets-heading">
    <div className={styles.heading}>
      <div>
        <span className={styles.eyebrow}>Έτοιμες συγκρίσεις · Επιλέξτε θέμα</span>
        <h2 id="research-presets-heading">Εξερευνήστε την αγορά με μία επιλογή.</h2>
        <p>Ανοίξτε μια προτεινόμενη ανάλυση και προσαρμόστε τη συνέχεια τις χρονιές, τις σειρές και το γράφημα. Κάθε θέμα χρησιμοποιεί ήδη δημοσιευμένες τιμές με εμφανείς πηγές και περιορισμούς.</p>
      </div>
      <div className={styles.total}><strong>{RESEARCH_PRESET_COUNT}</strong><span>έτοιμες αναλύσεις</span></div>
    </div>

    <div className={styles.categories}>
      {RESEARCH_PRESET_CATEGORIES.map(category =>
        <details key={category.id} className={styles.category} open={category.id === activeCategory}>
          <summary className={styles.categorySummary}>
            <span className={styles.categoryTitle}>{category.title} <small>{category.presets.length} θέματα</small></span>
            <span className={styles.expander} aria-hidden="true">+</span>
          </summary>
          <p className={styles.categoryIntro}>{category.introduction}</p>
          <div className={styles.grid}>
            {category.presets.map(preset => {
              const group = preset.indicator ? externalGroup(preset.indicator) : undefined;
              const active = Boolean(preset.indicator && preset.indicator === activeIndicator);
              const status = group ? statusLabels[group.comparison] : "Διερεύνηση σχέσεων";
              const href = preset.indicator
                ? "/research/compare?indicator=" + encodeURIComponent(preset.indicator) + "#research-workbench-title"
                : "/research/compare#income-spending-relations";
              return <Link
                key={preset.id}
                href={href}
                className={[styles.preset, active ? styles.selected : ""].filter(Boolean).join(" ")}
                aria-current={active ? "page" : undefined}
              >
                <div className={styles.presetTop}>
                  <span className={styles.period}>{preset.period}</span>
                  <span className={styles.status}>{status}</span>
                </div>
                <strong>{preset.title}</strong>
                <p>{preset.description}</p>
                <span className={styles.open}>Προβολή ανάλυσης <span aria-hidden="true">↗</span></span>
              </Link>;
            })}
          </div>
        </details>
      )}
    </div>
    <p className={styles.disclaimer}>Οι παράλληλες μετρήσεις δεν αποτελούν αυτομάτως απόδειξη αιτιότητας ή στατιστικά ισοδύναμες εκτιμήσεις. Κάθε γράφημα εξηγεί τη μέθοδο και παραπέμπει στην αρχική δημοσίευση.</p>
  </section>;
}
