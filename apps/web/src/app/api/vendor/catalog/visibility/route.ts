import type { SessionPrincipal } from "@buy-local-sparta/core";
import { requireVendorSession } from "../../../../../lib/vendor-session";
import { setVendorCatalogVisibility, vendorCatalogControlWorkspace } from "../../../../../lib/vendor-catalog-control-service";
import { setVendorProductVisibility } from "../../../../../lib/vendor-product-visibility-service";
import { getProductionPostgresRuntime } from "../../../../../lib/postgres-runtime";

async function resolveActorPrincipal(principal: SessionPrincipal): Promise<SessionPrincipal> {
  const result = await getProductionPostgresRuntime().sqlPool.query(
    `SELECT id::text AS id FROM public.users WHERE id::text=$1 OR public_id=$1 LIMIT 1`,
    [principal.userId]
  );
  const resolvedUserId = result.rows[0]?.id;
  if (typeof resolvedUserId !== "string" || !resolvedUserId) throw new Error("Vendor user account could not be resolved");
  return resolvedUserId === principal.userId ? principal : { ...principal, userId: resolvedUserId };
}

export async function PUT(request: Request) {
  try {
    const sessionPrincipal = await requireVendorSession(request, true);
    const principal = await resolveActorPrincipal(sessionPrincipal);
    const body = await request.json() as Record<string, unknown>;
    const scope = body.scope === "category" ? "category" : body.scope === "product" ? "product" : undefined;
    if (!scope) throw new Error("Visibility scope must be product or category");
    if (typeof body.visible !== "boolean") throw new Error("Visibility must be true or false");

    if (scope === "product") {
      await setVendorProductVisibility(principal, {
        offerId: typeof body.offerId === "string" ? body.offerId : "",
        visible: body.visible
      });
    } else {
      await setVendorCatalogVisibility(principal, {
        scope: "category",
        visible: body.visible,
        categoryId: typeof body.categoryId === "string" ? body.categoryId : undefined
      });
    }

    return Response.json(await vendorCatalogControlWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_visibility_failed" }, { status: 400 });
  }
}
