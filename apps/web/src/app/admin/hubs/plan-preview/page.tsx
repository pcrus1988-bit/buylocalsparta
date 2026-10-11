import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SqlRow } from "@buy-local-sparta/core";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { HubClaimWorkspace } from "../../../../components/HubClaimWorkspace";
import { VendorDashboardTools } from "../../../../components/VendorDashboardTools";
import { getAdminSession } from "../../../../lib/admin-session";
import { hasAdminPermission, assertAdminCsrf } from "../../../../lib/admin-runtime";
import { getHubExpansionPlan, HUB_EXPANSION_PLANS, type HubExpansionPlanCode } from "../../../../lib/hub-expansion-plans";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { listHubClaimMediaForAdmin, reviewHubClaimMedia, type HubClaimPublicProfile } from "../../../../lib/hub-claim-runtime";

export const metadata: Metadata = { title: "Admin · Vendor plan preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = { plan?: string | string[]; applicationId?: string | string[] };
type ApplicationSnapshot = Readonly<{
  businessName: string; hubSlug: string; hubCity: string; hubRegion: string;
  category: string; phone: string; address: string; postcode: string;
  website?: string; websiteEmbedEnabled?: boolean; planCode: HubExpansionPlanCode;
  description?: string; openingHours?: string; publicEmail?: string; instagramUrl?: string;
  logoMediaId?: string; coverMediaId?: string;
}>;

async function applicationSnapshot(publicId: string): Promise<ApplicationSnapshot | undefined> {
  if (!/^[a-zA-Z0-9_-]{8,110}$/.test(publicId)) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT business_name,hub_slug,hub_city,hub_region,primary_category,phone,
           address_line,postal_code,website_url,
           COALESCE((to_jsonb(hub_expansion_prospects)->>'website_embed_enabled')::boolean,false) AS website_embed_enabled,
           to_jsonb(hub_expansion_prospects)->>'claim_description' AS claim_description,
           to_jsonb(hub_expansion_prospects)->>'claim_opening_hours' AS claim_opening_hours,
           to_jsonb(hub_expansion_prospects)->>'claim_public_email' AS claim_public_email,
           to_jsonb(hub_expansion_prospects)->>'claim_instagram_url' AS claim_instagram_url,
           to_jsonb(hub_expansion_prospects)->>'claim_logo_media_id' AS claim_logo_media_id,
           to_jsonb(hub_expansion_prospects)->>'claim_cover_media_id' AS claim_cover_media_id,
           plan_code
    FROM hub_expansion_prospects
    WHERE public_id=$1
    LIMIT 1
  `, [publicId]);
  if (!result.rowCount) return undefined;
  const row = result.rows[0];
  const planCode = String(row.plan_code);
  if (!getHubExpansionPlan(planCode)) return undefined;
  return {
    businessName: String(row.business_name), hubSlug: String(row.hub_slug),
    hubCity: String(row.hub_city), hubRegion: String(row.hub_region),
    category: String(row.primary_category), phone: String(row.phone),
    address: String(row.address_line), postcode: String(row.postal_code),
    website: row.website_url ? String(row.website_url) : undefined,
    websiteEmbedEnabled: row.website_embed_enabled === true,
    description: row.claim_description ? String(row.claim_description) : undefined,
    openingHours: row.claim_opening_hours ? String(row.claim_opening_hours) : undefined,
    publicEmail: row.claim_public_email ? String(row.claim_public_email) : undefined,
    instagramUrl: row.claim_instagram_url ? String(row.claim_instagram_url) : undefined,
    logoMediaId: row.claim_logo_media_id ? String(row.claim_logo_media_id) : undefined,
    coverMediaId: row.claim_cover_media_id ? String(row.claim_cover_media_id) : undefined,
    planCode: planCode as HubExpansionPlanCode
  };
}

const fake: ApplicationSnapshot = {
  businessName: "Δοκιμαστική επιχείρηση (DEMO)",
  hubSlug: "volos", hubCity: "Βόλος", hubRegion: "Θεσσαλία",
  category: "Τοπικό κατάστημα", phone: "210 000 0000",
  address: "Δοκιμαστική διεύθυνση", postcode: "38221",
  website: "https://example.com", planCode: "claim"
};

async function reviewClaimMediaAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal || (!principal.roles.includes("super_admin") && !hasAdminPermission(principal, "vendor.manage"))) {
    throw new Error("CLAIM_ADMIN_REQUIRED");
  }
  assertAdminCsrf(principal, String(formData.get("csrfToken") ?? ""));
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const action = String(formData.get("action") ?? "");
  if (action !== "publish" && action !== "reject") throw new Error("CLAIM_ADMIN_INVALID_ACTION");
  await reviewHubClaimMedia(principal, assignmentId, action);
  revalidatePath("/admin/hubs/plan-preview");
}

export default async function AdminHubPlanPreviewPage({ searchParams }: { searchParams: Promise<Search> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!principal.roles.includes("super_admin") && !hasAdminPermission(principal, "vendor.manage")) redirect("/admin");

  const q = await searchParams;
  const applicationId = typeof q.applicationId === "string" ? q.applicationId : "";
  const record = applicationId ? await applicationSnapshot(applicationId) : undefined;
  if (applicationId && !record) notFound();
  const business = record ?? fake;
  const queryPlan = typeof q.plan === "string" ? getHubExpansionPlan(q.plan) : undefined;
  const plan = queryPlan ?? getHubExpansionPlan(business.planCode)!;
  const profile: HubClaimPublicProfile = {
    id: "preview-only", hubSlug: business.hubSlug, hubCity: business.hubCity,
    hubRegion: business.hubRegion, businessName: business.businessName,
    category: business.category, phone: business.phone, address: business.address,
    postcode: business.postcode, website: business.website,
    websiteEmbedEnabled: business.websiteEmbedEnabled ?? false,
    description: business.description, openingHours: business.openingHours,
    publicEmail: business.publicEmail, instagramUrl: business.instagramUrl,
    logoMediaId: business.logoMediaId, coverMediaId: business.coverMediaId
  };
  const isClaim = plan.code === "claim";
  const selling = plan.ecommerce;
  const claimMedia = isClaim && record && business.planCode === "claim"
    ? await listHubClaimMediaForAdmin(applicationId, principal) : [];
  const eur = (cents: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(cents / 100);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Vendor plan preview" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Admin · Προεπισκόπηση χωρίς σύνδεση dummy</div>
        <h1>View as Vendor — ανά πρόγραμμα</h1>
        <p className="lead">Διάλεξε ένα HUB plan για να εξετάσεις την οθόνη και τα εργαλεία που προβλέπονται για τον συνεργάτη. Ειδικά το CLAIM χρησιμοποιεί το ίδιο component με το πραγματικό skinny dashboard.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/applications">← Αιτήσεις HUB</Link>
          <Link className="button button-secondary" href="/admin/partners">← Partner directory</Link>
        </div>
      </div>
    </section>
    <section className="shell vendor-section" aria-label="Plan preview selection">
      <form method="get" action="/admin/hubs/plan-preview" className="admin-directory-filters">
        {applicationId && <input type="hidden" name="applicationId" value={applicationId} />}
        <label><span>Πρόγραμμα</span>
          <select name="plan" defaultValue={plan.code} aria-label="Πρόγραμμα συνεργάτη">
            {HUB_EXPANSION_PLANS.map(p => <option value={p.code} key={p.code}>{p.name} — {p.eyebrow}</option>)}
          </select>
        </label>
        <button className="button" type="submit">Εμφάνιση ως Vendor</button>
      </form>
      <div className="workspace-inline-note" role="status"><strong>ADMIN VIEW-AS · READ ONLY VENDOR</strong> — Δεν συνδέεσαι σε λογαριασμό vendor. Δεν εκτελούνται παραγγελίες, αλλαγές δεδομένων, δημοσιεύσεις ή χρεώσεις. Η επιχείρηση είναι {record ? "από την πραγματική αίτηση, χωρίς ενεργοποίηση" : "ενδεικτικό DEMO"}. </div>
      <div className="workspace-inline-note"><strong>{plan.name}</strong> · ένταξη {eur(plan.setupFeeCents)} · {plan.monthlyLabel} · {plan.annualLabel} · προμήθεια {plan.commissionLabel} · {plan.ecommerce ? "Marketplace operations" : "Χωρίς marketplace checkout"}</div>
    </section>

    {isClaim
      ? <HubClaimWorkspace profiles={[profile]} preview />
      : <section className="vendor-section section-tint">
          <div className="shell">
            <div className="eyebrow">Vendor Dashboard · {plan.name}</div>
            <h2>{business.businessName}</h2>
            <p className="lead">{business.category} · HUB {business.hubCity}. {plan.summary}</p>
            <div className="workspace-inline-note">
              {selling
                ? "Η παρακάτω κονσόλα επαναχρησιμοποιεί τα πραγματικά εργαλεία του εμπορικού Vendor Dashboard, με ενδεικτικά μηδενικά δεδομένα. Οι ενέργειες δεν είναι ενεργές εδώ."
                : "Το PRESENCE παρέχει πλουσιότερο προφίλ και αιτήματα ενδιαφέροντος χωρίς παραγγελίες ή οικονομικά εργαλεία. Οι ξεχωριστές οθόνες διαχείρισης PRESENCE δεν έχουν ακόμη πλήρη παραγωγική υλοποίηση."}
            </div>
            <div className="partner-record-command-grid" style={{ marginTop: 16 }}>
              {plan.features.map(feature => <div key={feature} className="partner-record-command"><span>{plan.name}</span><strong>{feature}</strong><small>Περιλαμβάνεται στη συμφωνημένη περιγραφή προγράμματος.</small></div>)}
            </div>
            {(plan.code === "growth" || plan.code === "pro") && <p className="workspace-inline-note">Η διαφορετική εμπορική τιμολόγηση και υποστήριξη δεν σημαίνουν επιπλέον λειτουργικά κουμπιά μέχρι να εφαρμοστούν τα αντίστοιχα capability gates.</p>}
          </div>
          <VendorDashboardTools metrics={{ orders: 0, overdue: 0, lowStock: 0, activeProducts: 0, purchases30d: 0 }} previewPlan={plan.code} />
        </section>}
    {isClaim && record && business.planCode === "claim" && <section className="shell vendor-section">
      <h2>Admin · Έγκριση εικόνων CLAIM</h2>
      <p>Οι φωτογραφίες των CLAIM χρηστών δεν δημοσιεύονται αυτόματα. Η έγκριση απαιτεί καθαρό αποτέλεσμα από τον υπάρχοντα scanner και ξεχωριστή απόφαση διαχειριστή.</p>
      {!claimMedia.length ? <p>Δεν έχουν υποβληθεί εικόνες για αυτή την αίτηση.</p> : <div className="partner-record-command-grid">
        {claimMedia.map(item => <article key={item.id} className="partner-record-command">
          <span>{item.role === "logo" ? "Λογότυπο" : "Εξώφυλλο"}</span>
          <strong>{item.filename}</strong>
          <small>{item.status} · malware scan: {item.scanStatus}</small>
          {item.scanStatus === "clean" && <Image unoptimized
            src={"/api/admin/hubs/claim/image/" + item.mediaId}
            alt={"Admin preview of " + item.filename} width={280} height={160}
            style={{ width: "100%", height: "auto", maxHeight: 180, objectFit: "contain", background: "#f6f7f6", borderRadius: 8 }}
          />}
          {item.status === "pending_review" && <form action={reviewClaimMediaAction}>
            <input type="hidden" name="csrfToken" value={principal.csrfToken} />
            <input type="hidden" name="assignmentId" value={item.id} />
            <div className="hero-actions">
              <button type="submit" className="button" name="action" value="publish" disabled={item.scanStatus !== "clean"}>Έγκριση & δημοσίευση</button>
              <button type="submit" className="button button-secondary" name="action" value="reject">Απόρριψη</button>
            </div>
          </form>}
        </article>)}
      </div>}
    </section>}
    <section className="shell vendor-section">
      <h2>Περιορισμοί της προεπισκόπησης</h2>
      <p>Η προβολή είναι ασφαλής και μη επεξεργάσιμη. Δεν δημιουργεί dummy χρήστες, passwords ή vendor memberships. Το CLAIM χρησιμοποιεί ακριβώς το ίδιο workspace και το ίδιο δημόσιο component με τον πραγματικό ιδιοκτήτη. Για τα υπόλοιπα πακέτα δείχνουμε τα σημερινά διαθέσιμα UI εργαλεία και τις συμβατικές δυνατότητες· η πλήρης ενεργοποίηση ανά plan απαιτεί ακόμη ενιαίο server-side capability enforcement.</p>
    </section>
  </main>;
}
