import type { VendorXmlFieldMapping } from "@buy-local-sparta/core";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import {
  adminPreviewVendorProductFeedMapping,
  adminRemapVendorProductFeed
} from "../../../../../../../lib/admin-vendor-product-feed-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  action?: "preview" | "save";
  fieldMapping?: VendorXmlFieldMapping;
  categoryMapping?: Record<string, string>;
  defaultCategoryCode?: string;
};

export async function POST(request: Request, context: { params: Promise<{ feedId: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const { feedId } = await context.params;
    const body = await request.json() as Body;
    const mapping = {
      fieldMapping: body.fieldMapping ?? {},
      categoryMapping: body.categoryMapping ?? {},
      defaultCategoryCode: body.defaultCategoryCode?.trim() || undefined
    };
    const preview = body.action === "save"
      ? (await adminRemapVendorProductFeed(principal, feedId, mapping)).preview
      : await adminPreviewVendorProductFeedMapping(principal, feedId, mapping);
    return Response.json({ preview }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "vendor_feed_remap_failed";
    const status = message === "ADMIN_AUTH_REQUIRED" ? 401 : message.includes("permission") ? 403 : 400;
    return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
