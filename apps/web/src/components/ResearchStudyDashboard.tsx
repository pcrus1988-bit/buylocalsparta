import { ResearchPublicNavigation } from "./ResearchPublicNavigation";
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
    closed: "Η συλλογή ολοκληρώθηκε",
    analysis: "Ανάλυση",
    published: "Δημοσιευμένη",
    archived: "Αρχείο"
  } as Record<string, string>)[status] ?? "Ενημέρωση σε εξέλιξη";
}

function percent(value: number): string {
  return new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function nextStep(status: string): { title: string; body: string } {
  if (status === "draft") return {
    title: "Προετοιμασία ερωτηματολογίου και δείγματος",
    body: "Η μελέτη βρίσκεται στη φάση σχεδιασμού. Όταν ξεκινήσει η συλλογή, η σελίδα θα εμφανίζει την πρόοδο της συμμετοχής."
  };
  if (status === "pilot") return {
    title: "Πιλοτικός έλεγχος",
    body: "Μια μικρή πιλοτική δοκιμή βοηθά να ελεγχθεί το ερωτηματολόγιο πριν ξεκινήσει η κύρια συλλογή απαντήσεων."
  };
  if (status === "fielding") return {
    title: "Συλλογή απαντήσεων",
    body: "Όσο η μελέτη βρίσκεται σε εξέλιξη εμφανίζονται μόνο στοιχεία προόδου. Τα ευρήματα παραμένουν κλειστά μέχρι να ολοκληρωθεί η ανάλυση."
  };
  if (status === "closed" || status === "analysis") return {
    title: "Έλεγχος και ανάλυση",
    body: "Μετά το τέλος της συλλογής ελέγχουμε την ποιότητα των δεδομένων και υπολογίζουμε τα τελικά αποτελέσματα."
  };
  return {
    title: "Τα αποτελέσματα έχουν δημοσιευθεί",
    body: "Μπορείτε να δείτε τα βασικά ευρήματα, το μέγεθος του δείγματος, τα διαστήματα εμπιστοσύνης όπου υπάρχουν και τη μεθοδολογία της μελέτης."
  };
}

export function ResearchStudyDashboard({ study }: { study: PublicResearchStudySummary }) {
  const isLive = study.status === "fielding" || study.status === "pilot";
  const isPublished = study.status === "published" && Boolean(study.releasePublishedAt);
  const completion = study.targetCompletes > 0 ? Math.min(Math.max(study.completionRate, 0), 1) : 0;
  const upcoming = nextStep(study.status);

  return <main className={styles.shell}>
    <div className={styles.frame}>
      <ResearchPublicNavigation active="overview" studySlug={study.waveSlug} />

      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>{study.programmeTitle}</div>
          <h1>{study.title}</h1>
          <p>{study.subtitle || study.methodologySummary}</p>

          <div className={styles.heroBadges}>
            <span className={[styles.badge, isLive ? styles.badgeLive : isPublished ? styles.badgeDark : styles.badgeWarm].join(" ")}>
              {isLive && <span className={styles.dot} aria-hidden="true" />}
              {statusLabel(study.status)}
            </span>
            <span className={styles.badge}>Μεθοδολογία διαθέσιμη</span>
          </div>

          <div className={styles.tabbar}>
            <Link href={"/research/" + study.waveSlug}>Επισκόπηση</Link>
            <Link href={"/research/" + study.waveSlug + "/methodology"}>Μεθοδολογία</Link>
            <Link className={isPublished ? styles.primaryButton : ""} href={"/research/" + study.waveSlug + "/results"}>
              {isPublished ? "Δημοσιευμένα αποτελέσματα" : "Αποτελέσματα μετά την ολοκλήρωση"}
            </Link>
            <Link href="/research/compare">Σύγκριση μελετών</Link>
            <Link href="/research/market-sentiment">Έρευνες άλλων φορέων</Link>
          </div>
        </div>

        <aside className={styles.heroAside}>
          <span>Κατάσταση</span>
          <strong>{statusLabel(study.status)}</strong>
          <hr />
          <span>Περίοδος συλλογής</span>
          <strong style={{ fontSize: 22 }}>{dateRange(study)}</strong>
          <hr />
          <span>Ολοκλήρωση στόχου</span>
          <strong>{study.targetCompletes > 0 ? percent(completion) : "—"}</strong>
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
            <div className={styles.eyebrow}>Σχετικά με τη μελέτη</div>
            <h3>Τι μετράμε</h3>
            <p>{study.methodologySummary}</p>
            <p><strong>Πληθυσμός:</strong> {study.populationDefinition}</p>
            <Link className={styles.cardLink} href={"/research/" + study.waveSlug + "/methodology"}>Δείτε τη μεθοδολογία →</Link>
          </article>

          <article className={styles.panel}>
            <div className={styles.eyebrow}>Αποτελέσματα</div>
            <h3>{isPublished ? "Τα αποτελέσματα είναι διαθέσιμα." : "Τα αποτελέσματα δεν έχουν δημοσιευθεί ακόμη."}</h3>
            <p>{isPublished
              ? "Η σελίδα αποτελεσμάτων παρουσιάζει τα δημοσιευμένα ευρήματα μαζί με το μέγεθος του δείγματος και την αβεβαιότητα όπου αυτή μπορεί να υπολογιστεί."
              : "Η δημοσίευση γίνεται μόνο αφού ολοκληρωθούν η συλλογή, οι έλεγχοι ποιότητας και η ανάλυση."}</p>
            <Link className={styles.cardLink} href={"/research/" + study.waveSlug + "/results"}>
              {isPublished ? "Άνοιγμα αποτελεσμάτων →" : "Δείτε πότε θα εμφανιστούν →"}
            </Link>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Διαφάνεια</div>
            <h2>Τι χρειάζεται να γνωρίζει ο αναγνώστης.</h2>
          </div>
          <p>Η μεθοδολογία, το δείγμα και οι βασικοί περιορισμοί της μελέτης παραμένουν εύκολα προσβάσιμα δίπλα στα αποτελέσματα.</p>
        </div>

        <div className={styles.trustGrid}>
          <article className={styles.trustCard}>
            <div className={styles.eyebrow}>01 · Ιδιωτικότητα</div>
            <strong>Χωρίς πρόωρα ευρήματα</strong>
            <p>Όσο η συλλογή συνεχίζεται, η δημόσια σελίδα δείχνει μόνο την πρόοδο και όχι τις απαντήσεις ή τα προσωρινά αποτελέσματα.</p>
          </article>
          <article className={styles.trustCard}>
            <div className={styles.eyebrow}>02 · Μεθοδολογία</div>
            <strong>Σκοπός, πληθυσμός και δείγμα</strong>
            <p>Ο αναγνώστης μπορεί να δει ποιον αφορά η μελέτη, πώς οργανώθηκε και πόσες απαντήσεις συγκεντρώθηκαν.</p>
          </article>
          <article className={styles.trustCard}>
            <div className={styles.eyebrow}>03 · Αποτελέσματα</div>
            <strong>Με το απαραίτητο πλαίσιο</strong>
            <p>Όπου είναι διαθέσιμα, τα αποτελέσματα συνοδεύονται από μέγεθος δείγματος, διαστήματα εμπιστοσύνης και σαφείς περιορισμούς.</p>
          </article>
        </div>

        <div className={styles.sectionActions}>
          <Link className={[styles.actionButton, styles.primaryButton].join(" ")} href="/research/compare">Σύγκριση μελετών</Link>
          <Link className={styles.actionButton} href="/research/privacy">Πώς προστατεύονται τα δεδομένα</Link>
        </div>
      </section>

      {isLive && <div className={styles.notice}>
        Η ζωντανή πρόοδος δείχνει μόνο πώς προχωρά η συλλογή. Δεν αποτελεί προσωρινό αποτέλεσμα της μελέτης.
      </div>}

      <div className={styles.footer}>KONTA MOY Research · Μεθοδολογία · Πρόοδος · Αποτελέσματα</div>
    </div>
  </main>;
}
