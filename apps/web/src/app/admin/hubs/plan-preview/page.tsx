import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SqlRow } from "@buy-local-sparta/core";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { HubClaimWorkspace } from "../../../../components/HubClaimWorkspace";
import { listPublicHubClaimMedia } from "../../../../lib/hub-claim-media-runtime";
import { VendorDashboardTools } from "../../../../components/VendorDashboardTools";
import { getAdminSession } from "../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getHubExpansionPlan, HUB_EXPANSION_PLANS, type HubExpansionPlanCode } from "../../../../lib/hub-expansion-plans";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import type { HubClaimPublicProfile } from "../../../../lib/hub-claim-runtime";

export const metadata: Metadata = { title: "Admin · Vendor plan preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = { plan?: string | string[]; applicationId?: string | string[] };
type ApplicationSnapshot = Readonly<{
  businessName: string; hubSlug: string; hubCity: string; hubRegion: string;
  category: string; phone: string; address: string; postcode: string;
  website?: string; websiteEmbedEnabled?: boolean; planCode: HubExpansionPlanCode;
  publicId?: string; status?: string;
  description?: string; openingHours?: string; instagramUrl?: string; facebookUrl?: string;
}>;

async function applicationSnapshot(publicId: string): Promise<ApplicationSnapshot | undefined> {
  if (!/^[a-zA-Z0-9_-]{8,110}$/.test(publicId)) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT h.public_id,h.status,h.business_name,h.hub_slug,h.hub_city,h.hub_region,
           h.primary_category,h.phone,h.address_line,h.postal_code,h.website_url,
           COALESCE((to_jsonb(h)->>'website_embed_enabled')::boolean,false) AS website_embed_enabled,
           h.plan_code,COALESCE(cp.description,'') AS claim_description,
           COALESCE(cp.opening_hours,'') AS claim_opening_hours,
           cp.instagram_url AS claim_instagram_url,cp.facebook_url AS claim_facebook_url
    FROM hub_expansion_prospects h
    LEFT JOIN hub_claim_profiles cp ON cp.prospect_id=h.id
    WHERE h.public_id=$1
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
    planCode: planCode as HubExpansionPlanCode,
    publicId: String(row.public_id), status: String(row.status),
    description: String(row.claim_description ?? ""),
    openingHours: String(row.claim_opening_hours ?? ""),
    instagramUrl: row.claim_instagram_url ? String(row.claim_instagram_url) : undefined,
    facebookUrl: row.claim_facebook_url ? String(row.claim_facebook_url) : undefined
  };
}

const fake: ApplicationSnapshot = {
  businessName: "Δοκιμαστική επιχείρηση (DEMO)",
  hubSlug: "volos", hubCity: "Βόλος", hubRegion: "Θεσσαλία",
  category: "Τοπικό κατάστημα", phone: "210 000 0000",
  address: "Δοκιμαστική διεύθυνση", postcode: "38221",
  website: "https://example.com", planCode: "claim", status: "demo",
  description: "Μια δοκιμαστική τοπική επιχείρηση στο KONTA MOY HUB.", openingHours: "Δευτέρα–Παρασκευή 09:00–17:00"
};

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
    id: business.publicId ?? "preview-only", hubSlug: business.hubSlug, hubCity: business.hubCity,
    hubRegion: business.hubRegion, businessName: business.businessName,
    category: business.category, phone: business.phone, address: business.address,
    postcode: business.postcode, website: business.website,
    websiteEmbedEnabled: business.websiteEmbedEnabled ?? false,
    description: business.description ?? "", openingHours: business.openingHours ?? "",
    instagramUrl: business.instagramUrl, facebookUrl: business.facebookUrl
  };
  const isClaim = plan.code === "claim";
  const selling = plan.ecommerce;
  // A real converted CLAIM may show its approved photos; pending applications
  // and plan simulations must never load unpublished media.
  const publishedMedia = isClaim && business.planCode === "claim"
    && business.status === "converted" && business.publicId
    ? (await listPublicHubClaimMedia(business.publicId)).map(item => ({ ...item, claimId: profile.id }))
    : [];
  const eur = (cents: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(cents / 100);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Vendor plan preview" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Admin · Προεπισκόπηση χωρίς σύνδεση dummy</div>
        <h1>View as Vendor — ανά πρόγραμμα</h1>
        <p className="lead">Διάλεξε ένα HUB plan για να εξετάσεις την οθόνη και τα εργαλεία που προβλέπονται για τον συνεργάτη. Το CLAIM χρησιμοποιεί την ίδια οθόνη με το πραγματικό dashboard και την ίδια απόδοση δημόσιας καταχώρισης.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/applications">← Αιτήσεις HUB</Link>
          <Link className="button button-secondary" href="/admin/partners">← Partner directory</Link>
          <Link className="button button-secondary" href="/admin/hubs/claim-media">CLAIM · Εγκρίσεις φωτογραφιών</Link>
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
      <div className="workspace-inline-note" role="status"><strong>ADMIN PREVIEW · READ ONLY</strong> — Δεν συνδέεσαι σε λογαριασμό vendor. Δεν εκτελούνται παραγγελίες, αλλαγές δεδομένων, δημοσιεύσεις ή χρεώσεις. Η επιχείρηση είναι {record ? "από την πραγματική αίτηση, χωρίς ενεργοποίηση" : "ενδεικτικό DEMO"}. </div>
      <div className="workspace-inline-note"><strong>{plan.name}</strong> · ένταξη {eur(plan.setupFeeCents)} · {plan.monthlyLabel} · {plan.annualLabel} · προμήθεια {plan.commissionLabel} · {plan.ecommerce ? "Marketplace operations" : "Χωρίς marketplace checkout"}</div>
    </section>

    {isClaim
      ? <HubClaimWorkspace profiles={[profile]} media={publishedMedia} preview
          unpublished={business.status !== "converted" || business.planCode !== "claim"} />
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
    <section className="shell vendor-section">
      <h2>Περιορισμοί της προεπισκόπησης</h2>
      <p>Η προβολή είναι ασφαλής και μη επεξεργάσιμη. Δεν δημιουργεί dummy χρήστες, passwords ή vendor memberships. Το CLAIM μοιράζεται ολόκληρο το πραγματικό dashboard και τον renderer της δημόσιας καταχώρισης. Για τα υπόλοιπα πακέτα δείχνουμε τα σημερινά διαθέσιμα UI εργαλεία και τις συμβατικές δυνατότητες· η πλήρης ενεργοποίηση ανά plan απαιτεί ακόμη ενιαίο server-side capability enforcement.</p>
    </section>
  </main>;
}
