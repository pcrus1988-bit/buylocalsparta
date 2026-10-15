import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../../components/AdminWorkspaceHeader";
import { GreeceSingleQuestionDistributionExplorer, type DistributionMetric } from "../../../../../../../components/GreeceSingleQuestionDistributionExplorer";
import { ResearchSurveyAdminNav } from "../../../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceSectionHeading } from "../../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../../lib/admin-session";
import { researchSingleQuestionDistribution } from "../../../../../../../lib/research-geographic-distribution-runtime";
import "../../../../../../research-map-relations.css";

export const metadata: Metadata = {
  title: "Admin · Γεωγραφική κατανομή μίας απάντησης",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

export default async function ResearchDistributionPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug } = await params;
  const query = await searchParams;
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);
  const link = root + "/map/distribution";
  let data: Awaited<ReturnType<typeof researchSingleQuestionDistribution>>;
  let unavailable = false;
  try {
    data = await researchSingleQuestionDistribution(principal, slug, query);
  } catch (error) {
    unavailable = true;
    console.error(JSON.stringify({ event: "research.distribution_map.unavailable",
      errorName: error instanceof Error ? error.name : "UnknownError" }));
  }
  if (!data && !unavailable) notFound();
  const initialMetric: DistributionMetric =
    query.metric === "footprint" || query.metric === "count" ? query.metric : "prevalence";
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken}
      entityLabel="Research · Distribution Map" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">KONTA MOY · Retail Observatory</div>
        <h1>Γεωγραφική κατανομή μίας ερώτησης</h1>
        <p className="lead">Επιλέξτε μόνο μία ερώτηση και απάντηση: πού εμφανίζεται,
          σε τι ποσοστό και πόσοι συμμετέχοντες την επέλεξαν;</p>
        <div className="hero-actions">
          <Link prefetch={false} className="button" aria-current="page"
            href={link}>Μία ερώτηση · Κατανομή</Link>
          <Link prefetch={false} className="button button-secondary"
            href={root + "/map/relations"}>Δύο ερωτήσεις · Συσχετισμοί</Link>
          <Link prefetch={false} className="button button-secondary"
            href={root + "/map"}>Αναλυτικός χάρτης</Link>
        </div>
      </div>
    </section>
    <ResearchSurveyAdminNav slug={slug} current="map" />
    <div className="research-relation-shell">
      {unavailable ? <section className="shell vendor-section" role="alert">
        <WorkspaceSectionHeading eyebrow="Χάρτης" title="Η κατανομή δεν είναι προσωρινά διαθέσιμη"
          note="Δεν εμφανίζουμε υποθετικά ή παλιά στοιχεία αντί των πραγματικών απαντήσεων." />
        <Link className="button" href={link} prefetch={false}>Επανάληψη</Link>
      </section> : data && <>
        <section className="shell vendor-section">
          <WorkspaceSectionHeading eyebrow="Γεωγραφική κατανομή"
            title="Ένα ερώτημα · όλες οι πραγματικές αποθηκευμένες απαντήσεις"
            note="Απλή κατανομή χωρίς σύγκριση ή προϋπόθεση απάντησης σε άλλη ερώτηση." />
          <GreeceSingleQuestionDistributionExplorer key={[
            data.filters.question, data.filters.answer, data.filters.mode,
            data.filters.phase, data.filters.sector, data.filters.kad
          ].join("|")} root={link} data={data}
            initialMetric={initialMetric} initialRegion={query.region} />
          {data.hasUnmappedGeography && <p className="research-relation-small-note">
            Υπάρχουν απαντήσεις επιχειρήσεων χωρίς επαληθευμένη γεωγραφική αντιστοίχιση.
            Μετρούν στα πανελλαδικά n, αλλά δεν τοποθετούνται αυθαίρετα σε Περιφέρεια.
            Για τη «γεωγραφική κατανομή» χρησιμοποιούνται μόνο οι αντιστοιχισμένες έδρες.
          </p>}
          <div className="workspace-inline-note" style={{ marginTop: 16 }}>
            <strong>Μεθοδολογία και εμπιστευτικότητα:</strong> Κάθε ερωτηματολόγιο προσμετράται
            μία φορά στον παρονομαστή αν έχει πραγματικά αποθηκευμένη απάντηση στην επιλεγμένη
            ερώτηση. Οι πολλαπλές επιλογές δεν συνιστούν αποκλειστικές κατηγορίες και
            τα ποσοστά τους δεν χρειάζεται να αθροίζονται σε 100%.
            Οι ολοκληρωμένες και υπό εξέλιξη απαντήσεις μπορούν να διαχωριστούν.
            Οι αποσυρμένες συμμετοχές δεν περιλαμβάνονται. Τα n είναι περιγραφικά,
            μη σταθμισμένα και δεν συνεπάγονται αντιπροσωπευτικότητα.
            Ακριβή μικρά n φαίνονται μόνο σε εξουσιοδοτημένους ερευνητικούς αναλυτές·
            οι λοιποί διαχειριστές βλέπουν προστατευμένα συγκεντρωτικά δεδομένα.
            Χρησιμοποιείται η έδρα ΓΕΜΗ της επιχείρησης, όχι GPS του συμμετέχοντος.
          </div>
        </section>
      </>}
    </div>
  </main>;
}
