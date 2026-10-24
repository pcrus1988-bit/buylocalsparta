import { ResearchPublicNavigation } from "../../../../components/ResearchPublicNavigation";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../../components/SiteFooter";
import styles from "../../../../components/ResearchSurveyPage.module.css";
import previewStyles from "./ResultsPreview.module.css";
import { getPublishedGreekRetailResults } from "../../../../lib/research-survey-release";
import { governedStaticSeoMetadata } from "../../../../lib/seo-metadata";
import { publicResearchStudy } from "../../../../lib/research-observatory-runtime";
import { publicResultPoints, type SafeParticipationGeography } from "../../../../lib/research-public-results-data";
import { ResearchResultsWorkbench } from "./ResearchResultsWorkbench";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/greek-retail-2026/results", {
    title: "Αποτελέσματα · Ελληνικό Λιανεμπόριο 2026 · KONTA MOY Research",
    description: "Δημοσιευμένα αποτελέσματα της μελέτης Ελληνικό Λιανεμπόριο 2026 με μέγεθος δείγματος και διαστήματα εμπιστοσύνης όπου είναι διαθέσιμα.",
    keywords: ["αποτελέσματα Ελληνικό Λιανεμπόριο 2026", "στατιστικά ελληνικού λιανεμπορίου", "ψηφιακή ετοιμότητα αποτελέσματα", "δείκτης λειτουργικών δυσκολιών"]
  });
}

function formatEstimate(value: number, metadata: Record<string, unknown>): string {
  return metadata.format === "proportion"
    ? new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(value)
    : new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 }).format(value);
}

function metricLabel(metricKey: string, metadata: Record<string, unknown>): string {
  const label = typeof metadata.label === "string" ? metadata.label.trim() : "";
  if (label) return label;
  if (metricKey === "digital_readiness.mean") return "Δείκτης ψηφιακής ετοιμότητας";
  if (metricKey === "retail_friction.mean") return "Δείκτης λειτουργικών δυσκολιών";
  if (metricKey === "retail_confidence.mean") return "Δείκτης επιχειρηματικής εμπιστοσύνης";
  return "Δημοσιευμένος δείκτης";
}

function segmentLabel(segment: Record<string, unknown>, key: "regionCode" | "sectorCode"): string {
  return typeof segment[key] === "string" ? String(segment[key]) : "—";
}

function intervalText(
  estimate: { ciLower: number | null; ciUpper: number | null; metadata: Record<string, unknown> }
): string {
  if (estimate.ciLower == null || estimate.ciUpper == null) return "—";
  return formatEstimate(estimate.ciLower, estimate.metadata) + " – " + formatEstimate(estimate.ciUpper, estimate.metadata);
}

