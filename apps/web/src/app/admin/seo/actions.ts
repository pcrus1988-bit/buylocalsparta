"use server";

import { revalidatePath } from "next/cache";
import { assertAdminCsrf, assertAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { updateSeoGlobalSettings } from "../../../lib/seo-settings";

export type SeoSettingsActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
}>;

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

export async function updateSeoGlobalSettingsAction(
  _previous: SeoSettingsActionState,
  formData: FormData
): Promise<SeoSettingsActionState> {
  try {
    const principal = await getAdminSession();
    if (!principal) throw new Error("ADMIN_AUTH_REQUIRED");
    assertAdminPermission(principal, "content.write");
    assertAdminCsrf(principal, field(formData, "csrfToken"));

    await updateSeoGlobalSettings({
      principal,
      expectedVersion: Number(field(formData, "expectedVersion")),
      reason: field(formData, "reason"),
      emergencyConfirmation: field(formData, "emergencyConfirmation") || undefined,
      settings: {
        canonicalOrigin: field(formData, "canonicalOrigin"),
        siteName: field(formData, "siteName"),
        defaultTitle: field(formData, "defaultTitle"),
        titleTemplate: field(formData, "titleTemplate"),
        defaultDescription: field(formData, "defaultDescription"),
        defaultOpenGraphTitle: field(formData, "defaultOpenGraphTitle"),
        defaultOpenGraphDescription: field(formData, "defaultOpenGraphDescription"),
        defaultOpenGraphImage: field(formData, "defaultOpenGraphImage") || undefined,
        googleSiteVerification: field(formData, "googleSiteVerification") || undefined,
        indexingEnabled: checked(formData, "indexingEnabled"),
        researchVendorIndexingEnabled: checked(formData, "researchVendorIndexingEnabled"),
        researchVendorMinimumScore: Number(field(formData, "researchVendorMinimumScore")),
        publicMediaCrawlEnabled: checked(formData, "publicMediaCrawlEnabled"),
        sitemap: {
          staticPages: checked(formData, "sitemapStaticPages"),
          categories: checked(formData, "sitemapCategories"),
          products: checked(formData, "sitemapProducts"),
          partnerVendors: checked(formData, "sitemapPartnerVendors"),
          researchVendors: checked(formData, "sitemapResearchVendors")
        }
      }
    });

    revalidatePath("/", "layout");
    revalidatePath("/robots.txt");
    revalidatePath("/sitemap.xml");
    revalidatePath("/admin/seo");
    return { status: "success", message: "SEO settings saved and audit evidence recorded." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save SEO settings." };
  }
}
