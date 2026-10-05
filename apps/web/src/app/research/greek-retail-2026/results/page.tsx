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

function formatOptionalPercent(value: unknown): string {
  if (value == null) return "—";
  const result = Number(value);
  return Number.isFinite(result)
    ? new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(result)
    : "—";
}

function formatOptionalNumber(value: unknown, digits = 2): string {
  if (value == null) return "—";
  const result = Number(value);
  return Number.isFinite(result)
    ? new Intl.NumberFormat("el-GR", { maximumFractionDigits: digits }).format(result)
    : "—";
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

function pairwiseMetricLabel(metadata: Record<string, unknown>): string {
  const sourceMetricKey = typeof metadata.sourceMetricKey === "string" ? metadata.sourceMetricKey : "";
  return metricLabel(sourceMetricKey, metadata);
}

function pairwiseDimensionLabel(value: unknown): string {
  return value === "regionCode" ? "Περιοχή" : value === "sectorCode" ? "Κλάδος" : String(value ?? "—");
}

function formatPValue(value: unknown): string {
  if (value == null) return "—";
  const result = Number(value);
  if (!Number.isFinite(result)) return "—";
  if (result < 0.001) return "<0,001";
  return new Intl.NumberFormat("el-GR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(result);
}

function experimentAttributeLabel(value: unknown): string {
  return ({
    monthly_fee_eur: "Μηνιαίο κόστος",
    commission_pct: "Προμήθεια ανά πώληση",
    reach: "Εμβέλεια",
    catalog: "Διαχείριση καταλόγου",
    customer_relationship: "Σχέση με πελάτη",
    stock_sync: "Συγχρονισμός αποθέματος",
    operations: "Λειτουργική υποστήριξη"
  } as Record<string, string>)[String(value ?? "")] ?? String(value ?? "—");
}

function experimentLevelLabel(attribute: unknown, value: unknown): string {
  const attributeKey = String(attribute ?? "");
  const normalized = String(value ?? "");
  if (attributeKey === "monthly_fee_eur") return normalized + " € / μήνα";
  if (attributeKey === "commission_pct") return normalized + "%";
  const labels: Record<string, Record<string, string>> = {
    reach: { local: "Τοπική", national: "Πανελλαδική", local_national: "Τοπική + πανελλαδική" },
    catalog: { manual: "Χειροκίνητη", single_import: "Μία εισαγωγή", automatic_sync: "Αυτόματος συγχρονισμός" },
    customer_relationship: { platform_only: "Μόνο μέσω πλατφόρμας", merchant_access: "Άμεση πρόσβαση επιχείρησης" },
    stock_sync: { none: "Χωρίς συγχρονισμό", daily: "Καθημερινά", realtime: "Σχεδόν πραγματικός χρόνος" },
    operations: { listing_only: "Μόνο προβολή", payments: "Πληρωμές", payments_shipping_returns: "Πληρωμές + αποστολές + επιστροφές" }
  };
  return (labels[attributeKey]?.[normalized] ?? normalized) || "—";
}

function formatPercentagePointEffect(value: unknown): string {
  if (value == null) return "—";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";
  const formatter = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1, signDisplay: "always" });
  return formatter.format(numericValue * 100) + " π.μ.";
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
  const pilot = objectValue(methodology.pilot);
  const sample = objectValue(methodology.sample);
  const designEvidence = objectValue(sample.designEvidence);
  const fieldwork = objectValue(methodology.fieldwork);
  const analysisPlan = objectValue(methodology.analysisPlan);
  const analysis = objectValue(methodology.analysis);
  const weightDiagnostics = objectValue(analysis.weightDiagnostics);
  const experimentDiagnostics = objectValue(analysis.experimentDiagnostics);
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
  const pairwiseComparisons = release.estimates.filter((estimate) =>
    !estimate.suppressed &&
    estimate.estimate != null &&
    estimate.method === "pairwise_independent_strata_difference_v1"
  );
  const experimentalContrasts = release.estimates.filter((estimate) =>
    !estimate.suppressed &&
    estimate.estimate != null &&
    estimate.method === "randomized_profile_amce_clustered_v1"
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
      {(pilot.startsAt || numeric(pilot.exposedUnitsExcludedFromMainDraw) > 0) && <p>
        Pilot: <strong>{numeric(pilot.sent).toLocaleString("el-GR")}</strong> sent ·
        {" "}<strong>{numeric(pilot.completed).toLocaleString("el-GR")}</strong> completed ·
        {" "}<strong>{numeric(pilot.exposedUnitsExcludedFromMainDraw).toLocaleString("el-GR")}</strong> pilot-exposed businesses excluded from the main draw.
        {" "}Main eligible population after holdout: <strong>{numeric(sample.effectivePopulationAfterPilotHoldout).toLocaleString("el-GR")}</strong>.
        Οι pilot απαντήσεις δεν περιλαμβάνονται στο analytical dataset.
      </p>}
      <p>
        Email-contactable μονάδες στον main-eligible population: <strong>{numeric(fieldwork.activeEmailFrameUnits).toLocaleString("el-GR")}</strong>
        {" · "}contactability: <strong>{new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 2 }).format(numeric(fieldwork.emailContactabilityRate))}</strong>.
        Η κάλυψη email είναι ξεχωριστή από την πιθανότητα επιλογής και αποτελεί ρητό limitation της μελέτης.
      </p>
      <p>
        Frozen sample plan: στόχος <strong>{numeric(designEvidence.desiredCompleteN).toLocaleString("el-GR")}</strong> completed questionnaires ·
        {" "}expected invited-response rate <strong>{formatOptionalPercent(designEvidence.expectedResponseRate)}</strong> ·
        {" "}planned selected n <strong>{numeric(designEvidence.plannedSelectedN).toLocaleString("el-GR")}</strong> ·
        {" "}expected contactable <strong>{numeric(designEvidence.expectedContactableN).toLocaleString("el-GR")}</strong> ·
        {" "}expected completes <strong>{numeric(designEvidence.expectedCompleteN).toLocaleString("el-GR")}</strong>.
        {" "}Design SHA-256: <code>{String(designEvidence.contentSha256 ?? "—")}</code>.
      </p>
      <p>
        Delivered: <strong>{numeric(fieldwork.delivered).toLocaleString("el-GR")}</strong> ·
        {" "}opened: <strong>{numeric(fieldwork.opened).toLocaleString("el-GR")}</strong> ·
        {" "}started: <strong>{numeric(fieldwork.started).toLocaleString("el-GR")}</strong> ·
        {" "}withdrawn: <strong>{numeric(fieldwork.withdrawn).toLocaleString("el-GR")}</strong>.
        {" "}Sent→complete: <strong>{formatOptionalPercent(fieldwork.completionRateOfSent)}</strong> ·
        {" "}start→complete: <strong>{formatOptionalPercent(fieldwork.completionRateOfStarted)}</strong>.
        Οι παρονομαστές αυτοί δημοσιεύονται ρητά και δεν παρουσιάζονται ως AAPOR response-rate classification.
      </p>
      <p>
        Weight version: <strong>{String(analysis.weightVersion ?? "—")}</strong>. Variance method: <strong>{String(analysis.varianceMethod ?? "—")}</strong>.
        {String(analysis.varianceMethod) === "not_estimated"
          ? " Για αυτό το release δεν δημοσιεύονται confidence intervals ή συμβατικό margin of error."
          : " Τα 95% confidence intervals δημοσιεύονται μόνο όπου το stratified design τα υποστηρίζει· για μη στρωματοποιημένα post-hoc domains ή ανεπαρκείς βάσεις παραμένουν withheld."}
      </p>
      <p>
        Kish effective n: <strong>{formatOptionalNumber(weightDiagnostics.kishEffectiveN, 1)}</strong> από
        {" "}<strong>{numeric(weightDiagnostics.count).toLocaleString("el-GR")}</strong> weighted responses ·
        {" "}weighting design effect: <strong>{formatOptionalNumber(weightDiagnostics.weightingDesignEffect, 2)}</strong> ·
        {" "}weight CV: <strong>{formatOptionalNumber(weightDiagnostics.coefficientOfVariation, 2)}</strong> ·
        {" "}max non-response adjustment: <strong>{formatOptionalNumber(weightDiagnostics.nonresponseAdjustmentMax, 2)}×</strong>.
        Τα diagnostics αυτά δείχνουν πόση αποτελεσματική πληροφορία χάνεται από άνισα βάρη.
      </p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Pre-fieldwork analysis plan</div>
      <h2>Τι είχε οριστεί πριν ξεκινήσει η συλλογή δεδομένων</h2>
      <p>
        Plan version: <strong>{String(analysisPlan.version ?? "—")}</strong> ·
        {" "}locked: <strong>{analysisPlan.lockedAt ? new Date(String(analysisPlan.lockedAt)).toLocaleString("el-GR") : "—"}</strong>.
      </p>
      <p>Plan SHA-256: <code>{String(analysisPlan.contentSha256 ?? "—")}</code></p>
      <p>
        Οι δύο κύριοι δείκτες — ψηφιακή ετοιμότητα και λειτουργική τριβή — είναι
        <strong> pre-specified primary outcomes</strong>. Οι περιγραφικές αναλύσεις του κλειδωμένου ερωτηματολογίου
        είναι pre-specified secondary analyses. Οι pairwise συγκρίσεις μεταξύ περιοχών/κλάδων παραμένουν
        ρητά <strong>exploratory</strong> και δεν παρουσιάζονται ως εκ των προτέρων κύριες υποθέσεις.
      </p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Randomized platform-choice experiment · Exploratory</div>
      <h2>Ποια χαρακτηριστικά αλλάζουν την πιθανότητα επιλογής μιας ψηφιακής εμπορικής υπηρεσίας;</h2>
      <p>
        Το προαιρετικό EXP01 παρουσίασε σε κάθε συμμετέχοντα τρεις τυχαιοποιημένες συγκρίσεις δύο υποθετικών υπηρεσιών.
        Οι παρακάτω εκτιμήσεις είναι survey-weighted marginal differences στην πιθανότητα επιλογής ενός profile,
        με repeated tasks clustered στο respondent. Επειδή αυτή η ανάλυση προστέθηκε μετά το locked analysis plan,
        δημοσιεύεται ρητά ως <strong>exploratory / not preregistered</strong> και όχι ως confirmatory αποτέλεσμα.
      </p>
      <p>
        Απαντημένα tasks: <strong>{numeric(experimentDiagnostics.answeredTasks).toLocaleString("el-GR")}</strong> ·
        {" "}respondents: <strong>{numeric(experimentDiagnostics.respondentCount).toLocaleString("el-GR")}</strong> ·
        {" "}profile observations: <strong>{numeric(experimentDiagnostics.profileObservations).toLocaleString("el-GR")}</strong>.
        Τα p-values διορθώνονται με Benjamini–Hochberg μέσα στην οικογένεια όλων των attribute-level contrasts.
      </p>
      {experimentalContrasts.length === 0
        ? <p>Δεν υπάρχουν ακόμη experimental contrasts με επαρκή βάση και ολοκληρωμένη uncertainty estimate.</p>
        : <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={{ textAlign: "left", padding: "10px 6px" }}>Χαρακτηριστικό</th>
              <th style={{ textAlign: "left", padding: "10px 6px" }}>Level − reference</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>Effect</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>95% CI</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>raw p</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>BH q</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>respondents</th>
            </tr></thead>
            <tbody>{experimentalContrasts.map((estimate) => {
              const attribute = estimate.segment.attribute;
              const level = estimate.segment.level;
              const referenceLevel = estimate.segment.referenceLevel;
              return <tr key={estimate.metricKey}>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>{experimentAttributeLabel(attribute)}</td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>
                  {experimentLevelLabel(attribute, level)} − {experimentLevelLabel(attribute, referenceLevel)}
                </td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>
                  {formatPercentagePointEffect(estimate.estimate)}
                </td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>
                  {estimate.ciLower != null && estimate.ciUpper != null
                    ? formatPercentagePointEffect(estimate.ciLower) + " – " + formatPercentagePointEffect(estimate.ciUpper)
                    : "withheld"}
                </td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>
                  {formatPValue(estimate.metadata.rawPValue)}
                </td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>
                  {formatPValue(estimate.metadata.adjustedPValue)}
                </td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>
                  {estimate.unweightedN.toLocaleString("el-GR")}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
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
      <div className={styles.brand}>Exploratory pairwise inference</div>
      <h2>Είναι οι διαφορές μεταξύ περιοχών ή κλάδων μεγαλύτερες από την αβεβαιότητα του δείγματος;</h2>
      <p>
        Οι παρακάτω διαφορές υπολογίζονται μόνο όταν και οι δύο συγκρινόμενες εκτιμήσεις έχουν design-aware standard error
        και αντιστοιχούν σε μη επικαλυπτόμενες ενώσεις των πραγματικών sampling strata. Δημοσιεύεται το raw δύο-όψεων p-value
        μαζί με <strong>Benjamini–Hochberg FDR-adjusted q-value</strong> μέσα στην οικογένεια κάθε metric × διάστασης.
        Παραμένουν exploratory evidence και όχι αυτόματος κανόνας «στατιστικά σημαντικού» ευρήματος.
      </p>
      {pairwiseComparisons.length === 0
        ? <p>Δεν υπάρχουν pairwise comparisons με επαρκή design-based uncertainty για αυτό το release.</p>
        : <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={{ textAlign: "left", padding: "10px 6px" }}>Διάσταση</th>
              <th style={{ textAlign: "left", padding: "10px 6px" }}>Σύγκριση</th>
              <th style={{ textAlign: "left", padding: "10px 6px" }}>Μέτρο</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>Διαφορά A−B</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>95% CI</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>raw p</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>BH q</th>
              <th style={{ textAlign: "right", padding: "10px 6px" }}>n A/B</th>
            </tr></thead>
            <tbody>{pairwiseComparisons.map((estimate) => {
              const levelA = String(estimate.segment.levelA ?? "—");
              const levelB = String(estimate.segment.levelB ?? "—");
              return <tr key={estimate.metricKey + ":" + levelA + ":" + levelB}>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>
                  {pairwiseDimensionLabel(estimate.segment.comparisonDimension)}
                </td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>{levelA} − {levelB}</td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px" }}>{pairwiseMetricLabel(estimate.metadata)}</td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>
                  {formatOptionalNumber(estimate.estimate, 2)}
                </td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>
                  {estimate.ciLower != null && estimate.ciUpper != null
                    ? formatOptionalNumber(estimate.ciLower, 2) + "–" + formatOptionalNumber(estimate.ciUpper, 2)
                    : "withheld"}
                </td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>
                  {formatPValue(estimate.metadata.pValue)}
                </td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>
                  {formatPValue(estimate.metadata.adjustedPValue)}
                </td>
                <td style={{ borderTop: "1px solid #d6cfbf", padding: "10px 6px", textAlign: "right" }}>
                  {numeric(estimate.metadata.unweightedNA).toLocaleString("el-GR")}/
                  {numeric(estimate.metadata.unweightedNB).toLocaleString("el-GR")}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      <p>
        Η κατεύθυνση είναι A−B: θετική τιμή σημαίνει υψηλότερο score στο A. Η ερμηνεία πρέπει να εξετάζει μαζί
        το μέγεθος της διαφοράς, το interval, τις βάσεις και το πλήθος των συγκρίσεων — όχι μόνο το raw p ή το adjusted q.
      </p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Reproducibility fingerprints</div>
      <h2>Ακριβές αποτύπωμα του release</h2>
      <p>Dataset SHA-256: <code>{release.datasetSha256}</code></p>
      <p>Artifact SHA-256: <code>{release.artifactSha256}</code></p>
      <p>Machine-readable published output: <Link href="/api/research/greek-retail-2026/results">Results API →</Link></p>
      <p>
        Verifiable evidence artifact: <a href="/api/research/greek-retail-2026/release">Download canonical JSON →</a>.
        The downloaded bytes hash directly to the Artifact SHA-256 above.
      </p>
    </section>
    <SiteFooter />
  </main>;
}
