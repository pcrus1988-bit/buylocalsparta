import { NextRequest, NextResponse } from "next/server";
import { createControlledZendropBridgeTestOrder } from "../../../../lib/shopify-zendrop-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "x-robots-tag": "noindex, nofollow, noarchive, nosnippet"
};

function decodePayload(raw: string | null): { address1: string; city: string; zip: string } {
  if (!raw) throw new Error("missing_payload");
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const value = JSON.parse(text) as Record<string, unknown>;
  const address1 = typeof value.address1 === "string" ? value.address1.trim() : "";
  const city = typeof value.city === "string" ? value.city.trim() : "";
  const zip = typeof value.zip === "string" ? value.zip.trim() : "";
  if (!address1 || !city || !zip) throw new Error("invalid_payload");
  return { address1, city, zip };
}

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: HEADERS });
  }

  try {
    const payload = decodePayload(request.nextUrl.searchParams.get("p"));
    const result = await createControlledZendropBridgeTestOrder(payload);
    return NextResponse.json(
      {
        ok: true,
        created: result.created,
        order: result.order
      },
      { status: 200, headers: HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "bridge_test_order_failed",
        message: error instanceof Error ? error.message : "unknown_error"
      },
      { status: 200, headers: HEADERS }
    );
  }
}
