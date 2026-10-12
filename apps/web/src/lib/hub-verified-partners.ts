import { getProductionPostgresRuntime } from "./postgres-runtime";
import type { HubExpansionPlanCode } from "./hub-expansion-plans";
import { isVerifiedHubPartner } from "./hub-partner-eligibility";

/**
 * Paid HUB plans are verified independently of CLAIM. A pending application,
 * trial, inactive vendor or private/demo storefront never becomes a public
 * directory participant just because a paid plan was selected.
 */
export type VerifiedHubPartner = Readonly<{
  id: string;
  hubSlug: string;
  hubCity: string;
  businessName: string;
  category: string;
  planCode: Exclude<HubExpansionPlanCode, "claim">;
  vendorSlug: string;
  publicPath: string;
}>;

type PartnerRow = {
  id: string;
  hub_slug: string;
  hub_city: string;
  business_name: string;
  primary_category: string;
  plan_code: Exclude<HubExpansionPlanCode, "claim">;
  vendor_slug: string;
  application_status: string;
  vendor_status: string;
  owner_verified: boolean;
  directory_visible: boolean;
  demo_mode: boolean;
};

const FROM_VERIFIED_PARTNERS = `
  FROM public.hub_expansion_prospects h
  JOIN public.vendor_businesses v ON v.id=h.vendor_id
  JOIN public.users u ON u.id=h.owner_user_id
  WHERE h.plan_code IN ('presence','shop','growth','pro')
    AND h.status='converted'
    AND u.status='active' AND u.email_verified_at IS NOT NULL
    AND v.status='active'
    AND v.public_directory_visible=true
    AND COALESCE(v.demo_mode,false)=false
    AND v.public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
`;

const PARTNER_FIELDS = `
  SELECT h.public_id AS id, h.hub_slug, h.hub_city,
         h.business_name, h.primary_category, h.plan_code,
         v.public_slug AS vendor_slug, h.status::text AS application_status,
         v.status::text AS vendor_status,
         (u.status='active' AND u.email_verified_at IS NOT NULL) AS owner_verified,
         v.public_directory_visible AS directory_visible,
         COALESCE(v.demo_mode,false) AS demo_mode
`;

function asPartner(row: PartnerRow): VerifiedHubPartner {
  if (!isVerifiedHubPartner({
    planCode: row.plan_code,
    applicationStatus: row.application_status,
    hasVerifiedOwner: row.owner_verified,
    vendorStatus: row.vendor_status,
    directoryVisible: row.directory_visible,
    demoMode: row.demo_mode,
    vendorSlug: row.vendor_slug
  })) throw new Error("HUB_PUBLIC_PARTNER_NOT_VERIFIED");
  return {
    id: row.id,
    hubSlug: row.hub_slug,
    hubCity: row.hub_city,
    businessName: row.business_name,
    category: row.primary_category,
    planCode: row.plan_code,
    vendorSlug: row.vendor_slug,
    publicPath: "/hubs/" + row.hub_slug + "/business/" + row.vendor_slug
  };
}

export async function listVerifiedHubPartnersByHub(
  hubSlug: string, limit = 100, search = ""
): Promise<VerifiedHubPartner[]> {
  if (!/^[a-z0-9-]{2,80}$/.test(hubSlug)) return [];
  const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
  const query = search.trim().slice(0, 70);
  const result = await getProductionPostgresRuntime().sqlPool.query<PartnerRow>(
    PARTNER_FIELDS + FROM_VERIFIED_PARTNERS +
      " AND h.hub_slug=$1 AND ($3='' OR position(lower($3) in lower(h.business_name))>0) " +
      "ORDER BY h.updated_at DESC LIMIT $2", [hubSlug, bounded, query]
  );
  return result.rows.map(asPartner);
}

export async function listVerifiedHubPartners(limit = 100): Promise<VerifiedHubPartner[]> {
  const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await getProductionPostgresRuntime().sqlPool.query<PartnerRow>(
    PARTNER_FIELDS + FROM_VERIFIED_PARTNERS +
      " ORDER BY h.updated_at DESC LIMIT $1", [bounded]
  );
  return result.rows.map(asPartner);
}

/** A single bounded query across all HUBs, for the public location chooser and sitemap. */
export async function listVerifiedHubPartnerSlugs(): Promise<string[]> {
  const result = await getProductionPostgresRuntime().sqlPool.query<{ hub_slug: string }>(
    "SELECT DISTINCT h.hub_slug " + FROM_VERIFIED_PARTNERS
  );
  return result.rows.map((row) => row.hub_slug);
}


/** Hub-local directory profile, including PRESENCE, never a Sparta storefront fallback. */
export async function getVerifiedHubPartnerBySlug(
  hubSlug: string, slug: string
): Promise<VerifiedHubPartner | undefined> {
  if (!/^[a-z0-9-]{2,80}$/.test(hubSlug) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 128 ||
      /-gemi-[0-9]{8,20}$/.test(slug)) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<PartnerRow>(
    PARTNER_FIELDS + FROM_VERIFIED_PARTNERS +
      " AND h.hub_slug=$1 AND v.public_slug=$2 ORDER BY h.updated_at DESC LIMIT 1",
    [hubSlug, slug]
  );
  return result.rows[0] ? asPartner(result.rows[0]) : undefined;
}
