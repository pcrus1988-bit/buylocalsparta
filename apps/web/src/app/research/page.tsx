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

function percent(value: number): string {
  return new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function StudyCard({ study, featured = false }: { study: PublicResearchStudySummary; featured?: boolean }) {
  const isLive = study.status === "fielding" || study.status === "pilot";
  const progress = study.targetCompletes > 0 ? Math.min(Math.max(study.completionRate, 0), 1) : 0;

  return <article className={[
    styles.studyCard,
    isLive ? styles.studyCardLive : "",
    featured ? styles.featuredCard : ""
  ].filter(Boolean).join(" ")}>
    <div className={styles.cardTop}>
      <span className={[styles.status, isLive ? styles.statusLive : ""].filter(Boolean).join(" ")}>
        {isLive && <span className={styles.dot} aria-hidden="true" />}
        {statusLabel(study.status)}
      </span>
      <span className={styles.eyebrow}>{study.waveCode}</span>
    </div>

    <h3>{study.title}</h3>
    <p>{study.subtitle || study.methodologySummary}</p>

    {study.targetCompletes > 0 && <>
      <div className={styles.cardProgress} aria-label={"Πρόοδος " + percent(progress)}>
        <div className={styles.cardProgressFill} style={{ width: (progress * 100).toFixed(1) + "%" }} />
      </div>
      <div className={styles.progressCaption}>
        <span>{study.completed.toLocaleString("el-GR")} ολοκληρώσεις</span>
        <span>{percent(progress)} του στόχου</span>
      </div>
    </>}

    <div className={styles.cardMeta}>
      <div><span>Population</span><strong>{study.populationDefinition}</strong></div>
      <div><span>{study.status === "published" ? "Published" : "Fieldwork έως"}</span><strong>{study.status === "published" ? date(study.releasePublishedAt) : date(study.fieldworkEndsAt)}</strong></div>
    </div>

    <div className={styles.cardFoot}>
      <span className={styles.eyebrow}>{study.programmeTitle}</span>
      <Link className={styles.cardLink} href={"/research/" + study.waveSlug}>Άνοιγμα μελέτης →</Link>
    </div>
  </article>;
}

export default async function ResearchObservatoryPage() {
  const snapshot = await publicResearchObservatory();
  const active = snapshot.studies.filter((study) => ["draft","pilot","fielding","closed","analysis"].includes(study.status));
  const published = snapshot.studies.filter((study) => study.status === "published");
  const live = active.filter((study) => study.status === "fielding" || study.status === "pilot");
  const lead = live[0] ?? active[0];
  const remainingActive = lead ? active.filter((study) => study.waveId !== lead.waveId) : active;

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
          <h1>Από τη συλλογή δεδομένων μέχρι το evidence release.</h1>
          <p>Ένα δημόσιο research layer που δείχνει την πραγματική πρόοδο της μελέτης όσο εξελίσσεται — και μετά το κλείσιμο μετατρέπεται σε ελεγχόμενο dashboard αποτελεσμάτων, με uncertainty, methodology, provenance και συγκρίσεις μεταξύ waves.</p>

          <div className={styles.heroBadges}>
            {live.length > 0 && <span className={[styles.badge, styles.badgeLive].join(" ")}><span className={styles.dot} aria-hidden="true" /> {live.length} live {live.length === 1 ? "study" : "studies"}</span>}
            <span className={styles.badge}>Governed releases</span>
            <span className={styles.badge}>Public methodology</span>
          </div>

          <div className={styles.sectionActions}>
            {lead && <Link className={[styles.actionButton, styles.primaryButton].join(" ")} href={"/research/" + lead.waveSlug}>Δείτε τη live μελέτη</Link>}
            <Link className={styles.actionButton} href="/research/compare">Explore comparisons</Link>
          </div>
        </div>

        <aside className={styles.heroAside}>
          <span>Ενεργές / υπό ανάλυση</span>
          <strong>{active.length}</strong>
          <hr />
          <span>Δημοσιευμένες waves</span>
          <strong>{published.length}</strong>
          <hr />
          <span>Σύνολο public waves</span>
          <strong>{snapshot.studies.length}</strong>
          <span>Snapshot {new Date(snapshot.generatedAt).toLocaleString("el-GR")}</span>
        </aside>
      </header>

      <section className={styles.section}>
        <div className={styles.quickGrid}>
          <a className={styles.quickLink} href="#studies">
            <span className={styles.eyebrow}>01 · Live</span>
            <strong>Παρακολούθηση fieldwork</strong>
            <span>Δείτε sample, invitations, starts, completions και lifecycle χωρίς πρόωρη αποκάλυψη findings.</span>
          </a>
          <Link className={styles.quickLink} href="/research/compare">
            <span className={styles.eyebrow}>02 · Compare</span>
            <strong>Σύγκριση waves</strong>
            <span>Exact, harmonised ή methodological break — με κανόνες comparability που φαίνονται δημόσια.</span>
          </Link>
          <Link className={styles.quickLink} href="/research/greek-retail-2026/methodology">
            <span className={styles.eyebrow}>03 · Method</span>
            <strong>Έλεγχος μεθοδολογίας</strong>
            <span>Population, fieldwork, analysis και reproducibility παρουσιάζονται ως μέρος του αποτελέσματος.</span>
          </Link>
          <Link className={styles.quickLink} href="/research/privacy">
            <span className={styles.eyebrow}>04 · Trust</span>
            <strong>Privacy by design</strong>
            <span>Πρόσκληση, συμμετοχή, preferences και analytical evidence παραμένουν διακριτά research layers.</span>
          </Link>
        </div>
      </section>

      <section className={styles.section} id="studies">
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Current research</div>
            <h2>Μελέτες σε εξέλιξη</h2>
          </div>
          <p>Η πρόοδος προβάλλεται από governed operational aggregates. Κατά τη διάρκεια fieldwork δεν δημοσιεύονται distributions απαντήσεων που θα μπορούσαν να επηρεάσουν τη συμπεριφορά των συμμετεχόντων.</p>
        </div>

        {active.length > 0
          ? <div className={styles.grid}>
              {lead && <StudyCard study={lead} featured />}
              {remainingActive.map((study) => <StudyCard study={study} key={study.waveId} />)}
            </div>
          : <div className={styles.empty}>
              Δεν υπάρχει αυτή τη στιγμή ενεργή δημόσια μελέτη.
              <br /><Link className={styles.cardLink} href="/research/greek-retail-2026">Άνοιγμα Ελληνικό Λιανεμπόριο 2026 →</Link>
            </div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Published evidence</div>
            <h2>Δημοσιευμένα releases</h2>
          </div>
          <p>Κάθε public release παραμένει δεμένο με το dataset hash, το analysis run και το methodology snapshot που το παρήγαγε. Δεν είναι ένα δυναμικό page load που αλλάζει αθόρυβα.</p>
        </div>
        {published.length > 0
          ? <div className={styles.grid}>{published.map((study) => <StudyCard study={study} key={study.waveId} />)}</div>
          : <div className={styles.empty}>Δεν έχει δημοσιευθεί ακόμη public release. Η ενότητα ενεργοποιείται αυτόματα όταν ολοκληρωθεί η governed διαδικασία release.</div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Research lifecycle</div>
            <h2>Μία συνέχεια από το design μέχρι τη δημοσίευση.</h2>
          </div>
          <p>Το UX ακολουθεί τον ίδιο κύκλο ζωής με το research object, ώστε ο χρήστης να καταλαβαίνει πού βρίσκεται μια μελέτη και τι επιτρέπεται να δει σε κάθε φάση.</p>
        </div>
        <div className={styles.process}>
          <article className={styles.processStep}><span>01</span><strong>Design</strong><p>Instrument, population, sample design και governance.</p></article>
          <article className={styles.processStep}><span>02</span><strong>Pilot</strong><p>Validation πριν κλειδώσει η κύρια fieldwork wave.</p></article>
          <article className={styles.processStep}><span>03</span><strong>Fieldwork</strong><p>Live operational progress, χωρίς preliminary findings.</p></article>
          <article className={styles.processStep}><span>04</span><strong>Analysis</strong><p>QA, exclusions, weighting, uncertainty και locked analysis run.</p></article>
          <article className={styles.processStep}><span>05</span><strong>Release</strong><p>Immutable public evidence, methodology και longitudinal comparison.</p></article>
        </div>
      </section>

      {!snapshot.databaseConfigured && <div className={styles.notice}>
        <strong>Research production data is not active on this deployment yet.</strong> Το public UX λειτουργεί ως readiness surface και θα γεμίσει με live δεδομένα όταν το production schema φτάσει στο Research schema head.
      </div>}

      <div className={styles.footer}>KONTA MOY Research · Programme → Study → Wave → Evidence Release</div>
    </div>
    <SiteFooter />
  </main>;
}
