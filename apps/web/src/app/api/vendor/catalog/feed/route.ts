import { isDropshippingOnlyVendor } from "../../../../../lib/vendor-dropshipping-access";
import {
  fetchVendorXml,
  previewVendorProductFeed,
  VENDOR_XML_UPLOAD_MAX_BYTES,
  type VendorProductFeedMappingInput
} from "../../../../../lib/vendor-product-feed-preview";
import {
  connectVendorProductFeed,
  saveVendorProductFeed,
  setVendorProductFeedStatus,
  vendorProductFeedWorkspace
} from "../../../../../lib/vendor-product-feed-service";
import { requireVendorCapability } from "../../../../../lib/vendor-session";
import type { VendorXmlFieldMapping } from "@buy-local-sparta/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  action?: unknown;
  sourceType?: unknown;
  sourceUrl?: unknown;
  sourceFilename?: unknown;
  feedName?: unknown;
  syncIntervalMinutes?: unknown;
  xml?: unknown;
  fieldMapping?: unknown;
  categoryMapping?: unknown;
  defaultCategoryCode?: unknown;
  feedId?: unknown;
  status?: unknown;
};

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function mapping(body: Body): VendorProductFeedMappingInput {
  return {
    fieldMapping: body.fieldMapping && typeof body.fieldMapping === "object" && !Array.isArray(body.fieldMapping)
      ? body.fieldMapping as VendorXmlFieldMapping
      : undefined,
    categoryMapping: body.categoryMapping && typeof body.categoryMapping === "object" && !Array.isArray(body.categoryMapping)
      ? body.categoryMapping as Record<string, string>
      : undefined,
    defaultCategoryCode: string(body.defaultCategoryCode)
  };
}

async function assertAllowed(principal: Awaited<ReturnType<typeof requireVendorCapability>>["principal"]) {
  if (await isDropshippingOnlyVendor(principal.vendorId)) {
    throw new Error("Η εισαγωγή XML είναι απενεργοποιημένη για dropshipping-only vendor.");
  }
}

export async function GET(request: Request) {
  try {
    const { principal } = await requireVendorCapability("catalogue.import", request, false);
    await assertAllowed(principal);
    return Response.json(await vendorProductFeedWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_feed_workspace_failed" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const { principal } = await requireVendorCapability("catalogue.import", request, true);
    await assertAllowed(principal);
    const body = await request.json() as Body;
    const action = string(body.action) ?? "preview";
    const sourceType = body.sourceType === "url" ? "url" : body.sourceType === "upload" ? "upload" : undefined;
    if (!sourceType) throw new Error("Επίλεξε XML upload ή XML URL.");

    if (action === "save" && sourceType === "url") {
      const sourceUrl = string(body.sourceUrl);
      if (!sourceUrl) throw new Error("Δώσε το URL του XML feed.");
      return Response.json(await connectVendorProductFeed(principal, {
        sourceUrl,
        feedName: string(body.feedName) ?? "XML Feed",
        syncIntervalMinutes: Number(body.syncIntervalMinutes ?? 360),
        ...mapping(body)
      }), { status: 202 });
    }

    let xml: string;
    if (sourceType === "url") {
      const sourceUrl = string(body.sourceUrl);
      if (!sourceUrl) throw new Error("Δώσε το URL του XML feed.");
      xml = await fetchVendorXml(sourceUrl);
    } else {
      if (typeof body.xml !== "string") throw new Error("Το XML αρχείο δεν διαβάστηκε.");
      if (Buffer.byteLength(body.xml, "utf8") > VENDOR_XML_UPLOAD_MAX_BYTES) {
        throw new Error("Για upload το μέγιστο μέγεθος είναι 4 MB. Για μεγαλύτερα feeds χρησιμοποίησε XML URL.");
      }
      xml = body.xml;
    }

    if (action === "preview") {
      return Response.json({ preview: await previewVendorProductFeed(principal, xml, mapping(body)) });
    }
    if (action !== "save") throw new Error("Άγνωστη ενέργεια XML feed.");

    return Response.json(await saveVendorProductFeed(principal, {
      sourceType,
      sourceFilename: string(body.sourceFilename),
      feedName: string(body.feedName) ?? "XML Upload",
      syncIntervalMinutes: Number(body.syncIntervalMinutes ?? 360),
      xml,
      ...mapping(body)
    }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_feed_failed" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { principal } = await requireVendorCapability("catalogue.import", request, true);
    await assertAllowed(principal);
    const body = await request.json() as Body;
    const feedId = string(body.feedId);
    if (!feedId) throw new Error("Λείπει το XML feed.");
    if (body.status !== "active" && body.status !== "paused") throw new Error("Μη έγκυρη κατάσταση XML feed.");
    return Response.json({ feed: await setVendorProductFeedStatus(principal, feedId, body.status) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_feed_status_failed" }, { status: 400 });
  }
}
