const apiKey = process.env.RESEND_API_KEY?.trim();
const isProduction = process.env.VERCEL_ENV === "production" || process.env.VERCEL_TARGET_ENV === "production";

if (!apiKey || !isProduction) {
  console.log("Resend webhook bootstrap skipped: production RESEND_API_KEY not available.");
  process.exit(0);
}

const baseUrl = (process.env.RESEND_BASE_URL?.trim() || "https://api.resend.com").replace(/\/$/, "");
const publicBaseUrl = (process.env.BLS_PUBLIC_BASE_URL?.trim() || "https://kontamou.site").replace(/\/$/, "");
const endpoint = process.env.RESEND_WEBHOOK_ENDPOINT?.trim() || `${publicBaseUrl}/api/webhooks/resend`;
const events = ["email.bounced", "email.complained", "email.failed", "email.received"];
const headers = {
  authorization: `Bearer ${apiKey}`,
  "content-type": "application/json",
  "user-agent": "buy-local-sparta-vercel-build/1.0"
};

const listResponse = await fetch(`${baseUrl}/webhooks`, { headers });
const listPayload = await listResponse.json().catch(() => ({}));
if (!listResponse.ok) throw new Error(`Resend webhook list failed (${listResponse.status}): ${String(listPayload?.message || "unexpected response")}`);
const rows = Array.isArray(listPayload.data) ? listPayload.data : [];
const existing = rows.find((row) => row && typeof row === "object" && row.endpoint === endpoint);

if (existing?.id) {
  const sameEvents = Array.isArray(existing.events) && events.every((event) => existing.events.includes(event)) && existing.events.length === events.length;
  if (existing.status !== "enabled" || !sameEvents) {
    const response = await fetch(`${baseUrl}/webhooks/${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ endpoint, events, status: "enabled" })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Resend webhook update failed (${response.status}): ${String(body?.message || "unexpected response")}`);
    console.log(`Resend webhook ${existing.id} updated for Buy Local Sparta.`);
  } else {
    console.log(`Resend webhook ${existing.id} already configured for Buy Local Sparta.`);
  }
} else {
  const response = await fetch(`${baseUrl}/webhooks`, {
    method: "POST",
    headers,
    body: JSON.stringify({ endpoint, events })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body?.id !== "string") throw new Error(`Resend webhook creation failed (${response.status}): ${String(body?.message || "unexpected response")}`);
  console.log(`Resend webhook ${body.id} created for Buy Local Sparta.`);
}
