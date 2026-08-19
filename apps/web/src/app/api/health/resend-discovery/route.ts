export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return Response.json({ error: "not_available_in_production" }, { status: 404 });
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return Response.json({ configured: false }, { status: 200, headers: { "Cache-Control": "no-store" } });
  const headers = { authorization: `Bearer ${apiKey}`, "user-agent": "buy-local-sparta-resend-discovery/1.0" };
  const [domainsResponse, webhooksResponse] = await Promise.all([
    fetch("https://api.resend.com/domains", { headers, cache: "no-store" }),
    fetch("https://api.resend.com/webhooks", { headers, cache: "no-store" })
  ]);
  const domainsPayload = await domainsResponse.json().catch(() => ({})) as Record<string, unknown>;
  const webhooksPayload = await webhooksResponse.json().catch(() => ({})) as Record<string, unknown>;
  const domains = Array.isArray(domainsPayload.data) ? domainsPayload.data.map(safeDomain) : [];
  const webhooks = Array.isArray(webhooksPayload.data) ? webhooksPayload.data.map(safeWebhook) : [];
  return Response.json({
    configured: true,
    domainsStatus: domainsResponse.status,
    webhooksStatus: webhooksResponse.status,
    domains,
    webhooks
  }, { headers: { "Cache-Control": "no-store" } });
}

function safeDomain(value: unknown) {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const capabilities = row.capabilities && typeof row.capabilities === "object" ? row.capabilities as Record<string, unknown> : {};
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    name: typeof row.name === "string" ? row.name : undefined,
    status: typeof row.status === "string" ? row.status : undefined,
    region: typeof row.region === "string" ? row.region : undefined,
    sending: typeof capabilities.sending === "string" ? capabilities.sending : undefined,
    receiving: typeof capabilities.receiving === "string" ? capabilities.receiving : undefined
  };
}

function safeWebhook(value: unknown) {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    endpoint: typeof row.endpoint === "string" ? row.endpoint : undefined,
    status: typeof row.status === "string" ? row.status : undefined,
    events: Array.isArray(row.events) ? row.events.filter((item): item is string => typeof item === "string") : []
  };
}
