import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { StudioExperienceRuntime } from "../../components/StudioExperienceRuntime";
import { SportFitImmersiveExperience } from "../../components/SportFitImmersiveExperience";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./page.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/sport-fit-studio", {
    title: "Sport & Fit Studio · ΚΟΝΤΑ ΜΟΥ",
    description: "Βρες παπούτσι και αθλητικό set με βάση τη δραστηριότητα, το μέγεθος και τη χρήση σου, από πραγματικά διαθέσιμα προϊόντα."
  });
}

export default function SportFitStudioPage() {
  return (
    <main className={styles.page}>
      <StudioExperienceRuntime studioId="sport-fit"><SportFitImmersiveExperience /></StudioExperienceRuntime>
      <SiteFooter />
    </main>
  );
}
