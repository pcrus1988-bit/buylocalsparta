import { ResearchPublicNavigation } from "../../../../components/ResearchPublicNavigation";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../../components/SiteFooter";
import styles from "../../../../components/ResearchSurveyPage.module.css";
import { getPublishedGreekRetailResults } from "../../../../lib/research-survey-release";
import { governedStaticSeoMetadata } from "../../../../lib/seo-metadata";

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
        <div className={styles.brand}>KONTA MOY · ΑΠΟΤΕΛΕΣΜΑΤΑ ΕΡΕΥΝΑΣ</div>
        <span>Ελληνικό Λιανεμπόριο 2026</span>
        <h1>Τα αποτελέσματα δεν έχουν δημοσιευθεί ακόμη.</h1>
        <p>Η σελίδα θα ενημερωθεί αφού ολοκληρωθούν η συλλογή απαντήσεων, οι έλεγχοι ποιότητας και η ανάλυση.</p>
        <div className={styles.meta}>
          <Link href="/research/greek-retail-2026">← Επισκόπηση μελέτης</Link>
          <Link href="/research/greek-retail-2026/methodology">Μεθοδολογία</Link>
        </div>
      </header>
      <SiteFooter />
    </main>;
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
        <Link href="/research/greek-retail-2026/methodology">Πώς έγινε η μελέτη</Link>
      </div>
    </header>

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
