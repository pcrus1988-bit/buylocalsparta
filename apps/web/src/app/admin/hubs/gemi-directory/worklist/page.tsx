import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../../lib/admin-runtime";
import { getProductionPostgresRuntime } from "../../../../../lib/postgres-runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · GEMI geocode evidence queue",
  robots: { index: false, follow: false }
};

type GeoKeyRow = Readonly<{
  location_key: string;
  postcode: string | null;
  city: string | null;
  municipality: string | null;
  prefecture: string | null;
  business_count: number | string;
}>;

const PAGE_SIZE = 25;

/**
 * Private, non-identifying coordinate acquisition queue. Location keys are
 * aggregate records and do not prove a physical business address.
 * Pagination is bounded and relies on geo_keys primary key, not OFFSET.
 */
export default async function GemiGeoEvidenceWorklistPage({ searchParams }: {
  searchParams: Promise<{ after?: string | string[]; postcode?: string | string[] }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!principal.roles.includes("super_admin") && !hasAdminPermission(principal, "vendor.manage")) {
    redirect("/admin");
  }

  const input = await searchParams;
  const afterRaw = Array.isArray(input.after) ? input.after[0] : input.after;
  const postcodeRaw = Array.isArray(input.postcode) ? input.postcode[0] : input.postcode;
  const after = afterRaw && /^[a-f0-9]{32}$/.test(afterRaw) ? afterRaw : "";
  const postcode = postcodeRaw && /^[0-9]{5}$/.test(postcodeRaw) ? postcodeRaw : "";

  const result = await getProductionPostgresRuntime().sqlPool.query<GeoKeyRow>(
    "SELECT g.location_key,g.postcode,g.city,g.municipality,g.prefecture," +
    "(SELECT count(*)::integer FROM research_private.hub_gemi_directory d " +
    "WHERE d.location_key=g.location_key AND d.assignment_status='awaiting_geocode' " +
    "AND d.display_status='unpublished') AS business_count " +
    "FROM research_private.hub_gemi_geo_keys g " +
    "WHERE g.latitude IS NULL AND g.longitude IS NULL " +
    "AND g.location_key>$1 AND ($2='' OR g.postcode=$2) " +
    "AND EXISTS (SELECT 1 FROM research_private.hub_gemi_directory d " +
    "WHERE d.location_key=g.location_key AND d.assignment_status='awaiting_geocode' " +
    "AND d.display_status='unpublished') " +
    "ORDER BY g.location_key ASC LIMIT $3",
    [after, postcode, PAGE_SIZE + 1]
  );

  const entries = result.rows.slice(0, PAGE_SIZE);
  const nextCursor = result.rows.length > PAGE_SIZE ? entries.at(-1)?.location_key : undefined;
  const nextUrl = nextCursor ? "/admin/hubs/gemi-directory/worklist?" + new URLSearchParams({
    ...(postcode ? { postcode } : {}), after: nextCursor
  }).toString() : undefined;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="HUB GEMI geocoding" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Admin · Private GEMI evidence queue</div>
        <h1>Γεωκωδικοποίηση ΓΕΜΗ · Λίστα εργασίας</h1>
        <p className="lead">Συγκεντρωτικά κλειδιά περιοχών για απόκτηση νόμιμων, επαληθεύσιμων
          γεωγραφικών πηγών. Ταχυδρομικός κώδικας ή δήμος δεν αποδεικνύουν τη φυσική
          έδρα επιχείρησης ούτε επιτρέπουν αυτόματη δημοσίευση.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/hubs/gemi-directory">Επιστροφή σε προτάσεις δήμων</Link>
          <Link className="button button-secondary" href="/admin/hubs/gemi-directory?audit=1">Έλεγχος ετοιμότητας δημοσίευσης</Link>
        </div>
      </div>
    </section>
    <section className="shell vendor-section">
      <div className="workspace-inline-note">
        <strong>Μόνο ανάγνωση — καμία ανάθεση HUB ή δημοσίευση.</strong>
        <p>Τα αποτελέσματα δεν περιλαμβάνουν επωνυμίες, ΑΦΜ, ΓΕΜΗ, email ή στοιχεία έρευνας.
          Το πλήθος δείχνει πόσες ανεπιβεβαίωτες επιχειρήσεις μοιράζονται ένα κλειδί
          περιοχής· δεν πιστοποιεί διευθύνσεις ή άδεια αποθήκευσης συντεταγμένων.</p>
      </div>
      <form method="get" action="/admin/hubs/gemi-directory/worklist" className="admin-directory-filters">
        <label><span>Ταχυδρομικός κώδικας (προαιρετικό)</span>
          <input name="postcode" type="text" inputMode="numeric" pattern="[0-9]{5}"
            maxLength={5} defaultValue={postcode} placeholder="π.χ. 38333" />
        </label>
        <button className="button" type="submit">Φίλτρο εργασίας</button>
        <Link className="button button-secondary" href="/admin/hubs/gemi-directory/worklist">Όλοι οι κώδικες</Link>
      </form>
      <div className="workspace-queue-list">
        {entries.map(row => <article key={row.location_key} className="workspace-queue-card">
          <div className="workspace-queue-head">
            <div>
              <strong>{row.postcode || "Χωρίς ταχυδρομικό κώδικα"} · {row.city || row.municipality || row.prefecture || "Άγνωστη περιοχή"}</strong>
              <small>{row.municipality || "Δήμος μη καταχωρισμένος"} · {row.prefecture || "Περιφέρεια μη καταχωρισμένη"}</small>
            </div>
            <span className="status-pill">awaiting geocode</span>
          </div>
          <div className="workspace-queue-primary">
            <span>Αδημοσίευτες εγγραφές: <strong>{Number(row.business_count).toLocaleString("el-GR")}</strong></span>
            <span>Κλειδί γεω-εργασίας: <code>{row.location_key}</code></span>
            <span>Απόδειξη διεύθυνσης: εκκρεμεί</span>
          </div>
        </article>)}
      </div>
      {entries.length === 0 && <div className="workspace-inline-note">
        Δεν βρέθηκαν ανεπίλυτα κλειδιά για τον συγκεκριμένο κωδικό ή το φίλτρο.
      </div>}
      {nextUrl && <Link className="button" href={nextUrl}>Επόμενα {PAGE_SIZE} κλειδιά →</Link>}
      <p className="workspace-inline-note">Για ελεγχόμενη εξαγωγή των ίδιων μη ταυτοποιητικών
        κλειδιών χρησιμοποιείται το ιδιωτικό script
        <code>scripts/export-hub-gemi-geocode-worklist.ts</code>.
        Οι υποψήφιες συντεταγμένες περνούν από έλεγχο πηγής, ακρίβειας, δικαιωμάτων,
        ηπειρωτικής/νησιωτικής θέσης και φυσικής διεύθυνσης πριν από οποιαδήποτε
        τελική ανάθεση σε HUB.</p>
    </section>
  </main>;
}