export default async function GreekRetailResultsPage() {
  const published = await getPublishedGreekRetailResults("greek-retail-2026");

  if (!published) {
    return <main className={styles.shell}>
      <ResearchPublicNavigation active="results" studySlug="greek-retail-2026" />

      <header className={styles.hero}>
        <div className={styles.brand}>KONTA MOY · ΠΑΡΑΤΗΡΗΤΗΡΙΟ ΕΛΛΗΝΙΚΟΥ ΛΙΑΝΕΜΠΟΡΙΟΥ</div>
        <span>Ελληνικό Λιανεμπόριο 2026 · Αποτελέσματα</span>
        <h1>Πίσω από τους αριθμούς υπάρχουν άνθρωποι.</h1>
        <p>Η μελέτη καταγράφει την πραγματικότητα των ελληνικών εμπορικών επιχειρήσεων. Οι απαντήσεις θα παρουσιαστούν με επιστημονική τεκμηρίωση, αλλά και με σεβασμό στους ανθρώπους που αφιέρωσαν χρόνο για να μοιραστούν την εμπειρία τους.</p>
        <div className={previewStyles.status}>Τα τελικά αποτελέσματα δεν έχουν δημοσιευθεί ακόμη</div>
        <div className={styles.meta}>
          <Link href="/research/greek-retail-2026">← Επισκόπηση και πρόοδος της έρευνας</Link>
          <Link href="/research/greek-retail-2026/methodology">Μεθοδολογία</Link><a href="#research-workbench">Εργαλεία, γραφήματα & χάρτης ↓</a>
        </div>
      </header>

      <div className={previewStyles.preview}>
        <div className={previewStyles.dates} aria-label="Χρονοδιάγραμμα της μελέτης">
          <article className={previewStyles.dateCard}>
            <span className={previewStyles.label}>Προγραμματισμένο τέλος συλλογής απαντήσεων</span>
            <strong><time dateTime="2026-10-30T18:00:00+02:00">30 Οκτωβρίου 2026</time></strong>
            <p>Παρασκευή, ώρα 18:00 Ελλάδας. Μέχρι τότε προβλέπεται η συλλογή απαντήσεων της κύριας έρευνας.</p>
          </article>
          <article className={previewStyles.dateCard}>
            <span className={previewStyles.label}>Προγραμματισμένη δημοσίευση αποτελεσμάτων</span>
            <strong><time dateTime="2026-11-01T00:00:01+02:00">1 Νοεμβρίου 2026 · 00:00:01</time></strong>
            <p>Κυριακή, 00:00:01 ώρα Ελλάδας. Η αυτόματη δημοσίευση πραγματοποιείται μόνο εφόσον έχει ολοκληρωθεί και επαληθευτεί η τελική ανάλυση.</p>
          </article>
        </div>

        <section className={previewStyles.section} aria-labelledby="preview-steps">
          <div className={previewStyles.eyebrow}>Από τη συμμετοχή στη δημοσίευση</div>
          <h2 id="preview-steps">Τι θα συμβεί στη συνέχεια</h2>
          <div className={previewStyles.steps}>
            <article className={previewStyles.step}>
              <span>01 · Έως 30/10</span>
              <strong>Συλλογή απαντήσεων</strong>
              <p>Η έρευνα συγκεντρώνει τις εμπειρίες των επιχειρήσεων, με δυνατότητα παρακολούθησης της συνολικής προόδου.</p>
            </article>
            <article className={previewStyles.step}>
              <span>02 · Μετά τη συλλογή</span>
              <strong>Έλεγχος και ανάλυση</strong>
              <p>Έλεγχοι εγκυρότητας, ποιότητας, αντιπροσωπευτικότητας και περιορισμών πριν εξαχθούν συμπεράσματα.</p>
            </article>
            <article className={previewStyles.step}>
              <span>03 · Από 01/11, εφόσον ολοκληρωθούν οι έλεγχοι</span>
              <strong>Δημοσίευση και ενημέρωση</strong>
              <p>Ανοιχτή παρουσίαση των τελικών ευρημάτων και προγραμματισμένη στοχευμένη κοινοποίησή τους σε αρμόδιους φορείς.</p>
            </article>
          </div>
          <p className={previewStyles.note}>Η 1η Νοεμβρίου αποτελεί στόχο δημοσίευσης και όχι προέγκριση αποτελεσμάτων. Εάν απαιτηθεί επιπλέον έλεγχος, θα προηγηθεί η επιστημονική ορθότητα.</p>
        </section>

        <section className={previewStyles.section} aria-labelledby="preview-contents">
          <div className={previewStyles.eyebrow}>Η τελική έκθεση</div>
          <h2 id="preview-contents">Τι θα περιλαμβάνουν τα αποτελέσματα</h2>
          <p>Η παρουσίαση σχεδιάζεται ώστε να συνδέει τα συνολικά ευρήματα με την καθημερινή εμπειρία των μικρών και μεσαίων επιχειρήσεων.</p>
          <div className={previewStyles.topics}>
            <article className={previewStyles.topic}><strong>Κόστος και οικονομικές πιέσεις</strong><p>Λειτουργικά έξοδα, φορολογικές και άλλες οικονομικές επιβαρύνσεις, ρευστότητα και βιωσιμότητα.</p></article>
            <article className={previewStyles.topic}><strong>Ψηφιακή ωριμότητα</strong><p>Ηλεκτρονικό εμπόριο, ψηφιακά εργαλεία, εμπόδια και ανάγκες υποστήριξης.</p></article>
            <article className={previewStyles.topic}><strong>Τοπική αγορά και πελάτες</strong><p>Σχέση με την τοπική κοινωνία, αλλαγές στην κατανάλωση και συνθήκες ανταγωνισμού.</p></article>
            <article className={previewStyles.topic}><strong>Εργασία και μέλλον</strong><p>Ανάγκες προσωπικού, προσδοκίες, προκλήσεις και προτάσεις των επιχειρήσεων.</p></article>
            <article className={previewStyles.topic}><strong>Περιοχές, κλάδοι και μέγεθος</strong><p>Συγκρίσεις ανά γεωγραφική ενότητα, κλάδο/ΚΑΔ και χαρακτηριστικά επιχείρησης, όπου το δείγμα το επιτρέπει.</p></article>
            <article className={previewStyles.topic}><strong>Διαδραστικά γραφήματα και χάρτες</strong><p>Οπτικοποιήσεις με σαφή μεγέθη δείγματος, μεθοδολογία και προστασία από την αναγνώριση συμμετεχόντων.</p></article>
          </div>
          <p className={previewStyles.note}>Οι τελικές ενότητες και αναλύσεις εξαρτώνται από την ποιότητα και την επάρκεια των πραγματικών απαντήσεων. Δεν προδικάζουμε ευρήματα ή διαφορές μεταξύ ομάδων.</p>
        </section>

        <section className={previewStyles.section} aria-labelledby="preview-recipients">
          <div className={previewStyles.eyebrow}>Η έρευνα δεν θα μείνει σε ένα αρχείο</div>
          <h2 id="preview-recipients">Ποιους σχεδιάζουμε να ενημερώσουμε</h2>
          <p>Μετά την οριστικοποίηση της έκθεσης, προγραμματίζεται ενεργή κοινοποίηση των αποτελεσμάτων μέσω του εργαλείου δελτίων Τύπου του KONTA MOY, πέρα από τη δημόσια ανάρτησή τους.</p>
          <div className={previewStyles.recipients}>
            <div className={previewStyles.recipient}><strong>Αρμόδια υπουργεία και δημόσιοι φορείς</strong><span>Εθνικής Οικονομίας και Οικονομικών, Ανάπτυξης, Εργασίας και Κοινωνικής Ασφάλισης, και συναφείς υπηρεσίες.</span></div>
            <div className={previewStyles.recipient}><strong>Πολιτικά κόμματα και κοινοβουλευτικοί αποδέκτες</strong><span>Για την ενημέρωση όσων συμμετέχουν στη διαμόρφωση πολιτικής για τις επιχειρήσεις.</span></div>
            <div className={previewStyles.recipient}><strong>Επιμελητήρια και εμπορικοί φορείς</strong><span>Επιμελητήρια της χώρας, εμπορικοί σύλλογοι και αντιπροσωπευτικοί επαγγελματικοί οργανισμοί.</span></div>
            <div className={previewStyles.recipient}><strong>Πανεπιστήμια και ερευνητές</strong><span>Οικονομικές σχολές, ερευνητικά κέντρα και επιστήμονες οικονομίας, φορολογίας και επιχειρηματικότητας.</span></div>
            <div className={previewStyles.recipient}><strong>Μέσα ενημέρωσης</strong><span>Εθνικά, περιφερειακά και οικονομικά μέσα και συντάκτες σχετικών θεμάτων.</span></div>
          </div>
          <p className={previewStyles.note}>Πρόκειται για σχεδιαζόμενες κατηγορίες αποδεκτών, όχι για ήδη πραγματοποιημένες αποστολές ή δεσμεύσεις ανταπόκρισης από τους φορείς.</p>
        </section>

        <section className={[previewStyles.section, previewStyles.human].join(" ")} aria-labelledby="preview-voices">
          <div className={previewStyles.eyebrow}>Πίσω από τους αριθμούς</div>
          <h2 id="preview-voices">Η φωνή σας δεν θα χαθεί μέσα σε διαγράμματα και ποσοστά.</h2>
          <p>Η τελική έκθεση θα επιδιώξει να αναδείξει και όσα δεν περιγράφονται μόνο με στατιστικούς δείκτες: την αγωνία, τις δυσκολίες, την αντοχή και τις προτάσεις των ανθρώπων του λιανεμπορίου. Τυχόν προσωπικές μαρτυρίες θα χρησιμοποιηθούν μόνο εφόσον επιτρέπεται η δημοσίευσή τους, με κατάλληλη ανωνυμοποίηση και προστασία της ιδιωτικότητας.</p>
        </section>

        <section className={previewStyles.section} aria-labelledby="preview-transparency">
          <div className={previewStyles.eyebrow}>Διαφάνεια και εμπιστοσύνη</div>
          <h2 id="preview-transparency">Πρώτα η ποιότητα. Έπειτα τα συμπεράσματα.</h2>
          <p>Δεν θα δημοσιευθούν πρόωρα ποσοστά ή μεμονωμένες απαντήσεις όσο η κύρια συλλογή και η ανάλυση εκκρεμούν. Τα τελικά ευρήματα θα συνοδεύονται από περιγραφή της μεθοδολογίας, το σχετικό μέγεθος δείγματος, διαστήματα εμπιστοσύνης όπου είναι διαθέσιμα και ξεκάθαρους περιορισμούς.</p>
          <div className={previewStyles.links}>
            <Link href="/research/greek-retail-2026">Παρακολούθηση προόδου έρευνας →</Link>
            <Link href="/research/greek-retail-2026/methodology">Δείτε τη μεθοδολογία →</Link>
            <Link href="/research/privacy">Προστασία δεδομένων →</Link>
          </div>
        </section>
      </div>
      <ResearchResultsWorkbench mode="unpublished" points={[]} />
      <SiteFooter />
    </main>;
  }

  // Public reader is already gated by the immutable Athens publication cutoff.
  // Only already-published and privacy-suppressed aggregate estimates reach the browser.
  const safePoints = publicResultPoints(published.estimates);
  let geography: SafeParticipationGeography | undefined;
  try {
    const publicStudy = await publicResearchStudy("greek-retail-2026");
    const snapshot = publicStudy?.participationGeography;
    if (snapshot) geography = {
      // Participation starts are a separate data series from published results.
      // Do not expose small regional cells through React Flight.
      regions: snapshot.regions.filter(region => region.started >= 30)
        .map(region => ({key:region.key,label:region.label,started:region.started})),
      densityImage: snapshot.densityImage
    };
  } catch (cause) {
    console.error("research_results_geography_unavailable",cause instanceof Error?cause.name:"UnknownError");
  }
  const visible = published.estimates.filter((estimate) => !estimate.suppressed && estimate.estimate != null);
  const overall = visible.filter((estimate) => Object.keys(estimate.segment).length === 0);
  const region = visible.filter((estimate) => typeof estimate.segment.regionCode === "string");
  const sector = visible.filter((estimate) => typeof estimate.segment.sectorCode === "string");

  return <main className={styles.shell}>
    <ResearchPublicNavigation active="results" studySlug="greek-retail-2026" />
    <header className={styles.hero}>
      <div className={styles.brand}>KONTA MOY · ΑΠΟΤΕΛΕΣΜΑΤΑ ΕΡΕΥΝΑΣ</div>
      <span>Ελληνικό Λιανεμπόριο 2026</span>
      <h1>Αποτελέσματα</h1>
      <p>Τα αποτελέσματα παρουσιάζονται μαζί με το μέγεθος του δείγματος και, όπου είναι διαθέσιμο, το 95% διάστημα εμπιστοσύνης.</p>
      <div className={styles.meta}>
        <Link href="/research/greek-retail-2026">← Επισκόπηση μελέτης</Link>
        <Link href="/research/greek-retail-2026/methodology">Πώς έγινε η μελέτη</Link><a href="#research-workbench">Graph Explorer & Heatmap ↓</a>
      </div>
    </header>

    <ResearchResultsWorkbench mode="published" points={safePoints} geography={geography} />
    <section className={styles.invalid}>
      <div className={styles.brand}>Πώς να διαβάσετε τους αριθμούς</div>
      <h2>Κοιτάξτε την τιμή μαζί με το n και το διάστημα εμπιστοσύνης.</h2>
      <p>Το <strong>n</strong> δείχνει πόσες απαντήσεις χρησιμοποιήθηκαν για το συγκεκριμένο αποτέλεσμα. Το <strong>95% διάστημα εμπιστοσύνης</strong>, όπου υπάρχει, δείχνει την αβεβαιότητα γύρω από την εκτίμηση.</p>
      <p>Για σωστή ερμηνεία, διαβάστε επίσης τη <Link href="/research/greek-retail-2026/methodology">μεθοδολογία της μελέτης</Link>.</p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Κύρια αποτελέσματα</div>
      <h2>Βασικοί δείκτες</h2>
      {overall.length === 0
        ? <p>Δεν υπάρχουν διαθέσιμα κύρια αποτελέσματα.</p>
        : <div style={{ display: "grid", gap: 18 }}>
          {overall.map((estimate) => <article key={estimate.metricKey} style={{ borderTop: "1px solid #d6cfbf", paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{metricLabel(estimate.metricKey, estimate.metadata)}</div>
            <div style={{ fontFamily: "Georgia,serif", fontSize: 36, margin: "6px 0" }}>
              {formatEstimate(estimate.estimate!, estimate.metadata)}
            </div>
            <div style={{ fontSize: 11, color: "#58685f" }}>
              n={estimate.unweightedN.toLocaleString("el-GR")}
              {estimate.ciLower != null && estimate.ciUpper != null
                ? " · 95% διάστημα εμπιστοσύνης " + intervalText(estimate)
                : ""}
            </div>
          </article>)}
        </div>}
    </section>

    {region.length > 0 && <section className={styles.invalid}>
      <div className={styles.brand}>Ανά περιοχή</div>
      <h2>Αποτελέσματα ανά γεωγραφική ενότητα</h2>
      <p>Οι τιμές ανά περιοχή πρέπει να διαβάζονται μαζί με το μέγεθος του αντίστοιχου δείγματος.</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={{ textAlign: "left", padding: "10px 6px" }}>Περιοχή</th>
            <th style={{ textAlign: "left", padding: "10px 6px" }}>Δείκτης</th>
            <th style={{ textAlign: "right", padding: "10px 6px" }}>Τιμή</th>
            <th style={{ textAlign: "right", padding: "10px 6px" }}>95% διάστημα εμπιστοσύνης</th>
            <th style={{ textAlign: "right", padding: "10px 6px" }}>n</th>
          </tr></thead>
          <tbody>{region.map((estimate) => <tr key={estimate.metricKey + ":" + String(estimate.segment.regionCode)}>
            <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>{segmentLabel(estimate.segment, "regionCode")}</td>
            <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>{metricLabel(estimate.metricKey, estimate.metadata)}</td>
            <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>{formatEstimate(estimate.estimate!, estimate.metadata)}</td>
            <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>{intervalText(estimate)}</td>
            <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>{estimate.unweightedN.toLocaleString("el-GR")}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}

    {sector.length > 0 && <section className={styles.invalid}>
      <div className={styles.brand}>Ανά κλάδο</div>
      <h2>Αποτελέσματα ανά κλάδο λιανικής</h2>
      <p>Οι τιμές ανά κλάδο πρέπει να διαβάζονται μαζί με το μέγεθος του αντίστοιχου δείγματος.</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={{ textAlign: "left", padding: "10px 6px" }}>Κλάδος</th>
            <th style={{ textAlign: "left", padding: "10px 6px" }}>Δείκτης</th>
            <th style={{ textAlign: "right", padding: "10px 6px" }}>Τιμή</th>
            <th style={{ textAlign: "right", padding: "10px 6px" }}>95% διάστημα εμπιστοσύνης</th>
            <th style={{ textAlign: "right", padding: "10px 6px" }}>n</th>
          </tr></thead>
          <tbody>{sector.map((estimate) => <tr key={estimate.metricKey + ":" + String(estimate.segment.sectorCode)}>
            <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>{segmentLabel(estimate.segment, "sectorCode")}</td>
            <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>{metricLabel(estimate.metricKey, estimate.metadata)}</td>
            <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>{formatEstimate(estimate.estimate!, estimate.metadata)}</td>
            <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>{intervalText(estimate)}</td>
            <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>{estimate.unweightedN.toLocaleString("el-GR")}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}

    <section className={styles.invalid}>
      <div className={styles.brand}>Περιορισμοί</div>
      <h2>Κανένα αποτέλεσμα δεν πρέπει να διαβάζεται χωρίς το πλαίσιο της μελέτης.</h2>
      <p>Οι διαφορές μεταξύ ομάδων μπορεί να επηρεάζονται από το μέγεθος του δείγματος, τη σύνθεσή του και τις συνθήκες της περιόδου συλλογής. Η μεθοδολογία εξηγεί ποια συμπεράσματα υποστηρίζονται και ποια χρειάζονται προσοχή.</p>
    </section>

    <SiteFooter />
  </main>;
}
