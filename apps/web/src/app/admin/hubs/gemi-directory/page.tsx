import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../../lib/admin-session";
import { hasAdminPermission, assertAdminCsrf } from "../../../../lib/admin-runtime";
import { reviewGemiMunicipalityCorrespondence } from "../../../../lib/hub-gemi-municipality-review";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { EXPANSION_HUBS, getExpansionHubBySlug } from "../../../../lib/expansion-hubs";
import { municipalityProposalRisks } from "../../../../lib/hub-gemi-municipality-risk";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · GEMI HUB geographic review",
  robots: { index: false, follow: false }
};

type Summary = {
  municipality_matches: number | string;
  business_candidates: number | string;
  within_radius_estimate: number | string;
  reviewed: number | string;
};

type DirectoryAudit = {
  total: number | string;
  with_municipality: number | string;
  with_coordinates: number | string;
  assigned: number | string;
  geo_verified: number | string;
  privacy_pending: number | string;
  editorial_reviewed: number | string;
  published: number | string;
  seo_approved: number | string;
};

type Candidate = {
  registry_municipality_id: string;
  registry_municipality_name: string;
  gazetteer_name: string;
  gazetteer_source_id: string;
  candidate_hub_slug: string | null;
  candidate_hub_distance_km: number | string | null;
  matching_business_count: number | string;
  review_status: string;
  match_method: string;
  source_region: string | null;
  hub_region_code: string | null;
};

async function reviewMunicipalityAction(form: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) throw new Error("ADMIN_AUTH_REQUIRED");
  assertAdminCsrf(principal, String(form.get("csrf") ?? ""));
  await reviewGemiMunicipalityCorrespondence(principal, {
    municipalityId: String(form.get("municipalityId") ?? ""),
    sourceId: String(form.get("sourceId") ?? ""),
    decision: String(form.get("decision") ?? ""),
    reason: String(form.get("reason") ?? ""),
    attestation: String(form.get("attestation") ?? "")
  });
  revalidatePath("/admin/hubs/gemi-directory");
  const rawHub = String(form.get("hub") ?? "");
  const hub = getExpansionHubBySlug(rawHub) ? rawHub : "";
  const page = Math.max(1, Math.min(1000, Number.parseInt(String(form.get("page") ?? "1"), 10) || 1));
  redirect("/admin/hubs/gemi-directory?" + new URLSearchParams({
    ...(hub ? { hub } : {}), page: String(page), status: "proposed"
  }).toString());
}

