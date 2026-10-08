import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { ResearchPurposeCards } from "../../components/ResearchPurposeCards";
import styles from "../../components/ResearchObservatory.module.css";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { publicResearchObservatory, type PublicResearchStudySummary } from "../../lib/research-observatory-runtime";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research", {
    title: "Παρατηρητήριο Ελληνικού Λιανεμπορίου · KONTA MOY Research",
    description: "Μελέτες, πρόοδος, μεθοδολογία, αποτελέσματα και συγκρίσεις για το ελληνικό λιανεμπόριο.",
    keywords: ["Παρατηρητήριο Ελληνικού Λιανεμπορίου", "έρευνα ελληνικού λιανεμπορίου", "στοιχεία λιανεμπορίου Ελλάδα", "μελέτες εμπορικών επιχειρήσεων", "ψηφιακή ωριμότητα λιανεμπορίου"]
  });
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
      <span className={styles.eyebrow}>{study.programmeTitle}</span>
    </div>

    <h3>{study.title}</h3>
    <p>{study.subtitle || study.methodologySummary}</p>

    {study.targetCompletes > 0 && <>
      <div className={styles.cardProgress} aria-label={"Πρόοδος " + percent(progress)}>
        <div className={styles.cardProgressFill} style={{ width: (progress * 100).toFixed(1) + "%" }} />
      </div>
      <div className={styles.progressCaption}>
        <span>{study.completed.toLocaleString("el-GR")} ολοκληρωμένες απαντήσεις</span>
        <span>{percent(progress)} του στόχου</span>
      </div>
    </>}

    <div className={styles.cardMeta}>
      <div><span>Πληθυσμός</span><strong>{study.populationDefinition}</strong></div>
      <div>
        <span>{study.status === "published" ? "Δημοσιεύτηκε" : "Συλλογή έως"}</span>
        <strong>{study.status === "published" ? date(study.releasePublishedAt) : date(study.fieldworkEndsAt)}</strong>
      </div>
    </div>

    <div className={styles.cardFoot}>
      <span className={styles.eyebrow}>KONTA MOY Research</span>
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
        <Link className={styles.brand} href="/research">KONTA MOY · ΕΡΕΥΝΑ</Link>
        <nav className={styles.nav} aria-label="Έρευνα">
          <Link href="#studies">Μελέτες</Link>
          <Link href="/research/compare">Σύγκριση</Link>
          <Link href="/research/privacy">Ιδιωτικότητα</Link>
        </nav>
      </div>

      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Παρατηρητήριο Ελληνικού Λιανεμπορίου</div>
          <h1>Μελέτες για το ελληνικό λιανεμπόριο, από τη συλλογή ως τα αποτελέσματα.</h1>
          <p>Παρακολουθήστε την πρόοδο των ενεργών μελετών, δείτε πώς πραγματοποιούνται και διαβάστε τα αποτελέσματα όταν ολοκληρωθεί η ανάλυση. Οι συγκρίσεις παρουσιάζονται μόνο όταν είναι επιστημονικά κατάλληλες.</p>

          <div className={styles.heroBadges}>
            {live.length > 0 && <span className={[styles.badge, styles.badgeLive].join(" ")}><span className={styles.dot} aria-hidden="true" /> {live.length} {live.length === 1 ? "μελέτη σε εξέλιξη" : "μελέτες σε εξέλιξη"}</span>}
            <span className={styles.badge}>{published.length} δημοσιευμένες</span>
            <span className={styles.badge}>Μεθοδολογία διαθέσιμη</span>
          </div>

          <div className={styles.sectionActions}>
            {lead && <Link className={[styles.actionButton, styles.primaryButton].join(" ")} href={"/research/" + lead.waveSlug}>Δείτε την ενεργή μελέτη</Link>}
            <Link className={styles.actionButton} href="/research/compare">Σύγκριση μελετών</Link>
          </div>
        </div>

        <aside className={styles.heroAside}>
          <span>Σε εξέλιξη / υπό ανάλυση</span>
          <strong>{active.length}</strong>
          <hr />
          <span>Δημοσιευμένες</span>
          <strong>{published.length}</strong>
          <hr />
          <span>Σύνολο μελετών</span>
          <strong>{snapshot.studies.length}</strong>
          <span>Τελευταία ενημέρωση {new Date(snapshot.generatedAt).toLocaleString("el-GR")}</span>
        </aside>
      </header>

      <section className={styles.section} aria-label="Ο σκοπός της μελέτης">
        <ResearchPurposeCards />
      </section>

      <section className={styles.section}>
        <div className={styles.quickGrid}>
          <a className={styles.quickLink} href="#studies">
            <span className={styles.eyebrow}>01 · Πρόοδος</span>
            <strong>Παρακολουθήστε τη συλλογή</strong>
            <span>Δείτε το μέγεθος του δείγματος, τις προσκλήσεις και τις ολοκληρωμένες απαντήσεις.</span>
          </a>
          <Link className={styles.quickLink} href="/research/compare">
            <span className={styles.eyebrow}>02 · Σύγκριση</span>
            <strong>Συγκρίνετε μελέτες</strong>
            <span>Δείτε πότε δύο αποτελέσματα μπορούν να συγκριθούν άμεσα και πότε χρειάζεται προσοχή.</span>
          </Link>
          <Link className={styles.quickLink} href="/research/greek-retail-2026/methodology">
            <span className={styles.eyebrow}>03 · Μέθοδος</span>
            <strong>Δείτε πώς έγινε η έρευνα</strong>
            <span>Σκοπός, πληθυσμός, δείγμα, περίοδος συλλογής και βασικές αρχές ανάλυσης.</span>
          </Link>
          <Link className={styles.quickLink} href="/research/privacy">
            <span className={styles.eyebrow}>04 · Ιδιωτικότητα</span>
            <strong>Πώς προστατεύονται οι συμμετέχοντες</strong>
            <span>Η συμμετοχή, οι απαντήσεις και οι επιλογές επικοινωνίας παραμένουν ξεχωριστές.</span>
          </Link>
        </div>
      </section>

      <section className={styles.section} id="studies">
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Ενεργές μελέτες</div>
            <h2>Μελέτες σε εξέλιξη</h2>
          </div>
          <p>Κατά τη διάρκεια της συλλογής εμφανίζουμε μόνο στοιχεία προόδου. Τα ευρήματα δημοσιεύονται αφού ολοκληρωθούν η συλλογή, οι έλεγχοι και η ανάλυση.</p>
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
            <div className={styles.eyebrow}>Αποτελέσματα</div>
            <h2>Δημοσιευμένες μελέτες</h2>
          </div>
          <p>Κάθε δημοσιευμένη μελέτη συνοδεύεται από τη μεθοδολογία της, το μέγεθος του δείγματος και τις πληροφορίες που χρειάζονται για σωστή ερμηνεία.</p>
        </div>
        {published.length > 0
          ? <div className={styles.grid}>{published.map((study) => <StudyCard study={study} key={study.waveId} />)}</div>
          : <div className={styles.empty}>Δεν έχουν δημοσιευθεί ακόμη αποτελέσματα.</div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Πώς εξελίσσεται μια μελέτη</div>
            <h2>Πέντε απλά στάδια.</h2>
          </div>
          <p>Η δημόσια σελίδα δείχνει σε ποιο στάδιο βρίσκεται κάθε μελέτη και τι είναι διαθέσιμο σε κάθε φάση.</p>
        </div>
        <div className={styles.process}>
          <article className={styles.processStep}><span>01</span><strong>Σχεδιασμός</strong><p>Ορίζονται τα ερωτήματα, ο πληθυσμός και το δείγμα.</p></article>
          <article className={styles.processStep}><span>02</span><strong>Πιλοτική δοκιμή</strong><p>Ελέγχουμε ότι το ερωτηματολόγιο λειτουργεί σωστά.</p></article>
          <article className={styles.processStep}><span>03</span><strong>Συλλογή</strong><p>Συγκεντρώνονται οι απαντήσεις και εμφανίζεται μόνο η πρόοδος.</p></article>
          <article className={styles.processStep}><span>04</span><strong>Ανάλυση</strong><p>Ελέγχονται τα δεδομένα και υπολογίζονται τα αποτελέσματα.</p></article>
          <article className={styles.processStep}><span>05</span><strong>Δημοσίευση</strong><p>Τα αποτελέσματα παρουσιάζονται μαζί με τη μεθοδολογία και τους περιορισμούς τους.</p></article>
        </div>
      </section>

      {!snapshot.databaseConfigured && <div className={styles.notice}>
        Η ενημέρωση των μελετών δεν είναι προσωρινά διαθέσιμη. Παρακαλούμε δοκιμάστε ξανά αργότερα.
      </div>}

      <div className={styles.footer}>KONTA MOY Research · Μελέτες · Μεθοδολογία · Αποτελέσματα</div>
    </div>
    <SiteFooter />
  </main>;
}
