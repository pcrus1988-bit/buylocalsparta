import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../../components/AdminWorkspaceHeader";
import { ResearchSurveyAdminNav } from "../../../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceSectionHeading } from "../../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../../lib/admin-session";
import { rawResearchAnswerAccess } from "../../../../../../../lib/research-survey-response-admin";
import {
  listResearchFreeText, RESEARCH_FREE_TEXT_PAGE_SIZE
} from "../../../../../../../lib/research-free-text-admin";
import {
  RESEARCH_FREE_TEXT_CATEGORIES, RESEARCH_FREE_TEXT_OTHER
} from "../../../../../../../lib/research-free-text-categories";

export const metadata: Metadata = {
  title: "Admin · Κατηγοριοποίηση ελεύθερων απαντήσεων",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

const topics = [...RESEARCH_FREE_TEXT_CATEGORIES, RESEARCH_FREE_TEXT_OTHER];
const integer = (value: number) => value.toLocaleString("el-GR");

function greekDate(value: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("el-GR", {
    timeZone: "Europe/Athens", dateStyle: "medium", timeStyle: "short"
  });
}

export default async function FreeTextResponsesPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    category?: string; question?: string; status?: string; q?: string; page?: string;
  }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug } = await params;
  const rawAllowed = rawResearchAnswerAccess(principal);
  const requested = await searchParams;
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);
  const path = root + "/responses/free-text";
  let data: Awaited<ReturnType<typeof listResearchFreeText>> | undefined;
  let unavailable = false;
  if (rawAllowed) {
    try {
      data = await listResearchFreeText(principal, slug, requested);
    } catch (error) {
      unavailable = true;
      console.error(JSON.stringify({
        event: "research.free_text.admin_unavailable",
        type: error instanceof Error ? error.name : "unknown"
      }));
    }
    if (!unavailable && !data) notFound();
  }
  const f = data?.filters;
  const url = (overrides: Record<string, string>) => {
    const params = new URLSearchParams({
      ...(f?.status ? { status: f.status } : {}),
      ...(f?.question ? { question: f.question } : {}),
      ...(f?.search ? { q: f.search } : {}),
      ...(f?.category ? { category: f.category } : {}),
      ...overrides
    });
    for (const [key, value] of [...params.entries()]) if (!value) params.delete(key);
    return path + (params.size ? "?" + params.toString() : "");
  };
  const facetMap = new Map(data?.facets.map(item => [item.key, item.count]) ?? []);
  const maxCount = Math.max(1, ...[...facetMap.values()]);
  const lastPage = data ? Math.max(1, Math.ceil(data.matchingTotal / RESEARCH_FREE_TEXT_PAGE_SIZE)) : 1;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Free-text analysis" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">KONTA MOY Research Observatory · Admin only</div>
        <h1>Ελεύθερες απαντήσεις · Θεματική κατηγοριοποίηση</h1>
        <p className="lead">Όλες οι διαθέσιμες ανοικτές απαντήσεις, οι λέξεις των ίδιων των συμμετεχόντων και ένα πρακτικό φίλτρο θεμάτων.</p>
        <div className="hero-actions">
          <Link prefetch={false} href={root + "/responses"} className="button button-secondary">Όλα τα ερωτηματολόγια</Link>
          <Link prefetch={false} href={root + "/barometer"} className="button button-secondary">Live Barometer</Link>
        </div>
      </div>
    </section>
    <ResearchSurveyAdminNav slug={slug} current="free-text" />
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ποιοτικά ευρήματα" title="Αναζήτηση και φίλτρα"
        note="Οι θεματικές ετικέτες παράγονται με διαφανείς λέξεις-κλειδιά. Μια απάντηση μπορεί να ανήκει σε περισσότερα από ένα θέματα. Το αυθεντικό κείμενο δεν τροποποιείται." />
      {!rawAllowed ? <div className="workspace-inline-note" role="alert">
        Η προβολή πλήρων ελεύθερων απαντήσεων απαιτεί δικαίωμα Research analysis/management.
      </div> : unavailable ? <div className="workspace-inline-note form-error" role="alert">
        Δεν ήταν δυνατή η ανάκτηση των απαντήσεων από τη βάση. Δεν προβάλλονται υποθετικά πλήθη. Ανανεώστε τη σελίδα.
      </div> : data && <>
        <div className="workspace-queue-card">
          <div className="workspace-action-bar" style={{ flexWrap: "wrap", gap: 16 }}>
            <span><strong>{integer(data.scopedTotal)}</strong> <small>Απαντήσεις στο επιλεγμένο δείγμα</small></span>
            <span><strong>{integer(data.matchingTotal)}</strong> <small>Απαντήσεις μετά το θεματικό φίλτρο</small></span>
            <span><strong>{integer(data.rows.length)}</strong> <small>Στην τρέχουσα σελίδα</small></span>
          </div>
          <small>Περιλαμβάνονται αποθηκευμένες απαντήσεις από οριστικοποιημένα και μη οριστικοποιημένα ερωτηματολόγια. Αποσυρμένες απαντήσεις αποκλείονται. Δεν γίνεται αυτόματη δημοσίευση.</small>
        </div>
        <form action={path} method="get" className="workspace-queue-card"
          style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", marginTop: 14 }}>
          <label style={{ display: "grid", gap: 6, flex: "2 1 240px" }}>Αναζήτηση στο κείμενο
            <input type="search" name="q" maxLength={120} defaultValue={f?.search} placeholder="Αναζήτηση λέξης ή φράσης" />
          </label>
          <label style={{ display: "grid", gap: 6, flex: "1 1 180px" }}>Θέμα
            <select name="category" defaultValue={f?.category ?? ""}>
              <option value="">Όλα τα θέματα</option>
              {topics.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, flex: "1 1 170px" }}>Κατάσταση
            <select name="status" defaultValue={f?.status ?? ""}>
              <option value="">Όλες οι ενεργές απαντήσεις</option>
              <option value="completed">Οριστικά υποβληθείσες</option>
              <option value="in_progress">Σε εξέλιξη / προσχέδια</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, flex: "1 1 190px" }}>Ερώτηση
            <select name="question" defaultValue={f?.question ?? ""}>
              <option value="">Όλες οι ερωτήσεις ανοικτού κειμένου</option>
              {data.questions.map(q => <option key={q.code} value={q.code}>{q.code} · {q.prompt.slice(0, 60)}</option>)}
            </select>
          </label>
          <button type="submit" className="button">Εφαρμογή φίλτρων</button>
          <Link prefetch={false} className="button button-secondary" href={path}>Καθαρισμός</Link>
        </form>
        <section style={{ marginTop: 22 }}>
          <WorkspaceSectionHeading eyebrow="Θεματικές περιοχές" title="Κατανομή καταχωρισμένων σχολίων"
            note="Οι αριθμοί είναι καταμετρήσεις απαντήσεων, όχι ξεχωριστών συμμετεχόντων. Επειδή επιτρέπονται πολλαπλές θεματικές ετικέτες, τα αθροίσματα ενδέχεται να υπερβαίνουν το σύνολο." />
          <div className="analytics-workflow-grid">
            {topics.map(topic => {
              const count = facetMap.get(topic.key) ?? 0;
              return <Link prefetch={false} key={topic.key} href={url({ category: f?.category === topic.key ? "" : topic.key, page: "" })}
                className="analytics-workflow-card" aria-current={f?.category === topic.key ? "true" : undefined}
                style={{ textDecoration: "none", color: "inherit", display: "grid", gap: 9 }}>
                <span>{topic.label}</span>
                <strong>{integer(count)}</strong>
                <div role="img" aria-label={topic.label + ": " + integer(count) + " απαντήσεις"}
                  style={{ height: 9, background: "var(--surface-muted, #e5e7eb)", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: (count / maxCount * 100) + "%", background: "var(--accent, #2563eb)" }} />
                </div>
                <small>{f?.category === topic.key ? "Επιλεγμένο · πατήστε για αφαίρεση" : "Εμφάνιση απαντήσεων"}</small>
              </Link>;
            })}
          </div>
        </section>
        <section style={{ marginTop: 24 }}>
          <WorkspaceSectionHeading eyebrow="Αυθεντικές καταχωρίσεις" title={"Απαντήσεις · " + integer(data.matchingTotal)}
            note="Η πιο πρόσφατη αποθήκευση εμφανίζεται πρώτη. Κάθε κείμενο είναι αυτούσιο, με σύνδεσμο στο ερωτηματολόγιο. Αποθηκευμένα προσχέδια μπορεί να αλλάξουν." />
          {data.rows.length === 0 ? <div className="workspace-inline-note">Δεν βρέθηκαν απαντήσεις με αυτά τα φίλτρα.</div>
            : <div style={{ display: "grid", gap: 12 }}>
              {data.rows.map(row => <article key={row.answerId} className="workspace-queue-card" style={{ display: "grid", gap: 10 }}>
                <div className="workspace-action-bar" style={{ flexWrap: "wrap", gap: 10 }}>
                  <strong>{row.questionCode}</strong>
                  <small>{row.status === "completed" ? "Οριστικοποιημένο" : "Σε εξέλιξη"}</small>
                  <small>{greekDate(row.answeredAt)}</small>
                </div>
                <small>{row.question}</small>
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0, fontSize: "1.03rem" }}>{row.text}</p>
                <div className="workspace-action-bar" style={{ flexWrap: "wrap", gap: 8 }}>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {row.categories.map(key => <small key={key} className="workspace-inline-note" style={{ padding: "4px 7px" }}>
                      {topics.find(topic => topic.key === key)?.label ?? key}
                    </small>)}
                  </span>
                  <Link prefetch={false} className="button button-secondary"
                    href={root + "/responses/" + encodeURIComponent(row.responseId)}>Προβολή ερωτηματολογίου</Link>
                </div>
              </article>)}
            </div>}
          <div className="workspace-action-bar" style={{ flexWrap: "wrap", gap: 12, marginTop: 16 }}>
            <span>Σελίδα {integer(f?.page ?? 1)} από {integer(lastPage)} · έως {RESEARCH_FREE_TEXT_PAGE_SIZE} εγγραφές ανά σελίδα</span>
            <div className="workspace-action-buttons">
              {(f?.page ?? 1) > 1 && <Link prefetch={false} className="button button-secondary"
                href={url({ page: String((f?.page ?? 1) - 1) })}>← Προηγούμενη</Link>}
              {(f?.page ?? 1) < lastPage && <Link prefetch={false} className="button button-secondary"
                href={url({ page: String((f?.page ?? 1) + 1) })}>Επόμενη →</Link>}
            </div>
          </div>
        </section>
        <div className="workspace-inline-note" style={{ marginTop: 18 }}>
          <strong>Ερμηνεία:</strong> Η κατηγοριοποίηση είναι αυτοματοποιημένη και ενδεικτική· δεν αποτελεί επαληθευμένη ποιοτική κωδικοποίηση ή δημοσιευμένο αποτέλεσμα.
          Τα μη ταξινομημένα σχόλια παραμένουν ορατά στα «Λοιπά». Πρόσβαση μόνο σε εξουσιοδοτημένους διαχειριστές.
        </div>
      </>}
    </section>
  </main>;
}
