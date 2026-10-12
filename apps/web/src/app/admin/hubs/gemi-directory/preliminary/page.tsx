import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../../lib/admin-runtime";
import { getAdminPostgresRuntime } from "../../../../../lib/postgres-runtime";
import { EXPANSION_HUBS } from "../../../../../lib/expansion-hubs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · GEMI preliminary HUB research distribution",
  robots: { index: false, follow: false }
};

type CandidateHub = Readonly<{
  candidate_hub_slug: string;
  municipality_names: string | number;
  research_records: string | number;
  auto_name_reviews: string | number;
}>;

/**
 * Reviewed ADMINISTRATIVE municipality name correspondence only. Approximate
 * municipality centres are NOT business premises or publishable HUB assignments.
 * Aggregate 104 tiny match rows, never scan/dump 313k research identities.
 */
export default async function PreliminaryGemiHubsPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!principal.roles.includes("super_admin") && !hasAdminPermission(principal, "vendor.manage")) {
    redirect("/admin");
  }

  const result = await getAdminPostgresRuntime().sqlPool.query<CandidateHub>(
    "SELECT m.candidate_hub_slug,count(*)::integer AS municipality_names," +
    "sum(m.matching_business_count)::bigint AS research_records," +
    "count(*) FILTER (WHERE EXISTS (SELECT 1 " +
    "FROM research_private.hub_gemi_municipality_review_events e " +
    "WHERE e.registry_municipality_id=m.registry_municipality_id " +
    "AND e.actor_user_id LIKE 'automation:%'))::integer AS auto_name_reviews " +
    "FROM research_private.hub_gemi_municipality_matches m " +
    "WHERE m.review_status='reviewed' AND m.candidate_hub_slug IS NOT NULL " +
    "GROUP BY m.candidate_hub_slug ORDER BY sum(m.matching_business_count) DESC"
  );
  const records = new Map(result.rows.map(row => [row.candidate_hub_slug,row]));
  const active = EXPANSION_HUBS
    .map(hub => ({ hub, aggregate: records.get(hub.slug) }))
    .filter(row => row.aggregate && Number(row.aggregate.research_records) > 0)
    .sort((a,b) => Number(b.aggregate!.research_records) - Number(a.aggregate!.research_records));
  const total = active.reduce((sum,row) => sum + Number(row.aggregate!.research_records),0);
  const automated = active.reduce((sum,row) => sum + Number(row.aggregate!.auto_name_reviews),0);
  const names = active.reduce((sum,row) => sum + Number(row.aggregate!.municipality_names),0);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="GEMI preliminary HUB research distribution" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Admin · Private research classification</div>
        <h1>Προκαταρκτική γεωγραφική εικόνα ΓΕΜΗ</h1>
        <p className="lead">Αυτόματη ομαδοποίηση προτάσεων βάσει ελεγμένης διοικητικής
          ταύτισης δήμου. Δεν σημαίνει επιβεβαίωση φυσικής διεύθυνσης,
          γεωγραφική ανάθεση εντός 25 χλμ., ιδιοκτησία ή δημόσια καταχώριση.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/hubs/gemi-directory">Εξέταση δήμων</Link>
          <Link className="button button-secondary" href="/admin/hubs/gemi-directory/worklist">Γεωκωδικοποίηση διευθύνσεων</Link>
          <Link className="button button-secondary" href="/admin/hubs/gemi-directory/evidence">Τεκμήρια διευθύνσεων</Link>
        </div>
      </div>
    </section>
    <section className="shell vendor-section">
      <div className="workspace-inline-note">
        <strong>Research-only · δεν δημιουργεί, αλλάζει ή δημοσιεύει σελίδες επιχειρήσεων.</strong>
        <p>Η παρακάτω αναφορά αφορά αποκλειστικά ενδεικτικά πληθυσμιακά
          μεγέθη μητρώου ανά πλησιέστερο κέντρο δήμου. Επιχειρήσεις εκτός
          του πραγματικού ορίου ή από γειτονικά νησιά μπορούν να μεταφερθούν
          σε άλλο HUB μετά από ανεξάρτητη επαλήθευση της ακριβούς διεύθυνσής τους.</p>
      </div>
      <div className="workspace-queue-primary">
        <span>HUB με προκαταρκτικά δεδομένα: <strong>{active.length.toLocaleString("el-GR")}/{EXPANSION_HUBS.length}</strong></span>
        <span>Διοικητικές ταυτίσεις δήμων: <strong>{names.toLocaleString("el-GR")}</strong></span>
        <span>Αυτοματοποιημένες με έγκριση διαχειριστή: <strong>{automated.toLocaleString("el-GR")}</strong></span>
        <span>Εγγραφές έρευνας (ενδεικτικά): <strong>{total.toLocaleString("el-GR")}</strong></span>
      </div>
      <div className="workspace-queue-list">
        {active.map(({hub,aggregate}) => <article key={hub.id} className="workspace-queue-card">
          <div className="workspace-queue-head">
            <div>
              <strong>{hub.nameEl}</strong>
              <small>{hub.id} · /hubs/{hub.slug}</small>
            </div>
            <span className="status-pill">research · tentative</span>
          </div>
          <div className="workspace-queue-primary">
            <span>Ενδεικτικές GEMI εγγραφές: <strong>{Number(aggregate!.research_records).toLocaleString("el-GR")}</strong></span>
            <span>Δήμοι: {Number(aggregate!.municipality_names).toLocaleString("el-GR")}</span>
            <span>Αυτοματοποιημένοι έλεγχοι ονόματος: {Number(aggregate!.auto_name_reviews).toLocaleString("el-GR")}</span>
          </div>
        </article>)}
      </div>
      {active.length === 0 && <p>Δεν υπάρχουν ακόμη ελεγμένες διοικητικές προτάσεις.</p>}
    </section>
  </main>;
}
