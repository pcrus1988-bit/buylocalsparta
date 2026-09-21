import type { Metadata } from "next";
import { PaintBuildStudioExperience } from "../../components/PaintBuildStudioExperience";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./page.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/paint-and-build-studio", {
    title: "Paint & Build Studio · Η Τέλεια Πινελιά · ΚΟΝΤΑ ΜΟΥ",
    description:
      "Ένα full-screen Build Studio για βαφή, στεγανοποίηση, θερμομόνωση και επισκευή τοίχου — με καθοδήγηση βήμα-βήμα από το έργο προς τα σωστά υλικά."
  });
}

export default function PaintAndBuildStudioPage() {
  return (
    <main className={styles.page}>
      <PaintBuildStudioExperience />
    </main>
  );
}
