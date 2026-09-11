import { requireAdminSession } from "../../../../../../lib/admin-session";
import {
  adminResolveCatalogueException,
  type CatalogueExceptionResolutionInput
} from "../../../../../../lib/admin-catalogue-exceptions-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, {
      csrf: true,
      permission: "catalog.write"
    });
    const body = await request.json() as Record<string, unknown>;
    const kind = String(body.kind ?? "");
    const exceptionId = typeof body.exceptionId === "string" ? body.exceptionId.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!exceptionId) throw new Error("Exception ID is required");
    if (kind !== "resolve_to_canonical" && kind !== "ignore") {
      throw new Error("Unsupported catalogue exception action");
    }

    let input: CatalogueExceptionResolutionInput;
    if (kind === "resolve_to_canonical") {
      const canonicalVariantId = typeof body.canonicalVariantId === "string"
        ? body.canonicalVariantId.trim()
        : "";
      if (!canonicalVariantId) throw new Error("Canonical variant ID is required");
      input = { kind, exceptionId, canonicalVariantId, reason };
    } else {
      input = { kind, exceptionId, reason };
    }

    return Response.json(await adminResolveCatalogueException(principal, input));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "catalogue_exception_action_failed" },
      { status: 400 }
    );
  }
}
