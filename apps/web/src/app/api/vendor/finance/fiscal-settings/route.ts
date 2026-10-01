import { requireVendorSession } from "../../../../../lib/vendor-session";
import {
  testVendorAadeConnection,
  updateVendorFiscalSettings,
  vendorFiscalSettings
} from "../../../../../lib/vendor-fiscal-settings";

function statusFor(message: string): number {
  if (/AUTH_REQUIRED|OWNER_REQUIRED|HUB_VENDOR_REQUIRED/.test(message)) return 403;
  return 400;
}

export async function GET() {
  try {
    const principal = await requireVendorSession();
    return Response.json(await vendorFiscalSettings(principal), {
      headers: { "cache-control": "private, no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "vendor_fiscal_settings_failed";
    return Response.json({ error: message }, { status: statusFor(message) });
  }
}

export async function PUT(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await updateVendorFiscalSettings(principal, body), {
      headers: { "cache-control": "private, no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "vendor_fiscal_settings_update_failed";
    return Response.json({ error: message }, { status: statusFor(message) });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action !== "test_connection") {
      return Response.json({ error: "Unsupported fiscal settings action" }, { status: 400 });
    }
    return Response.json(await testVendorAadeConnection(principal), {
      headers: { "cache-control": "private, no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "vendor_aade_connection_test_failed";
    return Response.json({ error: message }, { status: statusFor(message) });
  }
}
