import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResearchStudyDashboard } from "../../../components/ResearchStudyDashboard";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";
import { publicResearchStudy } from "../../../lib/research-observatory-runtime";

export const dynamic = "force-dynamic";

type PageProps = Readonly<{ params: Promise<{ slug: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const study = await publicResearchStudy(slug);
  return governedStaticSeoMetadata("/research/" + slug, {
    title: study ? study.title + " · KONTA MOY Research" : "KONTA MOY Research",
    description: study?.subtitle || study?.methodologySummary || "Μελέτη του KONTA MOY Retail Observatory."
  });
}

export default async function ResearchStudyPage({ params }: PageProps) {
  const { slug } = await params;
  const study = await publicResearchStudy(slug);
  if (!study) notFound();
  return <ResearchStudyDashboard study={study} />;
}