export default async function GemiHubGeographyPage({ searchParams }: {
  searchParams: Promise<{ hub?: string | string[]; page?: string | string[]; status?: string | string[]; audit?: string | string[] }>
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!principal.roles.includes("super_admin") && !hasAdminPermission(principal, "vendor.manage")) redirect("/admin");

  const requested = await searchParams;
  const requestedHub = Array.isArray(requested.hub) ? requested.hub[0] : requested.hub;
  const hub = requestedHub && getExpansionHubBySlug(requestedHub) ? requestedHub : "";
  const pageRaw = Array.isArray(requested.page) ? requested.page[0] : requested.page;
  const page = Math.max(1, Math.min(1000, Number.parseInt(pageRaw ?? "1", 10) || 1));
  const rawStatus = Array.isArray(requested.status) ? requested.status[0] : requested.status;
  const status = ["proposed", "reviewed", "rejected"].includes(rawStatus ?? "") ? rawStatus! : "";
  const auditRequested = (Array.isArray(requested.audit) ? requested.audit[0] : requested.audit) === "1";
  const pool = getProductionPostgresRuntime().sqlPool;

  const [summaryResult, rowsResult] = await Promise.all([
    pool.query<Summary>(
      "SELECT count(*)::integer AS municipality_matches, " +
      "COALESCE(sum(matching_business_count),0)::bigint AS business_candidates, " +
      "COALESCE(sum(matching_business_count) FILTER (WHERE candidate_hub_distance_km<=25),0)::bigint AS within_radius_estimate, " +
      "count(*) FILTER (WHERE review_status='reviewed')::integer AS reviewed " +
      "FROM research_private.hub_gemi_municipality_matches WHERE ($1='' OR candidate_hub_slug=$1) " +
      "AND ($2='' OR review_status=$2)",
      [hub, status]
    ),
    pool.query<Candidate>(
      "SELECT m.registry_municipality_id,m.registry_municipality_name," +
      "m.gazetteer_source_id,g.municipality_name AS gazetteer_name,g.source_region," +
      "m.candidate_hub_slug,m.candidate_hub_distance_km,m.matching_business_count,m.review_status,m.match_method," +
      "h.region_code AS hub_region_code " +
      "FROM research_private.hub_gemi_municipality_matches m " +
      "JOIN research_private.hub_gemi_municipality_centroids g ON g.source_id=m.gazetteer_source_id " +
      "LEFT JOIN research_private.hub_gemi_hub_master h ON h.hub_id=m.candidate_hub_id " +
      "WHERE ($1='' OR m.candidate_hub_slug=$1) AND ($3='' OR m.review_status=$3) " +
      "ORDER BY m.matching_business_count DESC,m.registry_municipality_id LIMIT 50 OFFSET $2",
      [hub, (page-1)*50, status]
    )
  ]);
  // A nationwide scan is intentionally opt-in, not repeated on every admin page view.
  // No status change, geocoding, or publication happens here.
  const directoryAudit = auditRequested ? (await pool.query<DirectoryAudit>(
    "SELECT count(*)::bigint AS total, " +
    "count(*) FILTER (WHERE registry_municipality_id IS NOT NULL)::bigint AS with_municipality, " +
    "count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::bigint AS with_coordinates, " +
    "count(*) FILTER (WHERE assignment_status='assigned' AND assigned_hub_id IS NOT NULL)::bigint AS assigned, " +
    "count(*) FILTER (WHERE business_geo_verified_at IS NOT NULL)::bigint AS geo_verified, " +
    "count(*) FILTER (WHERE privacy_review_status='pending')::bigint AS privacy_pending, " +
    "count(*) FILTER (WHERE editorial_reviewed_at IS NOT NULL)::bigint AS editorial_reviewed, " +
    "count(*) FILTER (WHERE display_status='published')::bigint AS published, " +
    "count(*) FILTER (WHERE seo_approved=true)::bigint AS seo_approved " +
    "FROM research_private.hub_gemi_directory"
  )).rows[0] : undefined;
  const summary = summaryResult.rows[0] ?? {
    municipality_matches: 0, business_candidates: 0, within_radius_estimate: 0, reviewed: 0
  };
  const count = (n: number | string) => Number(n).toLocaleString("el-GR");
  const auditUrl = "/admin/hubs/gemi-directory?" + new URLSearchParams({
    ...(hub ? { hub } : {}), ...(status ? { status } : {}), page: String(page), audit: "1"
  }).toString();
  const next = "/admin/hubs/gemi-directory?" + new URLSearchParams({
    ...(hub ? { hub } : {}), ...(status ? { status } : {}), page: String(page + 1)
  }).toString();

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="HUB GEMI geography" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Admin · National GEMI census · Preliminary geolocation</div>
        <h1>Γεωγραφική αντιστοίχιση GEMI → HUB</h1>
        <p className="lead">Προτεινόμενη κατανομή από νομίμως διαθέσιμα σημεία αναφοράς δήμων. Οι αποστάσεις αφορούν
          τα κέντρα των δήμων, όχι τις διευθύνσεις επιχειρήσεων. Δεν αποτελούν επιβεβαίωση ότι
          μια επιχείρηση βρίσκεται εντός ακτίνας 25 χλμ.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/research-vendors">Research vendors</Link>
          <Link className="button button-secondary" href="/admin/hubs/plan-preview">HUB plan preview</Link>
        </div>
      </div>
    </section>
    <section className="shell vendor-section">
      <div className="workspace-inline-note">Οι εγγραφές βρίσκονται σε κατάσταση <strong>proposed</strong>.
        Ούτε η αντιστοίχιση ούτε η εκτίμηση ακτίνας δημοσιεύουν επιχείρηση ή ενεργοποιούν τη συμμετοχή της.
        Για οριστική κατάταξη απαιτούνται συντεταγμένες της πραγματικής τοποθεσίας και έλεγχος
        νησιού/ηπειρωτικής χώρας. Οι υπόλοιπες επιχειρήσεις παραμένουν χωρίς πρόταση.</div>
      <div className="workspace-queue-primary">
        <span>Δήμοι με πρόταση: <strong>{count(summary.municipality_matches)}</strong></span>
        <span>Επιχειρήσεις με υποψήφια περιοχή: <strong>{count(summary.business_candidates)}</strong></span>
        <span>Εντός 25 km βάσει δημοτικού κέντρου μόνο: <strong>{count(summary.within_radius_estimate)}</strong></span>
        <span>Ελεγμένες προτάσεις: <strong>{count(summary.reviewed)}</strong></span>
      </div>
      <section className="workspace-inline-note">
        <h2>Ετοιμότητα πανελλαδικού καταλόγου ΓΕΜΗ</h2>
        <p>Ανάγνωση καταστάσεων από την ιδιωτική βάση. Δεν ξεκινά αυτόματα γεωκωδικοποίηση,
          έγκριση ή δημοσίευση. Επαλήθευση διοικητικού δήμου δεν αποτελεί έλεγχο διεύθυνσης.</p>
        <Link className="button button-secondary" href={auditUrl}>Φόρτωση ελέγχου δημοσίευσης →</Link>
        {directoryAudit && <div className="workspace-queue-primary">
          <span>Εγγραφές: <strong>{count(directoryAudit.total)}</strong></span>
          <span>Με δήμο ΓΕΜΗ: <strong>{count(directoryAudit.with_municipality)}</strong></span>
          <span>Με γεωγραφικές συντεταγμένες: <strong>{count(directoryAudit.with_coordinates)}</strong></span>
          <span>Ανατεθειμένες σε HUB: <strong>{count(directoryAudit.assigned)}</strong></span>
          <span>Με φυσική γεω-επαλήθευση: <strong>{count(directoryAudit.geo_verified)}</strong></span>
          <span>Privacy σε εκκρεμότητα: <strong>{count(directoryAudit.privacy_pending)}</strong></span>
          <span>Editorial reviewed: <strong>{count(directoryAudit.editorial_reviewed)}</strong></span>
          <span>Δημοσιευμένες: <strong>{count(directoryAudit.published)}</strong></span>
          <span>SEO approved: <strong>{count(directoryAudit.seo_approved)}</strong></span>
        </div>}
      </section>
      <form method="get" action="/admin/hubs/gemi-directory" className="admin-directory-filters">
        <label><span>HUB</span><select name="hub" defaultValue={hub}>
          <option value="">Όλα τα 131 HUB</option>
          {EXPANSION_HUBS.map(item => <option key={item.id} value={item.slug}>
            {item.nameEl} ({item.id})
          </option>)}
        </select></label>
        <label><span>Αξιολόγηση ονόματος</span><select name="status" defaultValue={status}>
          <option value="">Όλες οι καταστάσεις</option>
          <option value="proposed">Προς εξέταση</option>
          <option value="reviewed">Ελεγμένη αντιστοιχία</option>
          <option value="rejected">Απορρίφθηκε</option>
        </select></label>
        <button className="button" type="submit">Φίλτρο</button>
      </form>
      <div className="workspace-queue-list">
        {rowsResult.rows.map(row => <article key={row.registry_municipality_id} className="workspace-queue-card">
          <div className="workspace-queue-head">
            <div><strong>{row.registry_municipality_name}</strong>
              <small>ΓΕΜΗ δήμος {row.registry_municipality_id} · Open Admin Data: {row.gazetteer_name}</small></div>
            <span className="status-pill">{row.review_status}</span>
          </div>
          {municipalityProposalRisks({
            sourceRegion: row.source_region,
            hubRegionCode: row.hub_region_code,
            centroidDistanceKm: row.candidate_hub_distance_km
          }).length > 0 && <p className="workspace-inline-note">
            <strong>Χρειάζεται γεωγραφικό έλεγχο:</strong> ασυμφωνία περιφέρειας ή απόσταση δημοτικού κέντρου
            εκτός 25 χλμ. Η πρόταση δεν αποτελεί γεωεντοπισμό επιχείρησης.
          </p>}
          <div className="workspace-queue-primary">
            <span>{count(row.matching_business_count)} υποψήφια businesses</span>
            <span>HUB: {row.candidate_hub_slug ?? "—"}</span>
            <span>Απόσταση κέντρων: {row.candidate_hub_distance_km === null ?
              "—" : Number(row.candidate_hub_distance_km).toFixed(1) + " km"}</span>
            <span>{row.source_region ?? "Περιφέρεια άγνωστη"}</span>
            <span>Μέθοδος: {row.match_method}</span>
          </div>
          {row.review_status === "proposed" && <form action={reviewMunicipalityAction}
            className="workspace-inline-note">
            <input type="hidden" name="csrf" value={principal.csrfToken} />
            <input type="hidden" name="municipalityId" value={row.registry_municipality_id} />
            <input type="hidden" name="sourceId" value={row.gazetteer_source_id} />
            <input type="hidden" name="hub" value={hub} />
            <input type="hidden" name="page" value={page} />
            <label>Τεκμηρίωση ελέγχου ταυτοσημίας δήμου (20–600 χαρακτήρες)
              <textarea name="reason" minLength={20} maxLength={600} required rows={2}
                placeholder="Πηγή και αιτιολόγηση, μόνο για την ταύτιση ονόματος δήμου" />
            </label>
            <label><input type="checkbox" name="attestation" value="municipality_only" required />
              Ελέγχω μόνο τη διοικητική αντιστοίχιση. Δεν πιστοποιώ θέση επιχείρησης ή δικαίωμα δημοσίευσης.</label>
            <div className="hero-actions">
              <button className="button" name="decision" value="reviewed" type="submit">Έγκριση ταύτισης δήμου</button>
              <button className="button button-secondary" name="decision" value="rejected" type="submit">Απόρριψη πρότασης</button>
            </div>
          </form>}
        </article>)}
      </div>
      {page * 50 < Number(summary.municipality_matches) &&
        <Link className="button" href={next}>Επόμενη σελίδα →</Link>}
      <p className="workspace-inline-note">Πηγή συντεταγμένων: <a href="https://github.com/open-admin-data/greece-administrative-divisions"
        target="_blank" rel="noopener noreferrer">Greece Administrative Divisions Dataset</a> · CC BY 4.0.
        Πρόκειται για διοικητικά κέντρα και όχι επαληθευμένες επαγγελματικές διευθύνσεις.</p>
    </section>
  </main>;
}
