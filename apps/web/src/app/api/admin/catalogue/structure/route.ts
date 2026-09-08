import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  adminCatalogueStructureCategoryDetails,
  adminUpdateCatalogueStructureAttribute,
  adminUpdateCatalogueStructureCategory
} from "../../../../../lib/admin-catalogue-structure-runtime";
import {
  adminCatalogueStructureReviewAttributes,
  adminCatalogueStructureReviewProducts,
  type CatalogueStructureReviewProductScope
} from "../../../../../lib/admin-catalogue-structure-review-runtime";

function booleanInput(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export async function GET(request: Request) {
  try {
    const principal = await requireAdminSession(request, { permission: "catalog.read" });
    const url = new URL(request.url);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const review = url.searchParams.get("review")?.trim();

    if (review === "products") {
      const rawScope = url.searchParams.get("scope")?.trim();
      const scope: CatalogueStructureReviewProductScope = rawScope === "unclassified" || rawScope === "attributes" ? rawScope : "unlinked";
      return Response.json(await adminCatalogueStructureReviewProducts(principal, {
        scope,
        q: url.searchParams.get("q")?.trim() || undefined,
        offset,
        limit
      }));
    }

    if (review === "attributes") {
      return Response.json(await adminCatalogueStructureReviewAttributes(principal, {
        q: url.searchParams.get("q")?.trim() || undefined,
        offset,
        limit
      }));
    }

    const categoryCode = url.searchParams.get("category")?.trim() ?? "";
    if (!categoryCode) throw new Error("Category is required");
    return Response.json(await adminCatalogueStructureCategoryDetails(principal, categoryCode, { offset, limit }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalogue_structure_read_failed" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const body = await request.json() as Record<string, unknown>;
    const kind = String(body.kind ?? "");

    if (kind === "category") {
      const updated = await adminUpdateCatalogueStructureCategory(principal, {
        categoryCode: String(body.categoryCode ?? ""),
        labelEl: String(body.labelEl ?? ""),
        parentCategoryCode: body.parentCategoryCode == null ? null : String(body.parentCategoryCode),
        taxonomyRole: String(body.taxonomyRole ?? ""),
        assignable: booleanInput(body.assignable),
        discoverable: booleanInput(body.discoverable),
        active: booleanInput(body.active),
        sortOrder: Number(body.sortOrder ?? 0)
      });
      return Response.json({ kind, updated });
    }

    if (kind === "attribute") {
      const updated = await adminUpdateCatalogueStructureAttribute(principal, {
        code: String(body.code ?? ""),
        labelEl: String(body.labelEl ?? ""),
        dataType: String(body.dataType ?? ""),
        unit: body.unit == null ? null : String(body.unit),
        valueMode: String(body.valueMode ?? ""),
        groupCode: body.groupCode == null ? null : String(body.groupCode),
        active: booleanInput(body.active),
        filterable: booleanInput(body.filterable),
        variantIdentity: booleanInput(body.variantIdentity)
      });
      return Response.json({ kind, updated });
    }

    throw new Error("Unsupported structure edit kind");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalogue_structure_write_failed" }, { status: 400 });
  }
}
