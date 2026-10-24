import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../components/AdminWorkspaceHeader";
import { ResearchSurveyAdminNav } from "../../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceSectionHeading } from "../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { researchExperimentAnalytics } from "../../../../../../lib/research-experiment-analytics";

export const metadata: Metadata = {
  title: "Admin · Αναλυτική Μηχανή Έρευνας",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

const integer = (value: number) => new Intl.NumberFormat("el-GR").format(value);
const percent = (value: number | null) =>
  value == null ? "—" : value.toLocaleString("el-GR", { maximumFractionDigits: 1 }) + "%";

const ATTRIBUTE_LABELS: Record<string, string> = {
  reach: "Γεωγραφική εμβέλεια",
  catalog: "Εισαγωγή καταλόγου",
  operations: "Εργασίες πλατφόρμας",
  stock_sync: "Συγχρονισμός αποθέματος",
  commission_pct: "Προμήθεια (%)",
  monthly_fee_eur: "Μηνιαία συνδρομή (€)",
  customer_relationship: "Σχέση με πελάτη"
};
const LEVEL_LABELS: Record<string, string> = {
  local: "Τοπικά",
  national: "Πανελλαδικά",
  local_national: "Τοπικά και πανελλαδικά",
  manual: "Χειροκίνητα",
  single_import: "Εφάπαξ εισαγωγή",
  automatic_sync: "Αυτόματος συγχρονισμός",
  listing_only: "Μόνο καταχώριση",
  payments_shipping_returns: "Πληρωμές, αποστολές και επιστροφές",
  none: "Χωρίς συγχρονισμό",
  daily: "Καθημερινά",
  realtime: "Σε πραγματικό χρόνο",
  platform_only: "Μέσω πλατφόρμας",
  merchant_access: "Πρόσβαση εμπόρου"
};

export default async function ResearchAnalyticsPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ phase?: string; mode?: string }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug } = await params;
  const filters = await searchParams;
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);

  let data: Awaited<ReturnType<typeof researchExperimentAnalytics>>;
  let unavailable = false;
  try {
    data = await researchExperimentAnalytics(principal, slug, filters);
  } catch (error) {
    unavailable = true;
    console.error(JSON.stringify({
      event: "research.analytics.admin_unavailable",
      errorName: error instanceof Error ? error.name : "unknown"
    }));
  }
  if (!unavailable && !data) notFound();
  const attributes = [...new Set(data?.attributes.map((item) => item.attribute) ?? [])];

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Analytical Engine" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">KONTA MOY Research · Strictly internal</div>
        <h1>Αναλυτική Μηχανή Έρευνας</h1>
        <p className="lead">Εσωτερική εξερευνητική ανάλυση πειραματικών επιλογών, ποιότητας
          και ετοιμότητας για την τελική σταθμισμένη αξιολόγηση.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" prefetch={false} href={root + "/evaluation"}>
            Κλειδωμένο σχέδιο ανάλυσης
          </Link>
          <Link className="button button-secondary" prefetch={false} href={root + "/barometer"}>
            Ζωντανό βαρόμετρο
          </Link>
          <Link className="button button-secondary" prefetch={false} href={root + "/quality"}>
            Έλεγχος ποιότητας
          </Link>
        </div>
      </div>
    </section>
    <ResearchSurveyAdminNav slug={slug} current="analytics" />
    <section className="shell vendor-section">
      <div className="workspace-inline-note" role="note">
        <strong>Αποκλειστικά για τον διαχειριστή · δεν δημοσιεύεται.</strong>
        <p style={{ marginBottom: 0 }}>Το πείραμα επιλογών αγοράς δεν τροφοδοτεί
          δημόσιες σελίδες, δημοσιευμένα αποτελέσματα ή δελτία Τύπου.
          Αυτοί οι αριθμοί είναι προσωρινοί, μη σταθμισμένοι και δεν αποτελούν
          επίσημα αποτελέσματα ή απόδειξη αιτιότητας.</p>
      </div>
      <form method="get" action={root + "/analytics"} className="workspace-queue-card"
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", marginTop: 16 }}>
        <label style={{ display: "grid", gap: 6, flex: "1 1 190px" }}>Φάση
          <select name="phase" defaultValue={data?.phase ?? (filters.phase === "pilot" ? "pilot" : "main")}>
            <option value="main">Κύρια έρευνα</option>
            <option value="pilot">Πιλοτική έρευνα</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 6, flex: "1 1 210px" }}>Υποβολή
          <select name="mode" defaultValue={data?.mode ?? (filters.mode === "draft" ? "draft" : "completed")}>
            <option value="completed">Ολοκληρωμένες απαντήσεις</option>
            <option value="draft">Πρόχειρες · μη οριστικοποιημένες</option>
          </select>
        </label>
        <button type="submit" className="button">Ενημέρωση ανάλυσης</button>
      </form>
      {unavailable ? <div className="workspace-inline-note form-error" role="alert">
        Δεν είναι διαθέσιμη η αναλυτική βάση αυτή τη στιγμή. Δεν προβάλλονται υποθετικά δεδομένα.
      </div> : data && <>
        <WorkspaceSectionHeading eyebrow="Πηγή: καταγεγραμμένες τυχαίες επιλογές"
          title="Τι επέλεξαν οι συμμετέχοντες"
          note="Οι εκκρεμείς/αποκλεισμένες ποιοτικές αξιολογήσεις εξαιρούνται. Ο ίδιος συμμετέχων μπορεί να έχει περισσότερες από μία πειραματικές δοκιμές." />
        <div className="analytics-workflow-grid">
          {([
            ["Συμμετέχοντες με ανάθεση", data.respondents],
            ["Απαντημένες δοκιμές", data.answeredTasks],
            ["Επιλογή Α", data.chosenA],
            ["Επιλογή Β", data.chosenB],
            ["Καμία επιλογή", data.chosenNeither],
            ["Εκκρεμείς δοκιμές", data.unansweredTasks]
          ] as const).map(([label, value]) => <article key={label} className="analytics-workflow-card">
            <small>{label}</small>
            <strong style={{ fontSize: "1.55rem" }}>{integer(value)}</strong>
          </article>)}
        </div>
        <div className="workspace-inline-note" style={{ marginTop: 14 }}>
          <strong>Βάση υπολογισμού:</strong> {integer(data.answeredTasks)} απαντημένες από{" "}
          {integer(data.assignedTasks)} ανατεθειμένες δοκιμές. Η επιλογή «καμία» μετρά ως
          έγκυρη απάντηση, ενώ η αναπάντητη δοκιμή δεν μετατρέπεται σε αρνητική επιλογή.
          {data.mode === "draft" && <p><strong>Προσοχή:</strong> τα προσχέδια μπορούν να αλλάξουν πριν από την οριστική υποβολή.</p>}
        </div>

        <section className="vendor-section" style={{ marginTop: 22 }}>
          <WorkspaceSectionHeading eyebrow="Πειραματικά χαρακτηριστικά"
            title="Ποιες ιδιότητες σχετίζονται με τις επιλογές;"
            note="Για κάθε επίπεδο: πόσες φορές προσφέρθηκε και σε πόσες από αυτές επιλέχθηκε. Περιγραφική συχνότητα επί των εμφανίσεων, όχι αυτόνομη αιτιώδης επίδραση ή ζήτηση αγοράς." />
          {attributes.length === 0 ? <div className="workspace-inline-note">
            Δεν υπάρχουν απαντημένες δοκιμές με αναλύσιμες παραμέτρους στα συγκεκριμένα φίλτρα.
          </div> : attributes.map((attribute) => <details className="workspace-queue-card"
              key={attribute} style={{ marginBottom: 12 }} open={attribute === attributes[0]}>
            <summary style={{ cursor: "pointer" }}>
              <strong>{ATTRIBUTE_LABELS[attribute] ?? attribute}</strong>
            </summary>
            <div style={{ display: "grid", gap: 13, marginTop: 14 }}>
              {data.attributes.filter((item) => item.attribute === attribute).map((item) =>
                <div key={item.level} style={{ display: "grid", gap: 4 }}>
                  <div className="workspace-action-bar" style={{ flexWrap: "wrap", gap: 6 }}>
                    <strong>{LEVEL_LABELS[item.level] ?? item.level}</strong>
                    <small>{item.choiceRate === null ? "Μικρή βάση · απόκρυψη ποσοστού" :
                      percent(item.choiceRate) + " · " + integer(item.chosen) + " / " +
                      integer(item.exposed) + " εμφανίσεις"}</small>
                  </div>
                  {item.choiceRate !== null && <div role="img"
                    aria-label={(LEVEL_LABELS[item.level] ?? item.level) + ": " + percent(item.choiceRate)}
                    style={{ background: "var(--surface-muted, #e5e7eb)", height: 10, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{
                      width: Math.max(0, Math.min(100, item.choiceRate)) + "%",
                      background: "var(--accent, #2563eb)", height: "100%", borderRadius: 12
                    }} />
                  </div>}
                </div>)}
            </div>
          </details>)}
          <small>Τα επίπεδα με λιγότερες από 30 εμφανίσεις δεν εμφανίζουν ποσοστό.
            Οι επιδράσεις μεταξύ ιδιοτήτων χρειάζονται επίσημη μοντελοποίηση
            με την τυχαιοποίηση και την επανάληψη δοκιμών ανά συμμετέχοντα.</small>
        </section>

        <section className="vendor-section" style={{ marginTop: 22 }}>
          <WorkspaceSectionHeading eyebrow="Ασφάλεια συμπερασμάτων" title="Ετοιμότητα τελικής ανάλυσης"
            note="Η επίσημη διαδικασία παραμένει ξεχωριστή από αυτόν τον εξερευνητικό πίνακα." />
          <div className="analytics-workflow-grid">
            <article className="analytics-workflow-card"><small>Απαντήσεις υπό ποιοτικό έλεγχο</small>
              <strong>{integer(data.qaPending)}</strong></article>
            <article className="analytics-workflow-card"><small>Αποκλεισμένες απαντήσεις</small>
              <strong>{integer(data.qaExcluded)}</strong></article>
            <article className="analytics-workflow-card"><small>Κλειδωμένο σχέδιο</small>
              <strong style={{ overflowWrap: "anywhere", fontSize: "1rem" }}>
                {data.lockedPlanVersion ?? "Δεν βρέθηκε"}</strong></article>
            <article className="analytics-workflow-card"><small>Τελευταία επίσημη εκτέλεση</small>
              <strong>{data.lastOfficialRunStatus ?? "Δεν έχει εκτελεστεί"}</strong></article>
          </div>
          <div className="workspace-inline-note" style={{ marginTop: 14 }}>
            Η τελική σταθμισμένη ανάλυση επιτρέπεται μόνο βάσει του κλειδωμένου
            σχεδίου, μετά τη διευθέτηση εκκρεμών ελέγχων και των απαιτούμενων
            επαληθεύσεων. Η προβολή αυτής της σελίδας δεν ενεργοποιεί
            jobs, δεν επηρεάζει τη ζωντανή έρευνα και δεν δημοσιεύει τίποτα.
          </div>
          <small>Χρόνος ανάγνωσης (Αθήνα): {new Date(data.generatedAt).toLocaleString("el-GR", {
            timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "medium"
          })}</small>
        </section>
      </>}
    </section>
  </main>;
}
