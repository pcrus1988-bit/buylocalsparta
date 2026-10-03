import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SportFitImmersiveExperience } from "../../components/SportFitImmersiveExperience";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./page.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/sport-fit-studio", {
    title: "Sport & Fit Studio · ΚΟΝΤΑ ΜΟΥ",
    description: "Βρες παπούτσι και αθλητικό set με βάση τη δραστηριότητα, το μέγεθος και τη χρήση σου, από πραγματικά διαθέσιμα προϊόντα."
  });
}

type SportFitStudioPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function firstValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();
  return normalized && /^[A-Za-z0-9_-]{3,160}$/.test(normalized) ? normalized : undefined;
}

export default async function SportFitStudioPage({ searchParams }: SportFitStudioPageProps) {
  const params = await searchParams;
  const candidateProductId = firstValue(params.candidate_product);
  const candidateVendorId = firstValue(params.candidate_vendor);

  return (
    <main className={styles.page}>
      <SportFitImmersiveExperience
        candidateProductId={candidateProductId}
        vendorId={candidateVendorId}
      />
      <SiteFooter />
    </main>
  );
}
