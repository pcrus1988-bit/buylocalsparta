/** Public HUB visibility is not inferred from plan selection or temporary trial access. */
export type PartnerEligibility = Readonly<{
  planCode: string;
  applicationStatus: string;
  hasVerifiedOwner: boolean;
  vendorStatus: string;
  directoryVisible: boolean;
  demoMode: boolean;
  vendorSlug?: string | null;
}>;

export const VISIBLE_NON_CLAIM_PLANS = new Set(["presence", "shop", "growth", "pro"]);

export function isVerifiedHubPartner(input: PartnerEligibility): boolean {
  return VISIBLE_NON_CLAIM_PLANS.has(input.planCode) &&
    input.applicationStatus === "converted" &&
    input.hasVerifiedOwner &&
    input.vendorStatus === "active" &&
    input.directoryVisible &&
    !input.demoMode &&
    typeof input.vendorSlug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.vendorSlug);
}
