import Link from "next/link";
import { SiteFooter } from "./SiteFooter";
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

export function ResearchStudyDashboard({ study }: { study: PublicResearchStudySummary }) {
  const isLive = study.status === "fielding" || study.status === "pilot";
  const isPublished = study.status === "published" && Boolean(study.releasePublishedAt);

  return <main className={styles.shell}>
    <div className={styles.frame}>
      <div className={styles.topbar}>
        <Link className={styles.brand} href="/research">KONTA MOY · RETAIL OBSERVATORY</Link>
        <nav className={styles.nav} aria-label="Research">
          <Link href="/research">Μελέτες</Link>
          <Link href={"/research/" + study.slug + "/methodology"}>Μεθοδολογία</Link>
          <Link href={"/research/" + study.slug + "/results"}>Αποτελέσματα</Link>
          <Link href="/research/compare">Σύγκριση & αξιολόγηση</Link>
        </nav>
      </div>

      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>{study.programmeTitle} · {study.waveTitle}</div>
          <h1>{study.title}</h1>
          <p>{study.subtitle || study.methodologySummary}</p>
          <div className={styles.tabbar}>
            <Link href={"/research/" + study.slug}>Επισκόπηση</Link>
            <Link href={"/research/" + study.slug + "/methodology"}>Μεθοδολογία</Link>
            <Link href={"/research/" + study.slug + "/results"}>{isPublished ? "Δημοσιευμένα αποτελέσματα" : "Αποτελέσματα μετά το κλείσιμο"}</Link>
            <Link href="/research/compare">Σύγκριση</Link>
          </div>
        </div>
        <aside className={styles.heroAside}>
          <span>Κατάσταση</span>
          <strong>{statusLabel(study.status)}</strong>
          <span>Fieldwork: {dateRange(study)}</span>
          {study.releaseVersion && <span>Release: {study.releaseVersion}</span>}
        </aside>
      </header>

      <section className={styles.section}>
        <ResearchLiveProgress initialStudy={study} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Τι βλέπετε τώρα</div>
            <h2>Πρόοδος χωρίς να επηρεάζονται οι απαντήσεις.</h2>
          </div>
          <p>Κατά τη διάρκεια της συλλογής δημοσιεύουμε μόνο λειτουργικά, συγκεντρωτικά στοιχεία προόδου. Τα ουσιαστικά ευρήματα παραμένουν κλειδωμένα έως το τέλος της fieldwork και την ολοκλήρωση QA, weighting και analysis.</p>
        </div>
        <div className={styles.split}>
          <article className={styles.panel}>
            <div className={styles.eyebrow}>Μελέτη</div>
            <h3>Τι μετράμε</h3>
            <p>{study.methodologySummary}</p>
            <p><strong>Πληθυσμός:</strong> {study.populationDefinition}</p>
            <Link className={styles.cardLink} href={"/research/" + study.slug + "/methodology"}>Πλήρης μεθοδολογία →</Link>
          </article>
          <article className={styles.panel}>
            <div className={styles.eyebrow}>Δημοσίευση</div>
            <h3>{isPublished ? "Το release είναι διαθέσιμο." : "Τα αποτελέσματα δεν προδημοσιεύονται."}</h3>
            <p>{isPublished
              ? "Το δημόσιο release είναι δεμένο με dataset hash, methodology snapshot και analysis run. Μπορεί να συγκριθεί μόνο με waves που έχουν τεκμηριωμένη lineage."
              : "Μετά το κλείσιμο ακολουθούν έλεγχος ποιότητας, weighting, ανάλυση και release approval. Η ίδια σελίδα μετατρέπεται τότε σε dashboard αποτελεσμάτων."}</p>
            <Link className={styles.cardLink} href={"/research/" + study.slug + "/results"}>
              {isPublished ? "Άνοιγμα αποτελεσμάτων →" : "Σελίδα αποτελεσμάτων →"}
            </Link>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Αξιολόγηση & σύγκριση</div>
            <h2>Κάθε αριθμός πρέπει να μπορεί να εξηγηθεί.</h2>
          </div>
          <p>Οι συγκρίσεις δεν γίνονται απλώς επειδή δύο studies έχουν παρόμοια ερώτηση. Το Observatory χρησιμοποιεί variable lineage και harmonisation rules για να χαρακτηρίζει μια σύγκριση ως exact, harmonised ή break.</p>
        </div>
        <div className={styles.split}>
          <article className={styles.panel}>
            <h3>Evaluation</h3>
            <ul>
              <li>στόχος δείγματος και πραγματική κάλυψη</li>
              <li>response rate και fieldwork completeness</li>
              <li>QA / exclusions και analytical base</li>
              <li>weighting diagnostics και uncertainty</li>
              <li>release provenance και reproducibility</li>
            </ul>
          </article>
          <article className={styles.panel}>
            <h3>Compare</h3>
            <p>Μόλις υπάρχουν δύο δημοσιευμένες waves, τα κοινά governed metrics εμφανίζονται δίπλα-δίπλα και οι επίσημες longitudinal specs δηλώνουν αν η σύγκριση είναι άμεση ή απαιτεί harmonisation.</p>
            <Link className={styles.cardLink} href="/research/compare">Άνοιγμα σύγκρισης & αξιολόγησης →</Link>
          </article>
        </div>
      </section>

      {isLive && <div className={styles.notice}>
        Η ζωντανή πρόοδος δεν περιλαμβάνει κατανομές απαντήσεων ή πρόωρα συμπεράσματα. Αυτό προστατεύει τη μελέτη από feedback effects κατά τη διάρκεια της συλλογής.
      </div>}

      <div className={styles.footer}>Public research surface · privacy-safe aggregates · governed releases</div>
    </div>
    <SiteFooter />
  </main>;
}
