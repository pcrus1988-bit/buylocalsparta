import { ResearchPublicNavigation } from "../../../components/ResearchPublicNavigation";
import { ResearchStudyDashboard } from "../../../components/ResearchStudyDashboard";
import { SiteFooter } from "../../../components/SiteFooter";
import type { Metadata } from "next";
import styles from "../../../components/ResearchObservatory.module.css";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";
import { publicResearchStudy } from "../../../lib/research-observatory-runtime";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/greek-retail-2026", {
    title: "Ελληνικό Λιανεμπόριο 2026 · KONTA MOY Research",
    description: "Η πραγματικότητα της μικρής και μεσαίας εμπορικής επιχείρησης στην ψηφιακή εποχή",
    keywords: ["Ελληνικό Λιανεμπόριο 2026", "έρευνα εμπορικών επιχειρήσεων", "ψηφιακή ετοιμότητα επιχειρήσεων", "λειτουργικές δυσκολίες λιανεμπορίου", "marketplaces ελληνικές επιχειρήσεις"]
  });
}

export default async function GreekRetailResearchPage() {
  const study = await publicResearchStudy("greek-retail-2026");
  if (study) return <>
    <ResearchStudyDashboard study={study} compactIntro />
    <SiteFooter />
  </>;

  return <>
    <main className={styles.shell}>
    <div className={styles.frame}>
      <ResearchPublicNavigation active="overview" studySlug="greek-retail-2026" />
      <header className={styles.hero} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <div>
          <h1>Ελληνικό Λιανεμπόριο 2026</h1>
          <p>Η πραγματικότητα της μικρής και μεσαίας εμπορικής επιχείρησης στην ψηφιακή εποχή</p>
          <div className={styles.heroBadges}>
            <span className={[styles.badge, styles.badgeWarm].join(" ")}>Ενημέρωση σε εξέλιξη</span>
          </div>
        </div>
      </header>
    </div>
    </main>
    <SiteFooter />
  </>;
}
