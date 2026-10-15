import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../../components/AdminWorkspaceHeader";
import { GreeceRelationshipWorkbench } from "../../../../../../../components/GreeceRelationshipWorkbench";
import { ResearchRelationshipExplorer } from "../../../../../../../components/ResearchRelationshipExplorer";
import { ResearchSurveyAdminNav } from "../../../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceSectionHeading } from "../../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../../lib/admin-session";
import { researchRelationshipMap } from "../../../../../../../lib/research-geographic-relations-runtime";
import type { SafeRelationshipCounts } from "../../../../../../../lib/research-geographic-relations-core";
import "../../../../../../research-map-relations.css";

export const metadata: Metadata = {
  title: "Admin · Διαδραστικές Συσχετίσεις Λιανεμπορίου",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

const formatter = new Intl.NumberFormat("el-GR");
const share = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("el-GR", { maximumFractionDigits: 0 }) + "%";

function Stats({ label, data, caption }: {
  label: string; data: SafeRelationshipCounts; caption: string;
}) {
  return <article className="research-relation-stat">
    <small>{label}</small>
    <strong>{share(data.percent)}</strong>
    <div className="research-relation-bar" role="img" aria-label={label + ": " +
      (data.percent === null ? "ανεπαρκής βάση" : share(data.percent))}>
      <span style={{ width: (data.percent ?? 0) + "%" }} />
    </div>
    <small>{data.base === null ? "Μικρή βάση: εμφανίζεται μόνο στους εξουσιοδοτημένους αναλυτές" :
      "Πραγματικό n = " + formatter.format(data.base) + " απαντήσεις και στις δύο ερωτήσεις."}</small>
    {data.base !== null && data.base > 0 && data.base < 15 &&
      <small><strong>Μικρό δείγμα:</strong> η τιμή είναι ενδεικτική, όχι γενικεύσιμη.</small>}
    <small>{caption}</small>
  </article>;
}

function Difference({ a, b }: { a: SafeRelationshipCounts; b: SafeRelationshipCounts }) {
  if (a.percent === null || b.percent === null) return <div className="research-relation-insight">
    <strong>Δεν υπάρχουν ακόμη ασφαλή συγκρίσιμα ποσοστά.</strong>
    Δοκιμάστε ευρύτερη κατηγορία, άλλη συσχέτιση ή αποθηκευμένες απαντήσεις.
    Οι ανεπαρκείς βάσεις δεν εμφανίζονται ως 0%.
  </div>;
  const delta = a.percent - b.percent;
  return <div className="research-relation-insight">
    <strong>{delta === 0 ? "Παρόμοια ποσοστά" :
      delta > 0 ? "Υψηλότερο ποσοστό στην ομάδα Α" :
      "Χαμηλότερο ποσοστό στην ομάδα Α"} · {delta > 0 ? "+" : ""}{delta} π.μ.</strong>
    Η διαφορά αφορά αποκλειστικά συμμετέχοντες που απάντησαν και στις δύο ερωτήσεις.
    Δεν αποδεικνύει αιτιώδη σχέση.
  </div>;
}

export default async function ResearchRelationshipMapPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug } = await params;
  const query = await searchParams;
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);
  const link = root + "/map/relations";
  let data: Awaited<ReturnType<typeof researchRelationshipMap>>;
  let unavailable = false;
  try {
    data = await researchRelationshipMap(principal, slug, query);
  } catch (err) {
    unavailable = true;
    console.error(JSON.stringify({ event: "research.geographic_relations.unavailable",
      errorName: err instanceof Error ? err.name : "UnknownError" }));
  }
  if (!data && !unavailable) notFound();
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Interactive Relationships" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">KONTA MOY · Retail Observatory</div>
        <h1>Διαδραστικός Χάρτης Συσχετίσεων</h1>
        <p className="lead">Συνδυάστε απαντήσεις, συγκρίνετε ομάδες επιχειρήσεων και εξερευνήστε
          τις διαφορές ανά Περιφέρεια σε πραγματικό χρόνο μέσα στον χάρτη.</p>
        <div className="hero-actions">
          <Link prefetch={false} className="button button-secondary" href={root + "/map"}>
            Αναλυτικός χάρτης / φίλτρα</Link>
          <Link prefetch={false} className="button button-secondary" href={root + "/barometer"}>
            Ζωντανό Βαρόμετρο</Link>
        </div>
      </div>
    </section>
    <ResearchSurveyAdminNav slug={slug} current="map" />
    <div className="research-relation-shell">
      {unavailable ? <section className="shell vendor-section" role="alert">
        <WorkspaceSectionHeading eyebrow="Χάρτης" title="Τα στατιστικά δεν είναι διαθέσιμα"
          note="Δεν εμφανίζουμε τεχνητά δεδομένα. Μπορείτε να επιχειρήσετε ξανά." />
        <Link prefetch={false} className="button" href={link}>Επανάληψη</Link>
      </section> : data && <>
        <section className="shell vendor-section">
          <WorkspaceSectionHeading eyebrow="Έρευνα με ένα πάτημα"
            title="Τι θέλετε να μάθετε για τις επιχειρήσεις;"
            note="Κάθε σύγκριση συνδυάζει απαντήσεις από το ίδιο ερωτηματολόγιο — όχι διαφορετικούς συμμετέχοντες." />
          <ResearchRelationshipExplorer root={link} filters={data.filters}
            questions={data.questions} sectors={data.sectors} kads={data.kads} />
        </section>
        <section className="shell vendor-section">
          <WorkspaceSectionHeading eyebrow="Κάλυψη πραγματικών απαντήσεων"
            title="Πόσοι απάντησαν σε κάθε ερώτηση;"
            note="Το n προκύπτει από αποθηκευμένες απαντήσεις, όχι από προσκλήσεις, υποθετικό μέγεθος δείγματος ή κατώφλι 15." />
          {data.coverage ? <div className="analytics-workflow-grid">
            {([
              ["Απάντησαν στην Α", data.coverage.answeredA],
              ["Απάντησαν στη Β", data.coverage.answeredB],
              ["Απάντησαν και στις δύο", data.coverage.paired],
              ["Μόνο στην Α", data.coverage.onlyA],
              ["Μόνο στη Β", data.coverage.onlyB]
            ] as const).map(([label,count])=><article key={label} className="analytics-workflow-card">
              <span>{label}</span><strong style={{fontSize:"1.45rem"}}>n={formatter.format(count)}</strong>
            </article>)}
          </div> : <div className="workspace-inline-note">
            Τα πραγματικά n κάτω από το όριο προστασίας εμφανίζονται μόνο σε διαχειριστές με
            άδεια ανάλυσης ή διαχείρισης έρευνας. Οι απαντήσεις τους εξακολουθούν να προσμετρώνται.
          </div>}
          <p className="research-relation-small-note" style={{marginTop:12}}>
            Η σύγκριση Α → Β μπορεί να υπολογιστεί μόνο όταν ο ίδιος συμμετέχων έχει απαντήσει
            και στις δύο ερωτήσεις. Οι απαντήσεις μόνο στην Α ή μόνο στη Β δεν χάνονται:
            εμφανίζονται ξεχωριστά στην κάλυψη. Άγνωστο / Δεν γνωρίζω καταμετράται ως
            καταγεγραμμένη απάντηση, όχι ως επιλεγμένη απάντηση Β.
            Δεν προσμετρώνται αποσυρμένα ερωτηματολόγια.
          </p>
        </section>
        <section className="shell vendor-section">
          <WorkspaceSectionHeading eyebrow="Πανελλαδική εικόνα" title={data.pair.insight}
            note="Απαντήσεις από την ομάδα Α σε σύγκριση με τις υπόλοιπες επιχειρήσεις." />
          <div className="workspace-inline-note" style={{ marginBottom: 16 }}>
            <strong>Ομάδα Α: </strong>{data.pair.aLabel} <span aria-hidden="true"> → </span>
            <strong>Αποτέλεσμα Β: </strong>{data.pair.bLabel}
          </div>
          <div className="research-relation-statgrid">
            <Stats label="Ομάδα Α" data={data.nationalSegment}
              caption={"Απάντησαν: " + data.pair.bLabel} />
            <Stats label="Λοιπές επιχειρήσεις" data={data.nationalOther}
              caption="Απαντήσεις επιχειρήσεων που δεν πληρούν την πρώτη συνθήκη." />
          </div>
          <div style={{ marginTop: 12 }}>
            <Difference a={data.nationalSegment} b={data.nationalOther} />
          </div>
          <p className="research-relation-small-note" style={{ marginTop: 12 }}>
            Πραγματικό n για τη σχέση (και οι δύο απαντήσεις): {data.totalMatchedBase === null ?
              "Προστατευμένο για περιορισμένη πρόσβαση" : formatter.format(data.totalMatchedBase)}.
            Οι απαντήσεις «Δεν γνωρίζω» καταμετρώνται στις διαθέσιμες απαντήσεις·
            ελλείπουσες απαντήσεις στη Β δεν υποθέτουμε πως είναι «Όχι».
          </p>
        </section>
        <section className="shell vendor-section">
          <WorkspaceSectionHeading eyebrow="Αλληλεπίδραση με τον χάρτη"
            title="Δείτε ποσοστά, διαφορές και συγκρίσεις Περιφερειών"
            note="Η αλλαγή προβολής, η επιλογή περιοχής και η ταξινόμηση ενημερώνονται χωρίς νέα ανάκτηση ερωτηματολογίων." />
          <GreeceRelationshipWorkbench key={[
            data.filters.mode, data.filters.phase, data.filters.sector, data.filters.kad,
            data.filters.preset, data.filters.a, data.filters.av, data.filters.b, data.filters.bv
          ].join("|")} root={link} filters={data.filters} regions={data.regions}
            regionalCoverage={data.regionalCoverage}
            aLabel={data.pair.aLabel} bLabel={data.pair.bLabel}
            initialView={data.filters.view} initialCompare={data.filters.compare} />
          {data.unknownGeography && <p className="research-relation-small-note">
            Κάποιες έδρες επιχειρήσεων δεν αντιστοιχούν σε επαληθευμένη Περιφέρεια
            και δεν επινοούμε τοποθεσίες για αυτές.</p>}
          <div className="workspace-inline-note" style={{ marginTop: 16 }}>
            <strong>Δεοντολογία.</strong> Εσωτερική, μη σταθμισμένη, περιγραφική ανάλυση·
            οι αποθηκευμένες και οριστικές απαντήσεις παραμένουν χωριστές.
            Χρησιμοποιείται η καταγεγραμμένη έδρα της επιχείρησης στο ΓΕΜΗ,
            όχι GPS του συμμετέχοντος. Κάθε καταγεγραμμένη απάντηση συμβάλλει
            στην αντίστοιχη βάση n. Οι εξουσιοδοτημένοι αναλυτές βλέπουν το ακριβές n
            ακόμη και για μικρές ομάδες, με προειδοποίηση αβεβαιότητας.
            Με άδεια μόνο ανάγνωσης παραμένει απόκρυψη μικρών ομάδων,
            πριν σταλούν δεδομένα στον φυλλομετρητή.
            Δεν τεκμηριώνεται αιτιότητα ή στατιστική σημαντικότητα.
          </div>
        </section>
      </>}
    </div>
  </main>;
}
