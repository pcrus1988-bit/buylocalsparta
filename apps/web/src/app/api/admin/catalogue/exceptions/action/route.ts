import { requireAdminSession } from "../../../../../../lib/admin-session";
import { adminCatalogueExceptionCandidates } from "../../../../../../lib/admin-catalogue-exception-candidates-runtime";
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

      const candidates = await adminCatalogueExceptionCandidates(principal, exceptionId);
      const selected = candidates.find(
        (candidate) => candidate.canonicalVariantId === canonicalVariantId
      );
      if (!selected) {
        throw new Error("Selected canonical is not an eligible strong-identity candidate");
      }
      if (!selected.safeToResolve) {
        throw new Error("Selected canonical is blocked by a material variant conflict");
      }

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
