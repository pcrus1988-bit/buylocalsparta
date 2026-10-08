import { SiteFooter } from "../../../../../components/SiteFooter";
import { ResearchPublicNavigation } from "../../../../../components/ResearchPublicNavigation";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResearchSurveyForm } from "../../../../../components/ResearchSurveyForm";
import { publicResearchSurvey } from "../../../../../lib/research-survey-runtime";
import styles from "../../../../../components/ResearchSurveyPage.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, noimageindex: true },
  referrer: "no-referrer"
};

export default async function ResearchSurveyTokenPage({ params, searchParams }: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ optout?: string | string[] }>;
}) {
  const { slug, token } = await params;
  const query = await searchParams;
  const optOutIntent = Array.isArray(query.optout) ? query.optout.includes("1") : query.optout === "1";
  let context;
  try {
    context = await publicResearchSurvey(slug, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SURVEY_INVITE_NOT_FOUND") notFound();
    return <main className={styles.shell}>
      <ResearchPublicNavigation studySlug={slug} />
      <div className={styles.invalid}>
        <div className={styles.brand}>KONTA MOY · RESEARCH</div>
        <h1>Η πρόσκληση δεν είναι διαθέσιμη.</h1>
        <p>{message === "SURVEY_INVITE_EXPIRED" ? "Ο προσωπικός σύνδεσμος έχει λήξει." : "Η μελέτη δεν είναι διαθέσιμη αυτή τη στιγμή."}</p>
        <a href={"/research/" + encodeURIComponent(slug) + "/methodology"}>Μεθοδολογία μελέτης</a>
      </div>
      <SiteFooter />
    </main>;
  }

  return <main className={styles.shell}>
      <ResearchPublicNavigation studySlug={slug} />
    <header className={styles.hero}>
      <div className={styles.brand}>KONTA MOY · RESEARCH</div>
      <span>Πρόσκληση συμμετοχής</span>
      <h1>{context.study.title}</h1>
      {context.study.subtitle && <p>{context.study.subtitle}</p>}
      <div className={styles.meta}>
        <span>Ερευνητικός φορέας: {context.study.sponsor}</span>
        <a href={"/research/" + encodeURIComponent(slug) + "/methodology"}>Μεθοδολογία & διαφάνεια</a>
      </div>
      <div className={styles.trust}>
        <span>Προαιρετική συμμετοχή</span>
        <span>Προστασία προσωπικών δεδομένων</span>
        <span>Μετά την ολοκλήρωση οι απαντήσεις δεν αλλάζουν</span>
      </div>
    </header>
    <ResearchSurveyForm slug={slug} token={token} initial={context} initialOptOutIntent={optOutIntent} />
    <SiteFooter />
  </main>;
}
