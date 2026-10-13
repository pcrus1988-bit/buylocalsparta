import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../components/AdminWorkspaceHeader";
import { ResearchBarometerAutoRefresh } from "../../../../../../components/ResearchBarometerAutoRefresh";
import { ResearchSurveyAdminNav } from "../../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceSectionHeading } from "../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { researchLiveBarometer, BAROMETER_MAX_CASES } from "../../../../../../lib/research-live-barometer-runtime";
import type { BarometerCategory, BarometerBreakdown } from "../../../../../../lib/research-live-barometer-core";

export const metadata: Metadata = {
  title: "Admin · Ζωντανό Βαρόμετρο Ελληνικού Λιανεμπορίου",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

const dateTime = (iso: string) => new Date(iso).toLocaleString("el-GR", {
  timeZone: "Europe/Athens", day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit"
});
const integer = (v: number) => new Intl.NumberFormat("el-GR").format(v);
const decimal = (v: number) => new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1 }).format(v);
const boundedWidth = (value: number) => Math.max(0, Math.min(100, value)) + "%";

function DistributionBars({ items }: { items: readonly BarometerCategory[] }) {
  return <div style={{ display: "grid", gap: 9 }}>
    {items.map(item => <div key={item.key} style={{ display: "grid", gap: 4 }}>
      <div className="workspace-action-bar" style={{ gap: 12, flexWrap: "wrap" }}>
        <span>{item.label}</span>
        <strong style={{ whiteSpace: "nowrap" }}>{integer(item.count)} · {decimal(item.percent)}%</strong>
      </div>
      <div role="img" aria-label={item.label + " " + decimal(item.percent) + "%"}
        style={{ background: "var(--surface-muted, #e5e7eb)", height: 10, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ background: "var(--accent, #2563eb)", height: "100%", width: boundedWidth(item.percent), borderRadius: 12 }} />
      </div>
    </div>)}
  </div>;
}
function QuestionPanel({ q, index }: { q: BarometerBreakdown; index: number }) {
  return <details key={q.code} open={index === 0} className="workspace-queue-card" style={{ marginBottom: 12 }}>
    <summary style={{ cursor: "pointer", display: "grid", gap: 5, padding: 4 }}>
      <small><strong>{q.code}</strong> · {q.section} · {q.type} · βάση n={integer(q.base)}</small>
      <strong>{q.prompt}</strong>
    </summary>
    <div style={{ marginTop: 16 }}>
      {q.omitted ? <p className="workspace-inline-note">{q.omitted}</p>
      : q.type === "matrix" && q.matrix ? <div style={{ display: "grid", gap: 18 }}>
        {q.matrix.map(item => <div key={item.key} style={{ display: "grid", gap: 8 }}>
          <div className="workspace-action-bar" style={{ flexWrap: "wrap" }}>
            <strong>{item.label}</strong><small>βάση n={integer(item.base)}</small>
          </div>
          {item.base < 5 ? <small>Ανεπαρκής βάση για εμφάνιση κατανομής.</small>
            : <DistributionBars items={item.categories} />}
        </div>)}
      </div> : <>
        {q.mean !== undefined && <p><strong>Μέσος όρος:</strong> {decimal(q.mean)}</p>}
        <DistributionBars items={q.categories} />
        {q.type === "multi" && <small>Πολλαπλές επιλογές: τα ποσοστά μπορούν να υπερβαίνουν αθροιστικά το 100%.</small>}
      </>}
    </div>
  </details>;
}

