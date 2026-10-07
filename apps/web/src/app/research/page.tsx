import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import styles from "../../components/ResearchObservatory.module.css";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { publicResearchObservatory, type PublicResearchStudySummary } from "../../lib/research-observatory-runtime";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research", {
    title: "Παρατηρητήριο Ελληνικού Λιανεμπορίου · KONTA MOY Research",
    description: "Ζωντανή πρόοδος μελετών, δημοσιευμένα αποτελέσματα, συγκρίσεις και μεθοδολογία του KONTA MOY Retail Observatory.",
    keywords: ["Παρατηρητήριο Ελληνικού Λιανεμπορίου", "έρευνα ελληνικού λιανεμπορίου", "Retail Observatory Greece", "στοιχεία λιανεμπορίου Ελλάδα", "μελέτες εμπορικών επιχειρήσεων", "ψηφιακή ωριμότητα λιανεμπορίου"]
  });
}

function statusLabel(status: string): string {
  return ({
    draft: "Σχεδιασμός",
    pilot: "Πιλοτική",
    fielding: "Live",
    closed: "Κλειστή",
    analysis: "Ανάλυση",
    published: "Δημοσιευμένη",
    archived: "Αρχείο"
  } as Record<string, string>)[status] ?? status;
}

function date(value?: string): string {
  return value ? new Date(value).toLocaleDateString("el-GR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

function studyCard(study: PublicResearchStudySummary) {
  const isLive = study.status === "fielding" || study.status === "pilot";
  return <article className={styles.studyCard} key={study.waveId}>
    <div className={styles.cardTop}>
      <span className={[styles.status, isLive ? styles.statusLive : ""].filter(Boolean).join(" ")}>
        {isLive && <span className={styles.dot} aria-hidden="true" />}
        {statusLabel(study.status)}
      </span>
      <span className={styles.eyebrow}>{study.waveCode}</span>
    </div>
    <h3>{study.title}</h3>
    <p>{study.subtitle || study.methodologySummary}</p>
    <div className={styles.cardMeta}>
      <div><span>Ολοκληρώσεις</span><strong>{study.completed.toLocaleString("el-GR")}{study.targetCompletes > 0 ? " / " + study.targetCompletes.toLocaleString("el-GR") : ""}</strong></div>
      <div><span>Fieldwork έως</span><strong>{date(study.fieldworkEndsAt)}</strong></div>
    </div>
    <Link className={styles.cardLink} href={"/research/" + study.slug}>Άνοιγμα μελέτης →</Link>
  </article>;
}

export default async function ResearchObservatoryPage() {
  const snapshot = await publicResearchObservatory();
  const active = snapshot.studies.filter((study) => ["draft","pilot","fielding","closed","analysis"].includes(study.status));
  const published = snapshot.studies.filter((study) => study.status === "published");

  return <main className={styles.shell}>
    <div className={styles.frame}>
      <div className={styles.topbar}>
        <Link className={styles.brand} href="/research">KONTA MOY · RETAIL OBSERVATORY</Link>
        <nav className={styles.nav} aria-label="Research">
          <Link href="#studies">Μελέτες</Link>
          <Link href="/research/compare">Σύγκριση & αξιολόγηση</Link>
          <Link href="/research/privacy">Ιδιωτικότητα</Link>
        </nav>
      </div>

      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Παρατηρητήριο Ελληνικού Λιανεμπορίου</div>
          <h1>Έρευνα που φαίνεται όσο εξελίσσεται — και ελέγχεται όταν δημοσιεύεται.</h1>
          <p>Το public layer του KONTA MOY Research δείχνει ζωντανή πρόοδο fieldwork χωρίς πρόωρη αποκάλυψη απαντήσεων. Μετά το κλείσιμο, η ίδια μελέτη μετατρέπεται σε dashboard δημοσιευμένων αποτελεσμάτων, με methodology, uncertainty, provenance και συγκρίσεις μεταξύ waves.</p>
        </div>
        <aside className={styles.heroAside}>
          <span>Ενεργές / υπό ανάλυση</span>
          <strong>{active.length}</strong>
          <span>Δημοσιευμένες</span>
          <strong>{published.length}</strong>
          <span>Snapshot: {new Date(snapshot.generatedAt).toLocaleString("el-GR")}</span>
        </aside>
      </header>

      <section className={styles.section} id="studies">
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Current research</div>
            <h2>Μελέτες σε εξέλιξη</h2>
          </div>
          <p>Η πρόοδος προβάλλεται από governed aggregates. Κατά τη διάρκεια fieldwork δεν δημοσιεύονται ουσιαστικές κατανομές απαντήσεων που θα μπορούσαν να επηρεάσουν μεταγενέστερους συμμετέχοντες.</p>
        </div>
        {active.length > 0
          ? <div className={styles.grid}>{active.map(studyCard)}</div>
          : <div className={styles.empty}>
              Δεν υπάρχει αυτή τη στιγμή ενεργή δημόσια μελέτη. Το Ελληνικό Λιανεμπόριο 2026 παραμένει διαθέσιμο ως η πρώτη wave του Observatory.
              <br /><Link className={styles.cardLink} href="/research/greek-retail-2026">Άνοιγμα Ελληνικό Λιανεμπόριο 2026 →</Link>
            </div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Published evidence</div>
            <h2>Δημοσιευμένα releases</h2>
          </div>
          <p>Κάθε release παραμένει δεμένο με το dataset hash, το analysis run και το methodology snapshot που το παρήγαγε.</p>
        </div>
        {published.length > 0
          ? <div className={styles.grid}>{published.map(studyCard)}</div>
          : <div className={styles.empty}>Δεν έχει δημοσιευθεί ακόμη public release. Η ενότητα ενεργοποιείται αυτόματα όταν ολοκληρωθεί η governed διαδικασία release.</div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Explore</div>
            <h2>Σύγκριση, αξιολόγηση, αναπαραγωγιμότητα.</h2>
          </div>
          <p>Το Observatory δεν αντιμετωπίζει δύο ποσοστά ως συγκρίσιμα μόνο επειδή έχουν παρόμοιο τίτλο. Οι longitudinal comparisons βασίζονται σε variable lineage και κλειδωμένα harmonisation rules.</p>
        </div>
        <div className={styles.split}>
          <article className={styles.panel}>
            <h3>Compare studies & waves</h3>
            <p>Δείτε common governed metrics μεταξύ δημοσιευμένων waves και την επίσημη κατάσταση comparability: exact, harmonised ή break.</p>
            <Link className={styles.cardLink} href="/research/compare">Άνοιγμα σύγκρισης →</Link>
          </article>
          <article className={styles.panel}>
            <h3>Evaluate the evidence</h3>
            <p>Sample completion, response rate, analytical base, uncertainty, weighting diagnostics και release provenance παρουσιάζονται ως μέρος της έρευνας — όχι ως κρυφό τεχνικό παράρτημα.</p>
            <Link className={styles.cardLink} href="/research/greek-retail-2026/methodology">Παράδειγμα μεθοδολογίας →</Link>
          </article>
        </div>
      </section>

      {!snapshot.databaseConfigured && <div className={styles.notice}>
        Η public Research βάση δεν είναι ακόμη ενεργή στο τρέχον deployment. Το UX είναι έτοιμο να ενεργοποιηθεί μόλις το production schema φτάσει στο Research schema head.
      </div>}

      <div className={styles.footer}>KONTA MOY Research · Programme → Study → Wave → governed release</div>
    </div>
    <SiteFooter />
  </main>;
}
