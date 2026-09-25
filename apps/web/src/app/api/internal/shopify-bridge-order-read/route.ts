import { NextResponse } from "next/server";
import { getShopifyBridgeOrder } from "../../../../lib/shopify-zendrop-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  try {
    const order = await getShopifyBridgeOrder("gid://shopify/Order/7944992391496");
    return NextResponse.json({ ok: true, order }, {
      headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : "unknown_error"
    }, { status: 200, headers: { "cache-control": "private, no-store" } });
  }
}