export default async function ResearchLiveBarometerPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string; phase?: string }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug } = await params;
  const query = await searchParams;
  let data: Awaited<ReturnType<typeof researchLiveBarometer>> | undefined;
  let unavailable = false;
  try {
    data = await researchLiveBarometer(principal, slug, query);
  } catch (error) {
    unavailable = true;
    console.error(JSON.stringify({
      event: "research.barometer.admin_unavailable",
      type: error instanceof Error ? error.name : "unknown"
    }));
  }
  if (!unavailable && !data) notFound();
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);
  const mode = data?.mode ?? (query.mode === "completed" ? "completed" : "draft");
  const phase = data?.phase ?? (query.phase === "pilot" ? "pilot" : "main");
  const sections = Array.from(new Set(data?.metrics.questions.map(q => q.section) ?? []));
  const maxTrend = Math.max(1, ...(data?.trend.map(d => d.started) ?? []));
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Live Barometer" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">KONTA MOY Research Observatory · Admin only</div>
        <h1>Ζωντανό Βαρόμετρο Λιανεμπορίου</h1>
        <p className="lead">Στατιστικά ανά ερώτηση, δείκτες και εξέλιξη συμμετοχής. Πληροφοριακή περιγραφική ανάλυση, χωρίς δημοσίευση.</p>
        <div className="hero-actions">
          <Link href={root + "/responses"} prefetch={false} className="button button-secondary">Απαντήσεις ερωτηματολογίων</Link>
          <Link href={root + "/evaluation"} prefetch={false} className="button button-secondary">Σχέδιο αξιολόγησης</Link>
        </div>
      </div>
    </section>
    <ResearchSurveyAdminNav slug={slug} current="barometer" />
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Πηγές δεδομένων" title="Φίλτρα και ενημέρωση"
        note="Οι μετρήσεις ανανεώνονται από τη βάση δεδομένων της έρευνας και δεν αποθηκεύονται ως επίσημα αποτελέσματα." />
      <form method="get" action={root + "/barometer"} className="workspace-queue-card"
        style={{ display: "flex", alignItems: "end", flexWrap: "wrap", gap: 12 }}>
        <label style={{ display: "grid", gap: 6, flex: "1 1 230px" }}>Είδος απαντήσεων
          <select name="mode" defaultValue={mode}>
            <option value="draft">Αποθηκευμένες · μη οριστικοποιημένες</option>
            <option value="completed">Επισήμως υποβληθείσες</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 6, flex: "1 1 180px" }}>Φάση έρευνας
          <select name="phase" defaultValue={phase}>
            <option value="main">Κύρια έρευνα</option>
            <option value="pilot">Πιλοτική έρευνα</option>
          </select>
        </label>
        <button type="submit" className="button">Εφαρμογή</button>
      </form>
      <ResearchBarometerAutoRefresh />
      {unavailable ? <div className="workspace-inline-note form-error" role="alert">
        Δεν ήταν δυνατή η ανάκτηση των τρεχόντων δεδομένων. Δεν εμφανίζονται υποθετικά στατιστικά.
      </div> : data && <>
        <small>Μελέτη: {data.title} · έκδοση ερωτηματολογίου {data.instrumentVersion} · ενημέρωση: {dateTime(data.capturedAt)}</small>
        <div className="workspace-inline-note" role="status" style={{ marginTop: 12 }}>
          <strong>{mode === "draft" ? "ΠΡΟΚΑΤΑΡΚΤΙΚΟ / μη οριστικοποιημένο" : "Επισήμως υποβληθέν δείγμα"}</strong>
          <p style={{ margin: "6px 0 0" }}>
            {mode === "draft"
              ? "Εμφανίζονται μόνο αποθηκευμένα προσχέδια (in_progress). Οι απαντήσεις μπορεί να αλλάξουν και δεν υποκαθιστούν την επίσημη υποβολή."
              : "Εμφανίζονται μόνο ερωτηματολόγια με ολοκληρωμένη υποβολή (completed)."}
            {" "}Οι δείκτες είναι μη σταθμισμένοι, περιγραφικοί και δεν αποτελούν αντιπροσωπευτική εκτίμηση του ελληνικού λιανεμπορίου.
          </p>
        </div>
        <div className="analytics-workflow-grid" style={{ marginTop: 16 }}>
          {([
            ["Σε επεξεργασία", data.statuses.drafts],
            ["Οριστικοποιημένα", data.statuses.completed],
            ["Αποσυρμένα", data.statuses.withdrawn],
            ["Με αποθηκευμένες απαντήσεις · επιλεγμένη κατάσταση", data.statuses.withAnswers],
            ["Απαντήσεις · επιλεγμένη κατάσταση", data.statuses.answerRows]
          ] as const).map(([label, value]) => <article className="analytics-workflow-card" key={label}>
            <span>{label}</span>
            <strong style={{ fontSize: "1.45rem" }}>{integer(value)}</strong>
          </article>)}
        </div>
        {data.truncated && <div className="workspace-inline-note form-error" style={{ marginTop: 12 }}>
          Το στατιστικό δείγμα είναι περιορισμένο στις τελευταίες {integer(BAROMETER_MAX_CASES)} καταχωρίσεις
          από {integer(data.eligibleCount)} της επιλεγμένης κατάστασης. Τα συνολικά πλήθη παραμένουν πλήρη.
          Οι μέσοι όροι και τα ποσοστά αφορούν μόνο αυτή τη μη τυχαία υποομάδα.
        </div>}
        <section className="vendor-section" style={{ marginTop: 18 }}>
          <WorkspaceSectionHeading eyebrow="Barometer" title="Τρεις δείκτες παρακολούθησης"
            note="Εφαρμόζεται η υπάρχουσα συνάρτηση βαθμολόγησης greek-retail-2026-v1, μόνο σε επαρκώς συμπληρωμένα σύνολα σχετικών ερωτήσεων. Δεν γίνεται συμπλήρωση ελλειπόντων απαντήσεων." />
          <div className="analytics-workflow-grid">
            {data.metrics.indicators.map(indicator => <article className="analytics-workflow-card" key={indicator.key}>
              <span>{indicator.label}</span>
              <strong style={{ fontSize: "1.7rem" }}>{indicator.average === undefined ? "—" : decimal(indicator.average) + " / 100"}</strong>
              {indicator.average !== undefined && <div
                role="img" aria-label={indicator.label + " " + decimal(indicator.average) + " στα 100"}
                style={{ width: "100%", borderRadius: 9, height: 12, background: "var(--surface-muted, #e5e7eb)", overflow: "hidden" }}>
                <div style={{ background: "var(--accent, #2563eb)", height: "100%", width: boundedWidth(indicator.average) }} />
              </div>}
              <small>Βάση: {integer(indicator.n)} κατάλληλα συμπληρωμένα ερωτηματολόγια</small>
              <small>{indicator.description}</small>
              {indicator.band && <small>Κατηγορία ψηφιακής ωριμότητας: {indicator.band}</small>}
              {indicator.average === undefined && <small>Χρειάζονται τουλάχιστον 10 επιλέξιμες απαντήσεις για την εμφάνιση μέσου δείκτη.</small>}
            </article>)}
          </div>
        </section>
        <section className="vendor-section" style={{ marginTop: 18 }}>
          <WorkspaceSectionHeading eyebrow="Ροή συμμετοχής" title="Ενάρξεις ερωτηματολογίων · τελευταίες 14 ημέρες"
            note="Η ημερομηνία έναρξης υπολογίζεται στη ζώνη ώρας Αθήνας. Η καμπύλη ακολουθεί την επιλεγμένη κατάσταση και φάση, όχι τη στιγμή αποθήκευσης κάθε απάντησης." />
          {data.trend.length === 0
            ? <div className="workspace-inline-note">Δεν υπάρχουν σχετικές ενάρξεις στο τελευταίο δεκατετραήμερο.</div>
            : <div className="workspace-queue-card" style={{ display: "grid", gap: 9 }}>
              {data.trend.map(day => <div key={day.day} style={{ display: "grid", gridTemplateColumns: "82px 1fr 48px", gap: 10, alignItems: "center" }}>
                <small>{day.day.slice(5)}</small>
                <div role="img" aria-label={day.day + ": " + integer(day.started) + " ενάρξεις"}
                  style={{ background: "var(--surface-muted, #e5e7eb)", height: 13, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: boundedWidth(day.started / maxTrend * 100), background: "var(--accent, #2563eb)" }} />
                </div>
                <strong style={{ textAlign: "right" }}>{integer(day.started)}</strong>
              </div>)}
            </div>}
        </section>
        <section className="vendor-section" style={{ marginTop: 18 }}>
          <WorkspaceSectionHeading eyebrow="Ερωτήσεις" title="Κατανομές όλων των ερωτήσεων"
            note="Κάθε ποσοστό υπολογίζεται επί όσων απάντησαν έγκυρα στη συγκεκριμένη ερώτηση ή υποερώτηση, όχι στο σύνολο των προσκλήσεων. Μόνο ερωτήσεις με n≥5 εμφανίζουν κατανομές." />
          <div className="workspace-inline-note">
            Προβάλλονται {integer(data.metrics.questions.length)} ερωτήσεις, ανά ενότητα.
            Οι ανοικτές απαντήσεις και τα πειραματικά δεδομένα δεν εμφανίζονται εδώ.
            Αποσυρμένα ερωτηματολόγια εξαιρούνται πλήρως. Κανένα στοιχείο δεν δημοσιεύεται αυτόματα.
          </div>
          {sections.map(section => <section key={section} style={{ marginTop: 18 }}>
            <h3>Ενότητα {section}</h3>
            {data.metrics.questions.filter(q => q.section === section).map((q, index) =>
              <QuestionPanel key={q.code} q={q} index={index} />)}
          </section>)}
        </section>
        <section className="vendor-section">
          <div className="workspace-inline-note">
            <strong>Ερμηνεία και μεθοδολογία:</strong> Παρακολούθηση λειτουργικών τάσεων, χωρίς στάθμιση ανά κλάδο/περιφέρεια,
            διόρθωση μη απόκρισης ή διαστήματα εμπιστοσύνης. Ενδιάμεσα αποτελέσματα δεν αποτελούν
            το δημοσιεύσιμο δείγμα. Η τελική ανάλυση ακολουθεί αποκλειστικά το κλειδωμένο σχέδιο
            της έρευνας και τους ελέγχους ποιότητας και συναίνεσης.
          </div>
        </section>
      </>}
    </section>
  </main>;
}
