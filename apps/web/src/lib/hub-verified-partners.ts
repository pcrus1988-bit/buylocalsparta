import { getProductionPostgresRuntime } from "./postgres-runtime";
import type { HubExpansionPlanCode } from "./hub-expansion-plans";

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

export type PartnerEligibility = Readonly<{
  planCode: string;
  applicationStatus: string;
  hasVerifiedOwner: boolean;
  vendorStatus: string;
  directoryVisible: boolean;
  demoMode: boolean;
  vendorSlug?: string | null;
}>;

const LIVE_HUB_PLANS = new Set(["presence", "shop", "growth", "pro"]);

export function isVerifiedHubPartner(input: PartnerEligibility): boolean {
  return LIVE_HUB_PLANS.has(input.planCode) &&
    input.applicationStatus === "converted" &&
    input.hasVerifiedOwner &&
    input.vendorStatus === "active" &&
    input.directoryVisible &&
    !input.demoMode &&
    typeof input.vendorSlug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.vendorSlug);
}

type PartnerRow = {
  id: string;
  hub_slug: string;
  hub_city: string;
  business_name: string;
  primary_category: string;
  plan_code: Exclude<HubExpansionPlanCode, "claim">;
  vendor_slug: string;
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
         v.public_slug AS vendor_slug
`;

function asPartner(row: PartnerRow): VerifiedHubPartner {
  return {
    id: row.id,
    hubSlug: row.hub_slug,
    hubCity: row.hub_city,
    businessName: row.business_name,
    category: row.primary_category,
    planCode: row.plan_code,
    vendorSlug: row.vendor_slug,
    publicPath: "/vendor/" + row.vendor_slug
  };
}

export async function listVerifiedHubPartnersByHub(
  hubSlug: string, limit = 100
): Promise<VerifiedHubPartner[]> {
  if (!/^[a-z0-9-]{2,80}$/.test(hubSlug)) return [];
  const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await getProductionPostgresRuntime().sqlPool.query<PartnerRow>(
    PARTNER_FIELDS + FROM_VERIFIED_PARTNERS +
      " AND h.hub_slug=$1 ORDER BY h.updated_at DESC LIMIT $2", [hubSlug, bounded]
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
