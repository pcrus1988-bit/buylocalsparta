import { dailyPushPublicConfiguration } from "../../../../../../lib/daily-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configuration = await dailyPushPublicConfiguration();
  if (!configuration.configured || !configuration.publicKey) {
    return Response.json({ configured: false, source: configuration.source }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  return Response.json(
    { configured: true, publicKey: configuration.publicKey, source: configuration.source },
    { headers: { "cache-control": "public, max-age=300" } }
  );
}
