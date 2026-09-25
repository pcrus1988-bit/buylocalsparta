import { NextResponse } from "next/server";
import {
  shopifyBridgeEnvironmentReadiness,
  verifyShopifyBridgeConnection
} from "../../../../lib/shopify-zendrop-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "x-robots-tag": "noindex, nofollow, noarchive, nosnippet"
};

export async function GET() {
  // Preview environment variables are intentionally required so credentials can be validated before production activation.
  // This endpoint exists only on Vercel preview deployments while the bridge is
  // being commissioned. It never returns credentials or access tokens.
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404, headers: HEADERS }
    );
  }

  const environment = shopifyBridgeEnvironmentReadiness();
  if (!environment.shop || !environment.clientId || !environment.clientSecret) {
    return NextResponse.json(
      { ok: false, error: "shopify_bridge_environment_incomplete", environment },
      { status: 200, headers: HEADERS }
    );
  }

  try {
    const shop = await verifyShopifyBridgeConnection();
    return NextResponse.json(
      { ok: true, environment, shop },
      { status: 200, headers: HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "shopify_bridge_connection_failed",
        environment,
        message: error instanceof Error ? error.message : "unknown_error"
      },
      { status: 200, headers: HEADERS }
    );
  }
}
