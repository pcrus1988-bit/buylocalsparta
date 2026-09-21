import type { Metadata } from "next";
import { PaintBuildStudioExperience } from "../../components/PaintBuildStudioExperience";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./page.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/paint-and-build-studio", {
    title: "Η Τέλεια Πινελιά · Paint & Build Studio · ΚΟΝΤΑ ΜΟΥ",
    description:
      "Βρες το σωστό σύστημα βαφής, την απόχρωση και την ποσότητα που χρειάζεσαι σε 3 απλά βήματα με το Paint Consultant του ΚΟΝΤΑ ΜΟΥ."
  });
}

export default function PaintAndBuildStudioPage() {
  return (
    <main className={styles.page}>
      <div className={styles.announcement}>PAINT & BUILD STUDIO · Η ΤΕΛΕΙΑ ΠΙΝΕΛΙΑ</div>
      <SiteHeader />
      <PaintBuildStudioExperience />
      <SiteFooter />
    </main>
  );
}
