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

type AddressCandidate = {
  gemi_number: string;
  legal_name: string;
  address_line1: string;
  postcode: string | null;
  city: string | null;
  source_url: string | null;
  source_kind: string | null;
  address_match_status: string | null;
  vendor_slug: string | null;
  hub_slug: string | null;
  hub_business_slug: string | null;
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
  searchParams: Promise<{ hub?: string | string[]; page?: string | string[]; status?: string | string[] }>
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
  const pool = getProductionPostgresRuntime().sqlPool;

  const [summaryResult, rowsResult, addressResult] = await Promise.all([
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
    ),
    pool.query<AddressCandidate>(
      "SELECT d.gemi_number,d.legal_name,c.address_line1,c.postcode,c.city," +
      "e.source_url,e.source_kind,e.address_match_status," +
      "(SELECT v.public_slug FROM public.vendor_businesses v " +
      "WHERE v.gemi_number=d.gemi_number AND v.public_slug IS NOT NULL LIMIT 1) AS vendor_slug," +
      "(SELECT h.hub_slug FROM public.hub_expansion_prospects h WHERE h.gemi_number=d.gemi_number " +
      "AND h.status='converted' AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL LIMIT 1) AS hub_slug," +
      "(SELECT h.public_slug FROM public.hub_expansion_prospects h WHERE h.gemi_number=d.gemi_number " +
      "AND h.status='converted' AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL LIMIT 1) AS hub_business_slug " +
      "FROM public.gemi_company_lookup_cache c " +
      "JOIN research_private.hub_gemi_directory d ON d.gemi_number=c.gemi_number " +
      "LEFT JOIN LATERAL (SELECT source_url,source_kind,address_match_status " +
      "FROM research_private.hub_gemi_address_source_evidence e0 " +
      "WHERE e0.gemi_number=d.gemi_number ORDER BY source_checked_at DESC LIMIT 1) e ON true " +
      "WHERE c.lookup_status='matched' AND c.company_status='Ενεργή' " +
      "AND nullif(btrim(c.address_line1),'') IS NOT NULL " +
      "ORDER BY c.last_checked_at DESC LIMIT 25"
    )
  ]);
  const summary = summaryResult.rows[0] ?? {
    municipality_matches: 0, business_candidates: 0, within_radius_estimate: 0, reviewed: 0
  };
  const count = (n: number | string) => Number(n).toLocaleString("el-GR");
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
      <section className="vendor-section">
        <h2>Έλεγχος επιχειρηματικών διευθύνσεων ΓΕΜΗ</h2>
        <p className="workspace-inline-note">Επίσημη καταχωρισμένη οδός και Τ.Κ., με εξωτερική
          πηγή μόνο όπου υπάρχει. Η αντιστοιχία διευθύνσεων δεν σημαίνει ότι έχει
          επαληθευτεί γεωγραφικό στίγμα, ακτίνα 25 χλμ. ή δικαίωμα δημοσίευσης.</p>
        <div className="workspace-queue-list">
          {addressResult.rows.map(item => <article key={item.gemi_number} className="workspace-queue-card">
            <div className="workspace-queue-head">
              <div><strong>{item.legal_name}</strong>
                <small>ΓΕΜΗ: {item.gemi_number} · {item.address_line1} · {item.postcode ?? "χωρίς ΤΚ"} · {item.city ?? "χωρίς πόλη"}</small></div>
              <span className="status-pill">{item.address_match_status ?? "χρειάζεται ανεξάρτητη πηγή"}</span>
            </div>
            {item.source_url && <p className="workspace-inline-note">
              <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                Τεκμήριο διεύθυνσης ({item.source_kind ?? "πηγή"})
              </a>
            </p>}
            {item.vendor_slug && <p className="workspace-inline-note">
              Υπάρχει ήδη προφίλ vendor: <strong>{item.vendor_slug}</strong>. Δεν επιτρέπεται δεύτερη πληροφοριακή σελίδα.
            </p>}
            {item.hub_slug && <p className="workspace-inline-note">
              Υπάρχει ήδη εγκεκριμένο προφίλ HUB:
              <strong> {item.hub_slug}/{item.hub_business_slug}</strong>. Δεν επιτρέπεται δεύτερη πληροφοριακή σελίδα.
            </p>}
            <small>Κατάσταση: αναμονή επιβεβαιωμένων συντεταγμένων και ανεξάρτητων ελέγχων απορρήτου/έκδοσης.</small>
          </article>)}
        </div>
      </section>
      <p className="workspace-inline-note">Πηγή συντεταγμένων: <a href="https://github.com/open-admin-data/greece-administrative-divisions"
        target="_blank" rel="noopener noreferrer">Greece Administrative Divisions Dataset</a> · CC BY 4.0.
        Πρόκειται για διοικητικά κέντρα και όχι επαληθευμένες επαγγελματικές διευθύνσεις.</p>
    </section>
  </main>;
}
