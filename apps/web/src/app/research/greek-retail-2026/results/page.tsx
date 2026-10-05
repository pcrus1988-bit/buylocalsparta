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
    description: "Δημοσιευμένα, σταθμισμένα και αναπαραγώγιμα αποτελέσματα της μελέτης Ελληνικό Λιανεμπόριο 2026."
  });
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numeric(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function formatEstimate(value: number, metadata: Record<string, unknown>): string {
  return metadata.format === "proportion"
    ? new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(value)
    : new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 }).format(value);
}

function formatInterval(value: number, metadata: Record<string, unknown>): string {
  return formatEstimate(value, metadata);
}

function comparisonSegmentLabel(segment: Record<string, unknown>): string {
  if (typeof segment.regionCode === "string") return segment.regionCode;
  if (typeof segment.sectorCode === "string") return segment.sectorCode;
  return "—";
}

function comparisonInterval(
  estimate: { ciLower: number | null; ciUpper: number | null; metadata: Record<string, unknown> }
): string {
  return estimate.ciLower != null && estimate.ciUpper != null
    ? formatInterval(estimate.ciLower, estimate.metadata) + "–" + formatInterval(estimate.ciUpper, estimate.metadata)
    : "withheld";
}

function metricLabel(metricKey: string, metadata: Record<string, unknown>): string {
  const label = typeof metadata.label === "string" ? metadata.label.trim() : "";
  if (label) return label;
  if (metricKey === "digital_readiness.mean") return "Δείκτης ψηφιακής ετοιμότητας";
  if (metricKey === "retail_friction.mean") return "Δείκτης λειτουργικής τριβής";
  return metricKey;
}

