import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../../components/AdminWorkspaceHeader";
import { ResearchSurveySimulationView } from "../../../../../../../components/ResearchSurveySimulationView";
import { hasAdminPermission } from "../../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../../lib/admin-session";
import { validSimulationSlug } from "../../../../../../../lib/research-workflow-simulation";
import { loadResearchSimulationContext } from "../../../../../../../lib/research-survey-simulation-preview";

export const metadata: Metadata = {
  title: "Research · Full-screen Survey Preview",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer"
};
export const dynamic = "force-dynamic";

export default async function FullScreenSurveyPreview({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ survey?: string | string[] }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug } = await params;
  const query = await searchParams;
  if (!validSimulationSlug(slug)) notFound();
  const survey = typeof query.survey === "string" && validSimulationSlug(query.survey) ? query.survey : slug;
  const context = await loadResearchSimulationContext(principal, survey);
  if (!context || !context.questions.length) notFound();
  return <main>
    <div className="vendor-app admin-app">
      <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Survey Preview" />
    </div>
    <ResearchSurveySimulationView
      context={context}
      returnHref={"/admin/research/surveys/" + encodeURIComponent(slug) + "/simulation?mode=survey&survey=" + encodeURIComponent(survey)}
    />
  </main>;
}
