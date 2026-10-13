import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../components/AdminWorkspaceHeader";
import { GreeceResearchHeatmap } from "../../../../../../components/GreeceResearchHeatmap";
import { ResearchSurveyAdminNav } from "../../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceSectionHeading } from "../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { researchGeographicMap } from "../../../../../../lib/research-geographic-runtime";

export const metadata: Metadata = {
  title: "Admin · Χάρτης Ελληνικού Λιανεμπορίου",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

const integer = (n: number) => new Intl.NumberFormat("el-GR").format(n);
const share = (n: number, d: number) => (n / d * 100).toLocaleString("el-GR", { maximumFractionDigits: 1 }) + "%";

export default async function ResearchGeographicMapPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    mode?: string; phase?: string; metric?: string; question?: string; answer?: string;
    sector?: string; kad?: string; prefecture?: string; municipality?: string; region?: string
  }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug } = await params;
  const query = await searchParams;
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);
  let data: Awaited<ReturnType<typeof researchGeographicMap>>;
  let error = false;
  try {
    data = await researchGeographicMap(principal, slug, query);
  } catch (reason) {
    error = true;
    console.error(JSON.stringify({ event: "research.geographic_map.unavailable",
      errorName: reason instanceof Error ? reason.name : "UnknownError" }));
  }
  if (!data && !error) notFound();
  const filters = data?.filters;
  const question = data?.questions.find(x => x.code === filters?.question);
  const option = question?.options.find(o => o.key === filters?.answer);
  const focus = data?.regions.find(r => r.key === filters?.region);
  const sample = focus || undefined;
  const displayedRegions = [...(data?.regions ?? [])].sort((a, b) => b.respondents - a.respondents);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Geographic Intelligence" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">KONTA MOY Retail Observatory · Admin only</div>
      <h1>Γεωγραφικό Βαρόμετρο Λιανεμπορίου</h1>
      <p className="lead">Διαδραστικός χάρτης Ελλάδας · ΚΑΔ · απαντήσεις · περιφερειακή σύγκριση.</p>
      <div className="hero-actions">
        <Link prefetch={false} className="button button-secondary" href={root + "/barometer"}>Ζωντανό Βαρόμετρο</Link>
        <Link prefetch={false} className="button button-secondary" href={root + "/responses"}>Απαντήσεις</Link>
      </div>
    </div></section>
    <ResearchSurveyAdminNav slug={slug} current="map" />
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Geographic Intelligence" title="Φίλτρα ανάλυσης"
        note="Η γεωγραφία προέρχεται από τη διεύθυνση επιχείρησης του παγωμένου μητρώου GEMI. Δεν αποτελεί εντοπισμό του ερωτώμενου ούτε ζωντανό GPS." />
      {error ? <div role="alert" className="workspace-inline-note form-error">
        Τα γεωγραφικά στατιστικά είναι προσωρινά μη διαθέσιμα. Δεν παρουσιάζονται πλασματικές ή παλιές τιμές.
      </div> : data && filters && <>
        <form method="get" action={root + "/map"} className="workspace-queue-card"
          style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(195px,1fr))" }}>
            <label style={{ display: "grid", gap: 6 }}>Κατάσταση ερωτηματολογίου
              <select name="mode" defaultValue={filters.mode}>
                <option value="completed">Οριστικά υποβληθέντα</option>
                <option value="draft">Αποθηκευμένα · μη οριστικά</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>Φάση
              <select name="phase" defaultValue={filters.phase}>
                <option value="main">Κύρια έρευνα</option>
                <option value="pilot">Πιλοτική</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>Χρωματισμός χάρτη
              <select name="metric" defaultValue={filters.metric}>
                <option value="density">Πλήθος συμμετοχών</option>
                <option value="share">Ποσοστό συγκεκριμένης απάντησης</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>Κλάδος
              <select name="sector" defaultValue={filters.sector}>
                <option value="">Όλοι οι κλάδοι</option>
                {data.sectors.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>Συγκεκριμένος ΚΑΔ
              <select name="kad" defaultValue={filters.kad}>
                <option value="">Όλοι οι ΚΑΔ</option>
                {data.kads.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>Νομός / Π.Ε.
              <select name="prefecture" defaultValue={filters.prefecture}>
                <option value="">Όλοι οι νομοί</option>
                {data.prefectureOptions.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>Δήμος (GEMI)
              <select name="municipality" defaultValue={filters.municipality}>
                <option value="">Όλοι οι Δήμοι</option>
                {data.municipalities.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>Ερώτηση
              <select name="question" defaultValue={filters.question}>
                {data.questions.map(item => <option key={item.code} value={item.code}>{item.code} · {item.label}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>Επιλογή απάντησης
              <select name="answer" defaultValue={filters.answer}>
                {question?.options.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <input type="hidden" name="region" value={filters.region} />
          <div className="workspace-action-bar" style={{ gap: 12, flexWrap: "wrap" }}>
            <span><small>Αλλάξτε πρώτα την ερώτηση και εφαρμόστε, ώστε να ανανεωθούν οι διαθέσιμες απαντήσεις.</small></span>
            <div className="workspace-action-buttons">
              <Link prefetch={false} href={root + "/map"} className="button button-secondary">Καθαρισμός</Link>
              <button type="submit" className="button">Εφαρμογή φίλτρων</button>
            </div>
          </div>
        </form>

        <div className="workspace-inline-note" role="status" style={{ marginTop: 14 }}>
          <strong>{filters.mode === "draft" ? "ΠΡΟΣΩΡΙΝΗ ανάλυση αποθηκευμένων απαντήσεων" : "Οριστικοποιημένες συμμετοχές"} · {filters.phase === "pilot" ? "Pilot" : "Main"}</strong>
          <p style={{ margin: "6px 0 0" }}>
            Η απεικόνιση είναι μη σταθμισμένη και περιγραφική. Κανένα σημείο δεν αντιστοιχεί σε συγκεκριμένο συμμετέχοντα.
            Μικρά κελιά αποκρύπτονται (n&lt;5 πλήθος, n&lt;10 ποσοστά).
            Οι μη οριστικές απαντήσεις δεν προσμετρώνται στα επίσημα αποτελέσματα.
          </p>
        </div>
        <div className="analytics-workflow-grid" style={{ marginTop: 15 }}>
          <article className="analytics-workflow-card"><span>Επιλεγμένες συμμετοχές</span>
            <strong style={{ fontSize: "1.5rem" }}>{integer(data.total)}</strong>
            <small>Ανά κατάσταση, φάση, κλάδο και τοποθεσία.</small>
          </article>
          <article className="analytics-workflow-card"><span>Απάντησαν στην {filters.question}</span>
            <strong style={{ fontSize: "1.5rem" }}>{integer(data.answered)}</strong>
            <small>Βάση υπολογισμού της κατανομής.</small>
          </article>
          <article className="analytics-workflow-card"><span>Επέλεξαν «{option?.label ?? filters.answer}»</span>
            <strong style={{ fontSize: "1.5rem" }}>{data.answered < 10 ? "—" : share(data.selected, data.answered)}</strong>
            <small>Από τις έγκυρες απαντήσεις (όχι από τις προσκλήσεις).</small>
          </article>
          <article className="analytics-workflow-card"><span>Αταξινόμητη γεωγραφία</span>
            <strong style={{ fontSize: "1.5rem" }}>{integer(data.unresolved)}</strong>
            <small>Δεν αποδίδεται αυθαίρετα σε κάποια Περιφέρεια.</small>
          </article>
        </div>
        <section className="vendor-section" style={{ marginTop: 18 }}>
          <WorkspaceSectionHeading eyebrow="Χάρτης" title={filters.metric === "density" ? "Κατανομή δείγματος" : "Θερμικός χάρτης απαντήσεων"}
            note={filters.metric === "density"
              ? "Ένταση ανά αριθμό διαθέσιμων ερωτηματολογίων (λογαριθμική κλίμακα για συγκρίσιμη απόδοση). Δεν μετρά την πυκνότητα επιχειρήσεων."
              : "Χρώμα = ποσοστό που επέλεξε τη συγκεκριμένη απάντηση μεταξύ όσων απάντησαν στην ερώτηση ανά Περιφέρεια. Τα n<10 είναι άγνωστα, όχι 0%."} />
          <GreeceResearchHeatmap cells={data.regions} filters={filters} root={root} />
        </section>
        {focus && sample && <section className="vendor-section" style={{ marginTop: 16 }}>
          <div className="workspace-action-bar">
            <span><strong>{focus.label} · Ανάλυση Περιφέρειας</strong></span>
            <Link prefetch={false} className="button button-secondary" href={root + "/map?" + new URLSearchParams(
              Object.entries(filters).filter(([k, v]) => k !== "region" && !!v)
            ).toString()}>Επιστροφή σε όλη την Ελλάδα</Link>
          </div>
          <p>{integer(sample.respondents)} ερωτηματολόγια · {integer(sample.answered)} έγκυρες απαντήσεις στην {filters.question} ·
            {" "}{sample.answered >= 10 && sample.respondents >= 10
              ? share(sample.selected, sample.answered) + " επέλεξαν «" + (option?.label ?? filters.answer) + "»"
              : "ανεπαρκής βάση για δημοσίευση ποσοστού"}.</p>
          <div className="workspace-queue-card">
            <strong>Νομοί / Περιφερειακές ενότητες</strong>
            {data.prefectures.filter(p => p.region === focus.key).sort((a, b) => b.respondents - a.respondents)
              .map(p => <div key={p.name} className="workspace-action-bar">
                <span>{p.name}</span>
                <small>{p.respondents < 5 ? "n<5" : integer(p.respondents) + " συμμετοχές"}
                  {" · "}{p.answered < 10 || p.respondents < 10 ? "Ανεπαρκής βάση" : share(p.selected, p.answered)}</small>
              </div>)}
          </div>
        </section>}
        <section className="vendor-section" style={{ marginTop: 18 }}>
          <WorkspaceSectionHeading eyebrow="Συγκριτικός πίνακας" title="Οι 13 Περιφέρειες"
            note="Η ανά Περιφέρεια απάντηση εμφανίζεται μόνο με επαρκή βάση n≥10. Η άγνωστη γεωγραφία εξαιρείται από τη χωρική κατανομή." />
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
            <thead><tr><th style={{ textAlign: "left", padding: 10 }}>Περιφέρεια</th><th>Συμμετοχές</th><th>Βάση ερώτησης</th><th>Επιλεγμένη απάντηση</th></tr></thead>
            <tbody>{displayedRegions.map(r => <tr key={r.key} style={{ borderTop: "1px solid var(--border, #ddd)" }}>
              <td style={{ padding: 10 }}>{r.label}</td>
              <td style={{ textAlign: "center" }}>{r.respondents < 5 ? (r.respondents ? "n<5" : "—") : integer(r.respondents)}</td>
              <td style={{ textAlign: "center" }}>{r.answered < 10 ? (r.answered ? "n<10" : "—") : integer(r.answered)}</td>
              <td style={{ textAlign: "center" }}>{r.answered < 10 || r.respondents < 10 ? "Ανεπαρκής βάση" : share(r.selected, r.answered)}</td>
            </tr>)}</tbody>
          </table></div>
        </section>
        <div className="workspace-inline-note" style={{ marginTop: 14 }}>
          <strong>Δεοντολογία / μεθοδολογία:</strong> Η προέλευση τόπου αφορά την εγγεγραμμένη επιχείρηση (GEMI), όχι
          την τρέχουσα θέση του ερωτώμενου. Δεν υπάρχουν προσωπικές καρφίτσες, e-mails, στοιχεία ατομικών επιχειρήσεων
          ή δυνατότητα ανάκτησης μεμονωμένων απαντήσεων από τον χάρτη.
          Η δημόσια προβολή απαιτεί εγκεκριμένη δημοσίευση και έλεγχο αποκαλυπτικότητας μετά από συνδυασμό φίλτρων.
          Στιγμιότυπο: {new Date(data.capturedAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}.
        </div>
      </>}
    </section>
  </main>;
}