export default async function GreekRetailResultsPage() {
  const release = await getPublishedGreekRetailResults("greek-retail-2026");

  if (!release) {
    return <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.brand}>KONTA MOY · RESEARCH</div>
        <span>Greek Retail Observatory · Wave 2026</span>
        <h1>Αποτελέσματα</h1>
        <p>Δεν έχει δημοσιευθεί ακόμη ερευνητικό release. Τα αποτελέσματα εμφανίζονται εδώ μόνο αφού κλειδώσουν το dataset hash, η μεθοδολογία, οι κανόνες disclosure και το artifact hash.</p>
        <div className={styles.meta}>
          <Link href="/research/greek-retail-2026">Μελέτη</Link>
          <Link href="/research/greek-retail-2026/methodology">Μεθοδολογία & διαφάνεια</Link>
        </div>
      </header>
      <SiteFooter />
    </main>;
  }

  const methodology = objectValue(release.methodology);
  const fieldwork = objectValue(methodology.fieldwork);
  const analysis = objectValue(methodology.analysis);
  const overall = release.estimates.filter((estimate) =>
    !estimate.suppressed &&
    estimate.estimate != null &&
    Object.keys(estimate.segment).length === 0
  );
  const headlineKeys = new Set(["digital_readiness.mean", "retail_friction.mean"]);
  const regionComparisons = release.estimates.filter((estimate) =>
    !estimate.suppressed &&
    estimate.estimate != null &&
    headlineKeys.has(estimate.metricKey) &&
    typeof estimate.segment.regionCode === "string"
  );
  const sectorComparisons = release.estimates.filter((estimate) =>
    !estimate.suppressed &&
    estimate.estimate != null &&
    headlineKeys.has(estimate.metricKey) &&
    typeof estimate.segment.sectorCode === "string"
  );

  return <main className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.brand}>KONTA MOY · RESEARCH</div>
      <span>Published evidence · {release.releaseVersion}</span>
      <h1>Ελληνικό Λιανεμπόριο 2026</h1>
      <p>Τα παρακάτω αποτελέσματα προέρχονται από το κλειδωμένο release της μελέτης. Κάθε δημοσιευμένη εκτίμηση συνδέεται με το ακριβές instrument, population frame, sample draw, weighting version και dataset hash.</p>
      <div className={styles.meta}>
        <span>Δημοσίευση: {new Date(release.publishedAt).toLocaleString("el-GR")}</span>
        <Link href="/research/greek-retail-2026/methodology">Πλήρης μεθοδολογία</Link>
      </div>
    </header>

    <section className={styles.invalid}>
      <div className={styles.brand}>Fieldwork & analytical base</div>
      <h2>Από το δείγμα στο αναλυτικό σύνολο</h2>
      <p>
        Επιλεγμένες μονάδες: <strong>{numeric(fieldwork.selected).toLocaleString("el-GR")}</strong> ·
        {" "}απεσταλμένες προσκλήσεις: <strong>{numeric(fieldwork.sent).toLocaleString("el-GR")}</strong> ·
        {" "}ολοκληρωμένες απαντήσεις: <strong>{numeric(fieldwork.completed).toLocaleString("el-GR")}</strong> ·
        {" "}αναλυτικό σύνολο: <strong>{numeric(fieldwork.analyzed).toLocaleString("el-GR")}</strong>.
      </p>
      <p>
        Weight version: <strong>{String(analysis.weightVersion ?? "—")}</strong>. Variance method: <strong>{String(analysis.varianceMethod ?? "—")}</strong>.
        {String(analysis.varianceMethod) === "not_estimated"
          ? " Για αυτό το release δεν δημοσιεύονται confidence intervals ή συμβατικό margin of error."
          : " Τα 95% confidence intervals δημοσιεύονται μόνο όπου το stratified design τα υποστηρίζει· για μη στρωματοποιημένα post-hoc domains ή ανεπαρκείς βάσεις παραμένουν withheld."}
      </p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Overall weighted estimates</div>
      <h2>Κύρια αποτελέσματα</h2>
      {overall.length === 0
        ? <p>Δεν υπάρχουν δημοσιεύσιμες overall εκτιμήσεις πάνω από το ελάχιστο disclosure base.</p>
        : <div style={{ display: "grid", gap: 18 }}>
          {overall.map((estimate) => <article key={estimate.metricKey} style={{ borderTop: "1px solid #d6cfbf", paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{metricLabel(estimate.metricKey, estimate.metadata)}</div>
            <div style={{ fontFamily: "Georgia,serif", fontSize: 36, margin: "6px 0" }}>
              {formatEstimate(estimate.estimate!, estimate.metadata)}
            </div>
            <div style={{ fontSize: 11, color: "#58685f" }}>
              n={estimate.unweightedN.toLocaleString("el-GR")}
              {estimate.weightedN != null ? " · weighted base " + Math.round(estimate.weightedN).toLocaleString("el-GR") : ""}
              {estimate.ciLower != null && estimate.ciUpper != null
                ? " · 95% CI " + formatInterval(estimate.ciLower, estimate.metadata) + "–" + formatInterval(estimate.ciUpper, estimate.metadata)
                : " · CI withheld for this estimate"}
              {" · "}{estimate.metricKey}
            </div>
          </article>)}
        </div>}
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Descriptive comparison · Region</div>
      <h2>Ψηφιακή ετοιμότητα και λειτουργική τριβή ανά γεωγραφική ενότητα</h2>
      <p>Οι γραμμές είναι σταθμισμένες descriptive estimates. Τα intervals αφορούν κάθε εκτίμηση ξεχωριστά· δεν αποτελούν pairwise significance test μεταξύ δύο περιοχών.</p>
      {regionComparisons.length === 0
        ? <p>Δεν υπάρχουν ακόμη δημοσιεύσιμες περιφερειακές βάσεις πάνω από το disclosure threshold.</p>
        : <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={{ textAlign: "left", padding: "10px 6px" }}>Περιοχή</th>
              <th style={{ textAlign: "left", padding: "10px 6px" }}>Μέτρο</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>Estimate</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>95% CI</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>n</th>
            </tr></thead>
            <tbody>{regionComparisons.map((estimate) => <tr key={estimate.metricKey + ":" + String(estimate.segment.regionCode)}>
              <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>{comparisonSegmentLabel(estimate.segment)}</td>
              <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>{metricLabel(estimate.metricKey, estimate.metadata)}</td>
              <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>{formatEstimate(estimate.estimate!, estimate.metadata)}</td>
              <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>{comparisonInterval(estimate)}</td>
              <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>{estimate.unweightedN.toLocaleString("el-GR")}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Descriptive comparison · Sector</div>
      <h2>Οι ίδιοι δύο δείκτες ανά κλάδο λιανικής</h2>
      <p>Οι συγκρίσεις χρησιμοποιούν τα ίδια frozen weights και disclosure rules. Δεν εμφανίζεται κελί κάτω από το ελάχιστο unweighted base του release.</p>
      {sectorComparisons.length === 0
        ? <p>Δεν υπάρχουν ακόμη δημοσιεύσιμες κλαδικές βάσεις πάνω από το disclosure threshold.</p>
        : <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={{ textAlign: "left", padding: "10px 6px" }}>Κλάδος</th>
              <th style={{ textAlign: "left", padding: "10px 6px" }}>Μέτρο</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>Estimate</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>95% CI</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>n</th>
            </tr></thead>
            <tbody>{sectorComparisons.map((estimate) => <tr key={estimate.metricKey + ":" + String(estimate.segment.sectorCode)}>
              <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>{comparisonSegmentLabel(estimate.segment)}</td>
              <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>{metricLabel(estimate.metricKey, estimate.metadata)}</td>
              <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>{formatEstimate(estimate.estimate!, estimate.metadata)}</td>
              <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>{comparisonInterval(estimate)}</td>
              <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>{estimate.unweightedN.toLocaleString("el-GR")}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Reproducibility fingerprints</div>
      <h2>Ακριβές αποτύπωμα του release</h2>
      <p>Dataset SHA-256: <code>{release.datasetSha256}</code></p>
      <p>Artifact SHA-256: <code>{release.artifactSha256}</code></p>
      <p>Machine-readable published output: <Link href="/api/research/greek-retail-2026/results">JSON release →</Link></p>
    </section>
    <SiteFooter />
  </main>;
}
