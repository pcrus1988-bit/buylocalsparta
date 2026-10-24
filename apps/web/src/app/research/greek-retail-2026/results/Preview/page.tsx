import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResearchPublicNavigation } from "../../../../../components/ResearchPublicNavigation";
import { SiteFooter } from "../../../../../components/SiteFooter";
import shell from "../../../../../components/ResearchSurveyPage.module.css";
import { getAdminSession } from "../../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../../lib/admin-runtime";
import { rawResearchAnswerAccess } from "../../../../../lib/research-survey-response-admin";
import { getLiveGreekRetailPreview, type LiveGreekRetailPreview } from "../../../../../lib/research-live-preview-data";
import { publicResearchStudy } from "../../../../../lib/research-observatory-runtime";
import type { SafeParticipationGeography } from "../../../../../lib/research-public-results-data";
import { ResearchResultsPreviewExperience } from "./PreviewExperience";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ζωντανή προεπισκόπηση · Ελληνικό Λιανεμπόριο 2026 · KONTA MOY Research",
  description: "Εσωτερική, προσωρινή προβολή πραγματικών συγκεντρωτικών δεδομένων της μελέτης. Δεν αποτελεί δημοσίευση οριστικών αποτελεσμάτων.",
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: "/research/greek-retail-2026/results" }
};

/** Pre-release aggregate findings are confidential, including over React Flight. */
export default async function GreekRetailResultsLivePreview() {
  const principal = await getAdminSession();
  if (!principal || !hasAdminPermission(principal,"research.read") || !rawResearchAnswerAccess(principal)) notFound();
  let initial: LiveGreekRetailPreview | null = null;
  try {
    initial = await getLiveGreekRetailPreview();
  } catch (error) {
    console.error("research_live_preview_initial_failed",error instanceof Error?error.name:"UnknownError");
  }

  // Use already-public, privacy-suppressed geographic participation aggregates.
  let geography: SafeParticipationGeography | undefined;
  try {
    const study = await publicResearchStudy("greek-retail-2026");
    const location = study?.participationGeography;
    if (location) geography = {
      nationalStarted: Number.isSafeInteger(study?.started) && (study?.started ?? 0)>0 ? study!.started : undefined,
      regions: location.regions.filter(r=>r.started>=30).map(r=>({
        key:r.key,label:r.label,started:r.started
      })),
      prefectures: location.prefectures?.filter(p=>p.started>=30).map(p=>({key:p.key,label:p.label,started:p.started})),
      densityImage: location.densityImage
    };
  } catch (error) {
    console.error("research_live_preview_geography_unavailable",error instanceof Error?error.name:"UnknownError");
  }

  return <main className={shell.shell}>
    <ResearchPublicNavigation active="results" studySlug="greek-retail-2026" />
    <ResearchResultsPreviewExperience initial={initial} geography={geography} />
    <SiteFooter />
  </main>;
}
