import { isDropshippingOnlyVendor } from "../../../../lib/vendor-dropshipping-access";
import { getVendorImpersonationSession, requireVendorSession, vendorOperatingContextForPrincipal } from "../../../../lib/vendor-session";
import { getVendorTrialSnapshot, isVendorTrialPrincipal } from "../../../../lib/vendor-trial-runtime";

export async function GET() {
  try {
    const principal = await requireVendorSession();
    const context = await vendorOperatingContextForPrincipal(principal);
    const impersonation = await getVendorImpersonationSession();
    const trial = isVendorTrialPrincipal(principal) ? await getVendorTrialSnapshot() : undefined;
    return Response.json({
      csrfToken: principal.csrfToken,
      vendorId: principal.vendorId,
      dropshippingOnly: await isDropshippingOnlyVendor(principal.vendorId),
      operatingContext: {
        marketId: context.marketId,
        hubId: context.hubId,
        locationId: context.locationId,
        operatingModel: context.operatingModel,
        capabilities: context.capabilities
      },
      trial: trial ? {
        active: trial.active,
        expiresAt: new Date(trial.trialExpiresAt).toISOString(),
        vendorName: trial.vendorName,
        productCount: trial.productCount,
        mediaCount: trial.mediaCount,
        brandConfigured: trial.brandConfigured,
        storefrontConfigured: trial.storefrontConfigured
      } : undefined,
      impersonation: impersonation ? {
        active: true,
        vendorId: impersonation.vendorId,
        adminEmail: impersonation.admin.email,
        expiresAt: new Date(impersonation.expiresAt).toISOString()
      } : undefined,
      account: { email: principal.email, roles: principal.roles }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_auth_context_failed" }, { status: 401 });
  }
}
