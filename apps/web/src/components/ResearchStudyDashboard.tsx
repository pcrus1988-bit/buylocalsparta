import Link from "next/link";
import type { PublicResearchStudySummary } from "../lib/research-observatory-runtime";
import { ResearchLiveProgress } from "./ResearchLiveProgress";
import styles from "./ResearchObservatory.module.css";

function dateRange(study: PublicResearchStudySummary): string {
  if (!study.fieldworkStartsAt && !study.fieldworkEndsAt) return "Δεν έχει οριστεί";
  const format = (value?: string) => value
    ? new Date(value).toLocaleDateString("el-GR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
  return format(study.fieldworkStartsAt) + " → " + format(study.fieldworkEndsAt);
}

function statusLabel(status: string): string {
  return ({
    draft: "Σχεδιασμός",
    pilot: "Πιλοτική φάση",
    fielding: "Σε εξέλιξη",
    closed: "Η συλλογή έκλεισε",
    analysis: "Ανάλυση",
    published: "Δημοσιευμένη",
    archived: "Αρχείο"
  } as Record<string, string>)[status] ?? status;
}

function percent(value: number): string {
  return new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function nextStep(status: string): { title: string; body: string } {
  if (status === "draft") return {
    title: "Κλείδωμα instrument και sample design",
    body: "Η μελέτη βρίσκεται ακόμη στη φάση σχεδιασμού. Το public layer θα αρχίσει να εμφανίζει fieldwork aggregates όταν ενεργοποιηθεί η pilot ή η κύρια συλλογή."
  };
  if (status === "pilot") return {
    title: "Έλεγχος pilot πριν το κύριο fieldwork",
    body: "Η πιλοτική φάση χρησιμοποιείται για validation του questionnaire, των flows και των operational rules πριν κλειδώσει η κύρια wave."
  };
  if (status === "fielding") return {
    title: "Ολοκλήρωση fieldwork χωρίς πρόωρα ευρήματα",
    body: "Εμφανίζονται μόνο λειτουργικά aggregates. Οι κατανομές απαντήσεων παραμένουν κλειδωμένες ώστε η δημόσια σελίδα να μην επηρεάζει μεταγενέστερους συμμετέχοντες."
  };
  if (status === "closed" || status === "analysis") return {
    title: "QA, weighting, analysis και release approval",
    body: "Μετά το κλείσιμο της συλλογής, η μελέτη περνά από quality controls και governed analysis. Τα αποτελέσματα γίνονται δημόσια μόνο μέσα από εγκεκριμένο immutable release."
  };
  return {
    title: "Το evidence release είναι δημόσιο",
    body: "Τα δημοσιευμένα αποτελέσματα συνοδεύονται από uncertainty, analytical base, methodology snapshot και provenance ώστε κάθε αριθμός να μπορεί να ελεγχθεί."
  };
}

export function ResearchStudyDashboard({ study }: { study: PublicResearchStudySummary }) {
  const isLive = study.status === "fielding" || study.status === "pilot";
  const isPublished = study.status === "published" && Boolean(study.releasePublishedAt);
  const completion = study.targetCompletes > 0 ? Math.min(Math.max(study.completionRate, 0), 1) : 0;
  const upcoming = nextStep(study.status);

  return <main className={styles.shell}>
    <div className={styles.frame}>
      <div className={styles.topbar}>
        <Link className={styles.brand} href="/research">KONTA MOY · RETAIL OBSERVATORY</Link>
        <nav className={styles.nav} aria-label="Research">
          <Link href="/research">Μελέτες</Link>
          <Link href={"/research/" + study.waveSlug + "/methodology"}>Μεθοδολογία</Link>
          <Link href={"/research/" + study.waveSlug + "/results"}>Αποτελέσματα</Link>
          <Link href="/research/compare">Σύγκριση</Link>
        </nav>
      </div>

      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>{study.programmeTitle} · {study.waveTitle}</div>
          <h1>{study.title}</h1>
          <p>{study.subtitle || study.methodologySummary}</p>

          <div className={styles.heroBadges}>
            <span className={[styles.badge, isLive ? styles.badgeLive : isPublished ? styles.badgeDark : styles.badgeWarm].join(" ")}>
              {isLive && <span className={styles.dot} aria-hidden="true" />}
              {statusLabel(study.status)}
            </span>
            <span className={styles.badge}>{study.studyCode}</span>
            <span className={styles.badge}>Wave {study.waveOrdinal}</span>
          </div>

          <div className={styles.tabbar}>
            <Link href={"/research/" + study.waveSlug}>Επισκόπηση</Link>
            <Link href={"/research/" + study.waveSlug + "/methodology"}>Μεθοδολογία</Link>
            <Link className={isPublished ? styles.primaryButton : ""} href={"/research/" + study.waveSlug + "/results"}>
              {isPublished ? "Δημοσιευμένα αποτελέσματα" : "Αποτελέσματα μετά το release"}
            </Link>
            <Link href="/research/compare">Σύγκριση waves</Link>
          </div>
        </div>

        <aside className={styles.heroAside}>
          <span>Κατάσταση</span>
          <strong>{statusLabel(study.status)}</strong>
          <hr />
          <span>Fieldwork</span>
          <strong style={{ fontSize: 22 }}>{dateRange(study)}</strong>
          <hr />
          <span>Ολοκλήρωση στόχου</span>
          <strong>{study.targetCompletes > 0 ? percent(completion) : "—"}</strong>
          {study.releaseVersion && <span>Release {study.releaseVersion}</span>}
        </aside>
      </header>

      <section className={styles.section}>
        <ResearchLiveProgress initialStudy={study} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Τι συμβαίνει στη συνέχεια</div>
            <h2>{upcoming.title}</h2>
          </div>
          <p>{upcoming.body}</p>
        </div>

        <div className={styles.split}>
          <article className={styles.panel}>
            <div className={styles.eyebrow}>Study brief</div>
            <h3>Τι μετράμε</h3>
            <p>{study.methodologySummary}</p>
            <p><strong>Πληθυσμός:</strong> {study.populationDefinition}</p>
            <Link className={styles.cardLink} href={"/research/" + study.waveSlug + "/methodology"}>Δείτε πώς σχεδιάστηκε η μελέτη →</Link>
          </article>

          <article className={styles.panel}>
            <div className={styles.eyebrow}>Public release</div>
            <h3>{isPublished ? "Τα αποτελέσματα είναι evidence object." : "Τα αποτελέσματα παραμένουν κλειδωμένα."}</h3>
            <p>{isPublished
              ? "Το δημόσιο release είναι δεμένο με dataset hash, methodology snapshot και analysis run. Η ιστορική εικόνα δεν αλλάζει σιωπηλά μετά τη δημοσίευση."
              : "Η σελίδα αποτελεσμάτων ενεργοποιείται από governed release και όχι από live queries πάνω στις απαντήσεις. Έτσι αποφεύγονται πρόωρα συμπεράσματα και drift."}</p>
            <Link className={styles.cardLink} href={"/research/" + study.waveSlug + "/results"}>
              {isPublished ? "Άνοιγμα evidence dashboard →" : "Δείτε τη διαδικασία publication →"}
            </Link>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Trust layer</div>
            <h2>Η ποιότητα της έρευνας είναι μέρος του UI.</h2>
          </div>
          <p>Το Observatory δεν κρύβει τη μεθοδολογία σε υποσημειώσεις. Τα βασικά στοιχεία αξιολόγησης παραμένουν ορατά δίπλα στην πρόοδο και στα αποτελέσματα.</p>
        </div>

        <div className={styles.trustGrid}>
          <article className={styles.trustCard}>
            <div className={styles.eyebrow}>01 · Privacy</div>
            <strong>Χωρίς live απαντήσεις</strong>
            <p>Κατά το fieldwork δημοσιεύονται μόνο operational aggregates. Δεν εμφανίζονται distributions ή ευρήματα που θα μπορούσαν να δημιουργήσουν feedback effects.</p>
          </article>
          <article className={styles.trustCard}>
            <div className={styles.eyebrow}>02 · Method</div>
            <strong>Programme → Study → Wave</strong>
            <p>Population, sample, wave identity και methodology παραμένουν προσβάσιμα ώστε ο χρήστης να ξέρει ποιο ακριβώς research object βλέπει.</p>
          </article>
          <article className={styles.trustCard}>
            <div className={styles.eyebrow}>03 · Evidence</div>
            <strong>Immutable release</strong>
            <p>Μετά τη δημοσίευση, provenance και analytical evidence συνοδεύουν τα αποτελέσματα και τις longitudinal comparisons.</p>
          </article>
        </div>

        <div className={styles.sectionActions}>
          <Link className={[styles.actionButton, styles.primaryButton].join(" ")} href="/research/compare">Σύγκριση & αξιολόγηση</Link>
          <Link className={styles.actionButton} href="/research/privacy">Πώς προστατεύονται τα δεδομένα</Link>
        </div>
      </section>

      {isLive && <div className={styles.notice}>
        <strong>Live ≠ preliminary results.</strong> Η ζωντανή πρόοδος αφορά μόνο τη λειτουργία της μελέτης. Τα ουσιαστικά findings παραμένουν κλειδωμένα έως το governed public release.
      </div>}

      <div className={styles.footer}>Public research surface · privacy-safe aggregates · governed evidence releases</div>
    </div>
  </main>;
}
