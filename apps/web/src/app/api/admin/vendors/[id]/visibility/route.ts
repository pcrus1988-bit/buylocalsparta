import { requireAdminSession } from "../../../../../../lib/admin-session";
import { setAdminVendorDirectoryVisibility } from "../../../../../../lib/vendor-admin-controls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function transientDatabaseFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|trying to connect|connection terminated|connection reset|ECONNRESET|ECONNREFUSED|ETIMEDOUT|too many clients|remaining connection slots/i.test(message);
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const { id } = await context.params;
    const body = await request.json() as { visible?: unknown; reason?: unknown };
    if (typeof body.visible !== "boolean") throw new Error("Invalid directory visibility state");

    const input = {
      vendorId: id,
      visible: body.visible,
      reason: typeof body.reason === "string" ? body.reason : undefined
    };

    let result: Awaited<ReturnType<typeof setAdminVendorDirectoryVisibility>> | undefined;
    let firstError: unknown;
    try {
      result = await setAdminVendorDirectoryVisibility(principal, input);
    } catch (error) {
      firstError = error;
      if (!transientDatabaseFailure(error)) throw error;
      await wait(350);
      result = await setAdminVendorDirectoryVisibility(principal, input);
    }

    return Response.json({ ok: true, result, retried: Boolean(firstError) });
  } catch (error) {
    const transient = transientDatabaseFailure(error);
    if (transient) {
      console.error(JSON.stringify({
        level: "error",
        event: "admin.vendor_visibility_database_busy",
        message: error instanceof Error ? error.message : String(error)
      }));
    }
    if (transient) {
      return Response.json(
        { error: "Η βάση δεδομένων είναι προσωρινά απασχολημένη. Η δημοσίευση δεν εφαρμόστηκε· δοκιμάστε ξανά." },
        { status: 503, headers: { "Retry-After": "2" } }
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "vendor_visibility_failed" },
      { status: 400 }
    );
  }
}
