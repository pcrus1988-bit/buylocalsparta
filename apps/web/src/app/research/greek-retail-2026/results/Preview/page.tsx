import type { Metadata } from "next";
import { ResearchPublicNavigation } from "../../../../../components/ResearchPublicNavigation";
import { SiteFooter } from "../../../../../components/SiteFooter";
import shell from "../../../../../components/ResearchSurveyPage.module.css";
import { ResearchResultsPreviewExperience } from "./PreviewExperience";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "Προεπισκόπηση αποτελεσμάτων · Ελληνικό Λιανεμπόριο 2026 · KONTA MOY Research",
  description: "Διαδραστική σχεδιαστική προεπισκόπηση έξι ερευνητικών ενοτήτων. Όλοι οι αριθμοί είναι ενδεικτικοί και δεν προέρχονται από απαντήσεις της μελέτης.",
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: "/research/greek-retail-2026/results" }
};

/**
 * Exact requested URL: /research/greek-retail-2026/results/Preview
 * Static preview: zero DB calls, zero personal data, zero private EXP01 data.
 * Public final results and their release gates are not modified.
 */
export default function GreekRetailResultsDesignPreview() {
  return <main className={shell.shell}>
    <ResearchPublicNavigation active="results" studySlug="greek-retail-2026" />
    <ResearchResultsPreviewExperience />
    <SiteFooter />
  </main>;
}
