import { parseVivaWebhookJson } from "@buy-local-sparta/viva-payments";
import { requireVivaPayments } from "../../../../../lib/viva-runtime";

export const runtime = "nodejs";

const VIVA_LIVE_WEBHOOK_NETWORKS = [
  "51.138.37.238/32",
  "40.127.253.112/28",
  "51.105.129.192/28",
  "20.54.89.16/32",
  "4.223.76.50/32",
  "51.12.157.0/28"
] as const;

function ipv4ToInteger(value: string): number | undefined {
  const parts = value.split(".");
  if (parts.length !== 4) return undefined;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return undefined;
    result = ((result << 8) | octet) >>> 0;
  }
  return result;
}

function matchesIpv4Cidr(ip: string, cidr: string): boolean {
  const [network, prefixText] = cidr.split("/");
  const ipValue = ipv4ToInteger(ip);
  const networkValue = ipv4ToInteger(network ?? "");
  const prefix = Number(prefixText);
  if (ipValue === undefined || networkValue === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((ipValue & mask) >>> 0) === ((networkValue & mask) >>> 0);
}

function requestIp(request: Request): string | undefined {
  // Vercel overwrites x-forwarded-for for normal deployments, so the first value is the
  // public source IP rather than a client-supplied spoofed header.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!forwarded) return undefined;
  return forwarded.startsWith("::ffff:") ? forwarded.slice(7) : forwarded;
}

function vivaWebhookSourceAllowed(request: Request): boolean {
  if (process.env.NODE_ENV !== "production" || process.env.VIVA_ENVIRONMENT !== "live") return true;
  const ip = requestIp(request);
  return Boolean(ip && VIVA_LIVE_WEBHOOK_NETWORKS.some((cidr) => matchesIpv4Cidr(ip, cidr)));
}

export async function GET() {
  try { return Response.json({ Key: await requireVivaPayments().webhookVerificationKey() }, { headers:{"Cache-Control":"no-store"} }); }
  catch (error) { return Response.json({ error:error instanceof Error?error.message:"webhook_verification_failed" }, { status:503 }); }
}

export async function POST(request:Request) {
  if (!vivaWebhookSourceAllowed(request)) return Response.json({ error:"untrusted_viva_webhook_source" }, { status:403 });
  try {
    const raw=await request.text();
    const envelope=parseVivaWebhookJson(raw);
    const result=await requireVivaPayments().handleWebhook(envelope,Date.now());
    return Response.json({ok:true,eventTypeId:result.eventTypeId});
  } catch(error) {
    // Non-2xx deliberately asks Viva to retry. The provider docs describe hourly retries for failed webhook delivery.
    return Response.json({error:error instanceof Error?error.message:"viva_webhook_failed"},{status:503});
  }
}
