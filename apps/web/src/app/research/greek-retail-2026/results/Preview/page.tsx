import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ResearchPublicNavigation } from "../../../../../components/ResearchPublicNavigation";
import { SiteFooter } from "../../../../../components/SiteFooter";
import shell from "../../../../../components/ResearchSurveyPage.module.css";
import { canReadResearchResultsPreview } from "../../../../../lib/research-preview-authorization";
import { RESEARCH_PREVIEW_COOKIE, RESEARCH_PREVIEW_LOGIN_PATH, validResearchPreviewTicket } from "../../../../../lib/research-preview-access";
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
  if (!(await canReadResearchResultsPreview())) redirect(RESEARCH_PREVIEW_LOGIN_PATH);
  const restrictedViewer = validResearchPreviewTicket((await cookies()).get(RESEARCH_PREVIEW_COOKIE)?.value);
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
    {restrictedViewer && <form action="/api/research/greek-retail-2026/results-preview-logout" method="POST" style={{textAlign:"right",padding:"10px 24px"}}>
      <button type="submit" style={{padding:"9px 14px",background:"#153d2a",color:"#fff",border:0,borderRadius:7,cursor:"pointer"}}>Αποσύνδεση προεπισκόπησης</button>
    </form>}
    <ResearchResultsPreviewExperience initial={initial} geography={geography} restrictedViewer={restrictedViewer} />
    <SiteFooter />
  </main>;
}
