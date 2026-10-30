import { ResearchPublicNavigation } from "../../../../components/ResearchPublicNavigation";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../../components/SiteFooter";
import styles from "../../../../components/ResearchSurveyPage.module.css";
import editorialStyles from "./ResultsEditorial.module.css";
import { ResearchResultsEditorial } from "./ResearchResultsEditorial";
import { ResultsNavigation } from "./ResultsNavigation";
import { getPublishedGreekRetailResults } from "../../../../lib/research-survey-release";
import { governedStaticSeoMetadata } from "../../../../lib/seo-metadata";
import { publicResearchStudy } from "../../../../lib/research-observatory-runtime";
import { publicResultPoints, publicCountyAvailability, type SafeParticipationGeography } from "../../../../lib/research-public-results-data";
import { ResearchResultsWorkbench } from "./ResearchResultsWorkbench";
import { ResearchScientificReading } from "./ResearchScientificReading";
import { ResearchRawDataRequest } from "./ResearchRawDataRequest";
import { publicVoiceDataFromRelease } from "../../../../lib/research-public-voices-data";
import { loadApprovedGreekRetailQ18 } from "../../../../lib/research-q18-approved-sidecar";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/greek-retail-2026/results", {
    title: "Αποτελέσματα · Ελληνικό Λιανεμπόριο 2026 · KONTA MOY Research",
    description: "Ελληνικό Λιανεμπόριο 2026: τελικά ευρήματα, τεκμηριωμένα μεγέθη συμμετοχής, στάθμιση, γεωγραφική κάλυψη και μεθοδολογικοί περιορισμοί.",
    keywords: ["αποτελέσματα Ελληνικό Λιανεμπόριο 2026", "στατιστικά ελληνικού λιανεμπορίου", "ψηφιακή ετοιμότητα αποτελέσματα", "δείκτης λειτουργικών δυσκολιών"]
  });
}

export default async function GreekRetailResultsPage() {
  const published = await getPublishedGreekRetailResults("greek-retail-2026");

  if (!published) {
    return <main className={styles.shell}>
      <ResearchPublicNavigation active="results" studySlug="greek-retail-2026" />
      <header className={editorialStyles.pending}>
        <span className={editorialStyles.eyebrow}>KONTA MOY RESEARCH · ΕΛΛΗΝΙΚΟ ΛΙΑΝΕΜΠΟΡΙΟ 2026</span>
        <h1>Η αγορά μίλησε.<br /><em>Τα ευρήματα ακολουθούν.</em></h1>
        <p>Η ανάλυση της κύριας Ομάδας Α έχει ολοκληρωθεί. Τα επιβεβαιωμένα, εγκεκριμένα ευρήματα, ο χάρτης της Ελλάδας και οι θεματικές αναλύσεις θα εμφανιστούν την προγραμματισμένη ημερομηνία δημοσίευσης.</p>
        <div className={editorialStyles.pendingStatus} role="status">Τα τελικά αποτελέσματα δεν έχουν δημοσιευθεί ακόμη.</div>
        <div className={editorialStyles.pendingDates}>
          <div><small>ΠΡΑΓΜΑΤΙΚΗ ΛΗΞΗ ΣΥΛΛΟΓΗΣ</small><strong>30 Οκτωβρίου 2026</strong><span>17:06:23 · ώρα Ελλάδας (αρχικός προγραμματισμός 18:00)</span></div>
          <div><small>ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΗ ΔΗΜΟΣΙΕΥΣΗ</small><strong>1 Νοεμβρίου 2026</strong><span>00:00:01 · ώρα Ελλάδας</span></div>
        </div>
        <nav className={editorialStyles.pendingLinks} aria-label="Σχετικές σελίδες μελέτης">
          <Link href="/research/greek-retail-2026">Επισκόπηση μελέτης ↗</Link>
          <Link href="/research/greek-retail-2026/methodology">Μεθοδολογία ↗</Link>
          <Link href="/research/privacy">Προστασία δεδομένων ↗</Link>
        </nav>
      </header>
      <SiteFooter />
    </main>;
  }

  // Public reader is already gated by the immutable Athens publication cutoff.
  // Only already-published and privacy-suppressed aggregate estimates reach the browser.
  const safePoints = publicResultPoints(published.estimates);
  const countyAvailability = publicCountyAvailability(published.estimates);
  const voices = publicVoiceDataFromRelease(published.methodology.q18PublicVoices)
    ?? await loadApprovedGreekRetailQ18(published.artifactSha256);
  let geography: SafeParticipationGeography | undefined;
  try {
    const publicStudy = await publicResearchStudy("greek-retail-2026");
    const snapshot = publicStudy?.participationGeography;
    if (snapshot) geography = {
      nationalStarted: publicStudy && Number.isSafeInteger(publicStudy.started) && publicStudy.started > 0 ? publicStudy.started : undefined,
      // Participation starts are a separate data series from published results.
      // Do not expose small regional cells through React Flight.
      regions: snapshot.regions.filter(region => region.started >= 30)
        .map(region => ({key:region.key,label:region.label,started:region.started})),
      prefectures: snapshot.prefectures?.filter(p=>p.started>=30).map(p=>({key:p.key,label:p.label,started:p.started})),
      densityImage: snapshot.densityImage
    };
  } catch (cause) {
    console.error("research_results_geography_unavailable",cause instanceof Error?cause.name:"UnknownError");
  }
  return <main className={styles.shell}>
    <ResearchPublicNavigation active="results" studySlug="greek-retail-2026" />
    <div className={editorialStyles.resultsLayout}>
      <ResultsNavigation />
      <div className={editorialStyles.resultsContent}>
        <ResearchResultsEditorial points={safePoints} geography={geography} countyAvailability={countyAvailability}>
          <ResearchScientificReading points={safePoints} />
        </ResearchResultsEditorial>
        <ResearchResultsWorkbench mode="published" points={safePoints} geography={geography} countyAvailability={countyAvailability}
          voices={voices} />
        <div id="results-data-request"><ResearchRawDataRequest /></div>
      </div>
    </div>
    <SiteFooter />
  </main>;
}
