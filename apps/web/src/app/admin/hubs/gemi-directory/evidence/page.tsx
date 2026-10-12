import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../../lib/admin-runtime";
import { getProductionPostgresRuntime } from "../../../../../lib/postgres-runtime";
import { classifyGemiSourceEvidence } from "../../../../../lib/hub-gemi-source-evidence";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · GEMI physical-address evidence",
  robots: { index: false, follow: false }
};

type EvidenceRow = Readonly<{
  id: string;
  gemi_number: string;
  legal_name: string;
  source_url: string;
  source_kind: string;
  source_postcode: string | null;
  registry_postcode: string | null;
  city: string | null;
  prefecture: string | null;
  finding: string;
  address_match_status: string;
  physical_geo_status: string;
  source_checked_at: string | Date;
  source_confirmed_at: string | Date | null;
  business_geo_verified_at: string | Date | null;
  display_status: string;
  verified_claim_url: string | null;
  existing_partner_slug: string | null;
}>;

const PAGE_SIZE = 25;
function formatChecked(value: string | Date | null): string {
  if (!value) return "—";
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime())
    ? timestamp.toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "medium" })
    : "—";
}

/** Read-only private source triage; no business geocoding or publication action exists. */
export default async function GemiAddressEvidencePage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!principal.roles.includes("super_admin") && !hasAdminPermission(principal, "vendor.manage")) {
    redirect("/admin");
  }

  const requested = await searchParams;
  const rawPage = Array.isArray(requested.page) ? requested.page[0] : requested.page;
  const page = Math.max(1, Math.min(100, Number.parseInt(rawPage ?? "1", 10) || 1));
  const result = await getProductionPostgresRuntime().sqlPool.query<EvidenceRow>(
    "SELECT e.id::text,e.gemi_number,d.legal_name,e.source_url,e.source_kind," +
    "e.postcode AS source_postcode,d.postcode AS registry_postcode," +
    "d.city,d.prefecture,e.finding,e.address_match_status,e.physical_geo_status," +
    "e.source_checked_at,e.source_confirmed_at,d.business_geo_verified_at,d.display_status," +
    "claim.public_path AS verified_claim_url,partner.public_slug AS existing_partner_slug " +
    "FROM research_private.hub_gemi_address_source_evidence e " +
    "JOIN research_private.hub_gemi_directory d ON d.gemi_number=e.gemi_number " +
    "LEFT JOIN LATERAL (SELECT '/hubs/' || h.hub_slug || '/business/' || h.public_slug AS public_path " +
    "FROM public.hub_expansion_prospects h " +
    "WHERE h.gemi_number=e.gemi_number AND h.plan_code='claim' AND h.status='converted' " +
    "AND h.owner_user_id IS NOT NULL AND h.public_slug IS NOT NULL " +
    "ORDER BY h.updated_at DESC LIMIT 1) claim ON true " +
    "LEFT JOIN LATERAL (SELECT v.public_slug FROM public.vendor_businesses v " +
    "WHERE v.gemi_number=e.gemi_number AND v.status='active' " +
    "AND v.public_directory_visible=true AND v.public_slug IS NOT NULL " +
    "ORDER BY v.created_at DESC LIMIT 1) partner ON true " +
    "ORDER BY e.source_checked_at DESC,e.id DESC LIMIT $1 OFFSET $2",
    [PAGE_SIZE + 1, (page - 1) * PAGE_SIZE]
  );
  const entries = result.rows.slice(0, PAGE_SIZE);
  const hasMore = result.rows.length > PAGE_SIZE;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="GEMI address evidence" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Admin · Private GEMI source corroboration</div>
        <h1>Πηγές διευθύνσεων ΓΕΜΗ · Έλεγχος τεκμηρίων</h1>
        <p className="lead">Οι ιστοσελίδες και οι επιχειρηματικοί κατάλογοι βοηθούν στην
          αντιπαραβολή της αναφερόμενης διεύθυνσης. Δεν αποδεικνύουν ότι οι συντεταγμένες
          αντιστοιχούν σε πραγματική εγκατάσταση ούτε επιτρέπουν δημοσίευση.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/hubs/gemi-directory">Επιστροφή στον γεωγραφικό έλεγχο</Link>
          <Link className="button button-secondary" href="/admin/hubs/gemi-directory/worklist">Κλειδιά γεωκωδικοποίησης</Link>
        </div>
      </div>
    </section>
    <section className="shell vendor-section">
      <div className="workspace-inline-note">
        <strong>Εσωτερική εξέταση · χωρίς ενέργειες έγκρισης.</strong>
        <p>Οι εγγραφές παραμένουν μη δημοσιευμένες έως ότου ολοκληρωθούν ξεχωριστά
          η γεωγραφική επαλήθευση φυσικής διεύθυνσης, η αντιστοίχιση HUB, οι έλεγχοι
          ιδιωτικότητας και η συντακτική εξέταση. Οι υπάρχοντες συνεργάτες δεν
          πρέπει να αποκτήσουν δεύτερο, ανταγωνιστικό προφίλ ΓΕΜΗ.</p>
      </div>
      <div className="workspace-queue-list">
        {entries.map(row => {
          const triage = classifyGemiSourceEvidence({
            sourcePostcode: row.source_postcode,
            registryPostcode: row.registry_postcode,
            addressMatchStatus: row.address_match_status,
            sourceConfirmed: Boolean(row.source_confirmed_at),
            physicalGeoVerified: Boolean(row.business_geo_verified_at),
            existingClaim: Boolean(row.verified_claim_url),
            existingPartner: Boolean(row.existing_partner_slug)
          });
          return <article key={row.id} className="workspace-queue-card">
            <div className="workspace-queue-head">
              <div><strong>{row.legal_name}</strong>
                <small>ΓΕΜΗ {row.gemi_number} · {row.city || row.prefecture || "Περιοχή μη επιβεβαιωμένη"}</small>
              </div>
              <span className="status-pill">{row.physical_geo_status}</span>
            </div>
            <div className="workspace-queue-primary">
              <span>Πηγή: {row.source_kind}</span>
              <span>Ταχυδρομικός πηγής: {row.source_postcode || "—"}</span>
              <span>Ταχυδρομικός ΓΕΜΗ: {row.registry_postcode || "—"}</span>
              <span>Πηγή ελέγχθηκε: {formatChecked(row.source_checked_at)}</span>
              <span>Ανθρώπινη επιβεβαίωση: {formatChecked(row.source_confirmed_at)}</span>
              <span>Έλεγχος αντιστοιχίας: {row.address_match_status}</span>
              <span>Δημοσίευση: {row.display_status}</span>
            </div>
            <p className="workspace-inline-note">{row.finding}</p>
            <p><a href={row.source_url} target="_blank" rel="noopener noreferrer nofollow">
              Προβολή πηγής τεκμηρίωσης ↗
            </a></p>
            {triage.issues.length > 0 && <div className="workspace-inline-note">
              <strong>Ανοικτοί έλεγχοι:</strong>
              <ul>{triage.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
            </div>}
            {row.verified_claim_url && <p className="workspace-inline-note">
              Υπάρχει ενεργή καταχώριση CLAIM: <Link href={row.verified_claim_url}>Προφίλ επιχείρησης →</Link>
            </p>}
            {row.existing_partner_slug && <p className="workspace-inline-note">
              Υπάρχει ενεργός συνεργάτης με τον ίδιο αριθμό ΓΕΜΗ.
              Ελέγξτε τη σωστή δημόσια σελίδα προτού δημοσιευθεί ξεχωριστή εγγραφή έρευνας.
            </p>}
          </article>;
        })}
      </div>
      {!entries.length && <p className="workspace-inline-note">Δεν υπάρχουν καταγεγραμμένες πηγές τεκμηρίωσης για αυτή τη σελίδα.</p>}
      {hasMore && <Link className="button" href={"/admin/hubs/gemi-directory/evidence?page=" + (page + 1)}>Επόμενες εγγραφές →</Link>}
      <p className="workspace-inline-note">Η παρούσα λίστα είναι μόνο ένα σημείο
        προτεραιοποίησης: η τεκμηρίωση προέλευσης, οι άδειες χρήσης συντεταγμένων
        και η ανεξάρτητη επιβεβαίωση φυσικής εγκατάστασης παραμένουν απαιτούμενες.</p>
    </section>
  </main>;
}
