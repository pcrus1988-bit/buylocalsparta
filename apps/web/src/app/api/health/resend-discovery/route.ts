export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return Response.json({ configured: false }, { status: 200, headers: { "Cache-Control": "no-store" } });
  const headers = { authorization: `Bearer ${apiKey}`, "user-agent": "buy-local-sparta-resend-discovery/1.0" };
  const [domainsResponse, webhooksResponse] = await Promise.all([
    fetch("https://api.resend.com/domains", { headers, cache: "no-store" }),
    fetch("https://api.resend.com/webhooks", { headers, cache: "no-store" })
  ]);
  const domainsPayload = await domainsResponse.json().catch(() => ({})) as Record<string, unknown>;
  const webhooksPayload = await webhooksResponse.json().catch(() => ({})) as Record<string, unknown>;
  const domainRows = Array.isArray(domainsPayload.data) ? domainsPayload.data : [];
  const domainDetails = await Promise.all(domainRows.map(async (value) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const id = typeof row.id === "string" ? row.id : undefined;
    if (!id) return safeDomain(row);
    const response = await fetch(`https://api.resend.com/domains/${encodeURIComponent(id)}`, { headers, cache: "no-store" });
    const detail = await response.json().catch(() => row) as Record<string, unknown>;
    return safeDomain(detail);
  }));
  const webhooks = Array.isArray(webhooksPayload.data) ? webhooksPayload.data.map(safeWebhook) : [];
  return Response.json({
    configured: true,
    domainsStatus: domainsResponse.status,
    webhooksStatus: webhooksResponse.status,
    domains: domainDetails,
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
    receiving: typeof capabilities.receiving === "string" ? capabilities.receiving : undefined,
    records: Array.isArray(row.records) ? row.records.map(safeRecord) : []
  };
}

function safeRecord(value: unknown) {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    record: typeof row.record === "string" ? row.record : undefined,
    name: typeof row.name === "string" ? row.name : undefined,
    type: typeof row.type === "string" ? row.type : undefined,
    status: typeof row.status === "string" ? row.status : undefined,
    priority: typeof row.priority === "number" ? row.priority : undefined
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
