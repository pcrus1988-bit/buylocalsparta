import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const require = createRequire(import.meta.url);
const VAULT_PUBLIC_NAME = "bls_web_push_public_key";
const VAULT_PRIVATE_NAME = "bls_web_push_private_key";
const VAULT_SUBJECT_NAME = "bls_web_push_subject";
const DEFAULT_VAPID_SUBJECT = "mailto:info@kontamou.site";

type WebPushError = Error & { statusCode?: number };
type WebPushModule = {
  generateVAPIDKeys(): { publicKey: string; privateKey: string };
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, options?: { TTL?: number; urgency?: string }): Promise<unknown>;
};
type VapidConfig = Readonly<{ publicKey?: string; privateKey?: string; subject?: string; ready: boolean; source: "environment" | "vault" | "none" }>;
type DailyVapidSecretRow = Readonly<{ secret_name: string; secret_value: string }>;

export type DailyPushSubscriptionInput = Readonly<{
  endpoint: string;
  keys: { p256dh: string; auth: string };
}>;

let cachedVapidConfig: VapidConfig | undefined;
let vapidConfigPromise: Promise<VapidConfig> | undefined;

function webPushModule(): WebPushModule { return require("web-push") as WebPushModule; }

function environmentConfig(): VapidConfig {
  const publicKey = process.env.BLS_WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = process.env.BLS_WEB_PUSH_PRIVATE_KEY?.trim();
  const subject = process.env.BLS_WEB_PUSH_SUBJECT?.trim() || DEFAULT_VAPID_SUBJECT;
  return { publicKey, privateKey, subject, ready: Boolean(publicKey && privateKey && subject), source: publicKey && privateKey ? "environment" : "none" };
}

function vapidConfigFromRows(rows: ReadonlyArray<DailyVapidSecretRow>): VapidConfig {
  const values = new Map(rows.map((row) => [String(row.secret_name), String(row.secret_value)]));
  const publicKey = values.get(VAULT_PUBLIC_NAME)?.trim();
  const privateKey = values.get(VAULT_PRIVATE_NAME)?.trim();
  const subject = values.get(VAULT_SUBJECT_NAME)?.trim() || process.env.BLS_WEB_PUSH_SUBJECT?.trim() || DEFAULT_VAPID_SUBJECT;
  return { publicKey, privateKey, subject, ready: Boolean(publicKey && privateKey && subject), source: publicKey && privateKey ? "vault" : "none" };
}

async function readVaultConfig(): Promise<VapidConfig> {
  if (!productionDatabaseConfigured()) return { ready: false, source: "none" };
  const rows = await getProductionPostgresRuntime().nativePool.query<DailyVapidSecretRow>(`
    SELECT secret_name,secret_value
    FROM bls_private.get_daily_vapid_config()
  `);
  return vapidConfigFromRows(rows.rows);
}

async function provisionVaultConfig(): Promise<VapidConfig> {
  if (!productionDatabaseConfigured()) return { ready: false, source: "none" };
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bls:web-push:vapid'))");
    const rows = await client.query<DailyVapidSecretRow>(`
      SELECT secret_name,secret_value
      FROM bls_private.get_daily_vapid_config()
    `);
    const existing = vapidConfigFromRows(rows.rows);
    let publicKey = existing.publicKey;
    let privateKey = existing.privateKey;
    let subject = rows.rows.find((row) => row.secret_name === VAULT_SUBJECT_NAME)?.secret_value?.trim();

    if (Boolean(publicKey) !== Boolean(privateKey)) {
      throw new Error("Supabase Vault contains an incomplete VAPID key pair; repair the pair before enabling Daily push");
    }
    if (!publicKey && !privateKey) {
      const generated = webPushModule().generateVAPIDKeys();
      publicKey = generated.publicKey;
      privateKey = generated.privateKey;
      await client.query("SELECT bls_private.create_daily_vapid_secret($1,$2,$3)", [publicKey, VAULT_PUBLIC_NAME, "KONTA MOY Daily Web Push VAPID public key"]);
      await client.query("SELECT bls_private.create_daily_vapid_secret($1,$2,$3)", [privateKey, VAULT_PRIVATE_NAME, "KONTA MOY Daily Web Push VAPID private key"]);
    }
    if (!subject) {
      subject = process.env.BLS_WEB_PUSH_SUBJECT?.trim() || DEFAULT_VAPID_SUBJECT;
      await client.query("SELECT bls_private.create_daily_vapid_secret($1,$2,$3)", [subject, VAULT_SUBJECT_NAME, "KONTA MOY Daily Web Push VAPID contact subject"]);
    }
    await client.query("COMMIT");
    return { publicKey, privateKey, subject, ready: Boolean(publicKey && privateKey && subject), source: "vault" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

async function loadVapidConfig(): Promise<VapidConfig> {
  if (cachedVapidConfig?.ready) return cachedVapidConfig;
  if (vapidConfigPromise) return vapidConfigPromise;
  vapidConfigPromise = (async () => {
    const fromEnvironment = environmentConfig();
    if (fromEnvironment.ready) return fromEnvironment;
    if (!productionDatabaseConfigured()) return fromEnvironment;
    try {
      const fromVault = await readVaultConfig();
      if (fromVault.ready) return fromVault;
      if (process.env.BLS_WEB_PUSH_VAULT_AUTOPROVISION === "false") return fromVault;
      return await provisionVaultConfig();
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "daily_push.vapid_config_failed", message: error instanceof Error ? error.message : String(error) }));
      return { ready: false, source: "none" };
    }
  })();
  try {
    const result = await vapidConfigPromise;
    if (result.ready) cachedVapidConfig = result;
    return result;
  } finally { vapidConfigPromise = undefined; }
}

export async function dailyPushPublicConfiguration() {
  const current = await loadVapidConfig();
  return { configured: current.ready, publicKey: current.ready ? current.publicKey : undefined, source: current.source };
}

function requiredVendor(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("DAILY_AUTH_REQUIRED");
  return principal.vendorId;
}

function endpointHash(endpoint: string): string { return createHash("sha256").update(endpoint).digest("hex"); }

function validateSubscription(input: DailyPushSubscriptionInput) {
  let url: URL;
  try { url = new URL(input.endpoint); } catch { throw new Error("Invalid push endpoint"); }
  if (url.protocol !== "https:") throw new Error("Push endpoint must use HTTPS");
  if (!input.keys?.p256dh || input.keys.p256dh.length > 512) throw new Error("Invalid push p256dh key");
  if (!input.keys?.auth || input.keys.auth.length > 256) throw new Error("Invalid push auth key");
}

export async function dailyPushStatus(principal: SessionPrincipal) {
  const vendorId = requiredVendor(principal);
  const configuration = await dailyPushPublicConfiguration();
  if (!productionDatabaseConfigured()) return { ...configuration, devices: 0 };
  const result = await getProductionPostgresRuntime().nativePool.query(`SELECT COUNT(*)::int devices
    FROM vendor_daily_push_subscriptions
    WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)
      AND user_id=(SELECT id FROM users WHERE public_id=$2) AND active=true`, [vendorId, principal.userId]);
  return { ...configuration, devices: Number(result.rows[0]?.devices ?? 0) };
}

export async function saveDailyPushSubscription(principal: SessionPrincipal, input: DailyPushSubscriptionInput, userAgent?: string) {
  validateSubscription(input);
  const vendorId = requiredVendor(principal);
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query(`INSERT INTO vendor_daily_push_subscriptions(
      id,public_id,vendor_id,user_id,endpoint,endpoint_hash,p256dh,auth_secret,active,failure_count,user_agent,created_at,updated_at)
    VALUES($1,$2,(SELECT id FROM vendor_businesses WHERE public_id=$3),(SELECT id FROM users WHERE public_id=$4),$5,$6,$7,$8,true,0,$9,now(),now())
    ON CONFLICT (vendor_id,user_id,endpoint_hash) DO UPDATE SET endpoint=EXCLUDED.endpoint,p256dh=EXCLUDED.p256dh,auth_secret=EXCLUDED.auth_secret,
      active=true,failure_count=0,user_agent=EXCLUDED.user_agent,updated_at=now()
    RETURNING public_id`, [randomUUID(),`daily_push_${randomUUID().replaceAll("-", "")}`,vendorId,principal.userId,input.endpoint,endpointHash(input.endpoint),input.keys.p256dh,input.keys.auth,userAgent?.slice(0,500) ?? null]);
  if (!result.rowCount) throw new Error("Unable to register this device for Daily push");
  return { ok: true, id: String(result.rows[0].public_id) };
}

export async function removeDailyPushSubscription(principal: SessionPrincipal, endpoint: string) {
  const vendorId = requiredVendor(principal);
  if (!endpoint) throw new Error("Push endpoint is required");
  await getProductionPostgresRuntime().nativePool.query(`UPDATE vendor_daily_push_subscriptions SET active=false,updated_at=now()
    WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)
      AND user_id=(SELECT id FROM users WHERE public_id=$2) AND endpoint_hash=$3`, [vendorId,principal.userId,endpointHash(endpoint)]);
  return { ok: true };
}

function dailyUrl(eventType: string, payload: Record<string, unknown>): string {
  const supplied = payload.dailyUrl;
  if (typeof supplied === "string" && supplied.startsWith("/daily") && !supplied.startsWith("//")) return supplied;
  const lowered = eventType.toLowerCase();
  if (["ask", "advice", "conversation", "counteroffer"].some((part) => lowered.includes(part))) return "/daily/ask-local";
  return "/daily";
}

async function mirrorOperationalNotifications(now: number) {
  const db = getProductionPostgresRuntime().nativePool;
  const mirrored = await db.query(`INSERT INTO notifications(
      id,public_id,user_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
    SELECT gen_random_uuid(),'notification_'||replace(gen_random_uuid()::text,'-',''),NULL,n.vendor_id,'push',n.purpose,n.event_type,
      n.template_version,n.locale,n.title,n.body,n.payload,'queued','daily-push:'||n.public_id,$1
    FROM notifications n
    WHERE n.channel='in_app' AND n.vendor_id IS NOT NULL AND n.purpose IN ('transactional','service')
      AND n.created_at >= $1 - interval '48 hours'
      AND EXISTS (SELECT 1 FROM vendor_daily_push_subscriptions ps WHERE ps.vendor_id=n.vendor_id AND ps.active=true)
      AND NOT EXISTS (SELECT 1 FROM notifications p WHERE p.dedupe_key='daily-push:'||n.public_id)
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id`, [new Date(now)]);
  return mirrored.rowCount;
}

function configuredWebPush(current: VapidConfig): WebPushModule {
  if (!current.ready || !current.publicKey || !current.privateKey || !current.subject) throw new Error("Web Push VAPID configuration is incomplete");
  const module = webPushModule();
  module.setVapidDetails(current.subject, current.publicKey, current.privateKey);
  return module;
}

export async function runDailyPushDelivery(now = Date.now(), limit = 50) {
  if (!productionDatabaseConfigured()) return { configured: false, source: "none", mirrored: 0, claimed: 0, sent: 0, failed: 0 };
  const vapid = await loadVapidConfig();
  if (!vapid.ready) return { configured: false, source: vapid.source, mirrored: 0, claimed: 0, sent: 0, failed: 0 };
  const runtime = getProductionPostgresRuntime();
  const mirrored = await mirrorOperationalNotifications(now);
  const workerId = `daily-push:${process.env.VERCEL_REGION?.trim() || "runtime"}`;
  const leaseUntil = new Date(now + 2 * 60_000);
  const claimed = await runtime.nativePool.query(`WITH picked AS (
      SELECT id FROM notifications
      WHERE channel='push' AND status='queued' AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
        AND (delivery_lease_until IS NULL OR delivery_lease_until < $1)
      ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED
    )
    UPDATE notifications n SET status='sending',delivery_attempts=n.delivery_attempts+1,
      delivery_lease_owner=$3,delivery_lease_until=$4,last_delivery_error=NULL
    FROM picked WHERE n.id=picked.id
    RETURNING n.id::text notification_uuid,n.public_id,n.vendor_id::text vendor_uuid,n.event_type,n.title,n.body,n.payload,n.delivery_attempts`,
    [new Date(now),limit,workerId,leaseUntil]);
  const sender = configuredWebPush(vapid);
  let sent = 0, failed = 0;
  for (const row of claimed.rows) {
    const notificationUuid = String(row.notification_uuid);
    const vendorUuid = String(row.vendor_uuid);
    const attempts = Number(row.delivery_attempts ?? 1);
    const subscriptions = await runtime.nativePool.query(`SELECT id::text id,endpoint,p256dh,auth_secret
      FROM vendor_daily_push_subscriptions WHERE vendor_id=$1 AND active=true ORDER BY updated_at DESC`, [vendorUuid]);
    const payloadObject = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>;
    const message = JSON.stringify({
      title: String(row.title || "KONTA MOY Daily"),
      body: String(row.body || "Υπάρχει νέα ενέργεια που χρειάζεται την προσοχή σου."),
      url: dailyUrl(String(row.event_type || ""), payloadObject),
      tag: `daily:${String(row.event_type || "notification")}:${String(row.public_id)}`
    });
    let successCount = 0;
    const errors: string[] = [];
    for (const subscription of subscriptions.rows) {
      try {
        await sender.sendNotification({ endpoint: String(subscription.endpoint), keys: { p256dh: String(subscription.p256dh), auth: String(subscription.auth_secret) } }, message, { TTL: 300, urgency: "high" });
        successCount += 1;
        await runtime.nativePool.query("UPDATE vendor_daily_push_subscriptions SET failure_count=0,last_success_at=$2,updated_at=$2 WHERE id=$1", [String(subscription.id),new Date(now)]);
      } catch (cause) {
        const error = cause as WebPushError;
        const statusCode = Number(error.statusCode ?? 0);
        errors.push(statusCode ? `${statusCode}:${error.message}` : error.message);
        await runtime.nativePool.query(`UPDATE vendor_daily_push_subscriptions SET active=CASE WHEN $2 IN (404,410) THEN false ELSE active END,
          failure_count=failure_count+1,last_failure_at=$3,updated_at=$3 WHERE id=$1`, [String(subscription.id),statusCode,new Date(now)]);
      }
    }
    const ok = successCount > 0;
    const terminal = attempts >= 5;
    const nextAttempt = new Date(now + Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000);
    await runtime.nativePool.query(`UPDATE notifications SET status=$2,sent_at=CASE WHEN $2='sent' THEN $3 ELSE sent_at END,
      failed_at=CASE WHEN $2='failed' THEN $3 ELSE failed_at END,next_attempt_at=$4,delivery_lease_owner=NULL,delivery_lease_until=NULL,last_delivery_error=$5
      WHERE id=$1`, [notificationUuid,ok ? "sent" : terminal ? "failed" : "queued",new Date(now),ok || terminal ? null : nextAttempt,ok ? null : errors.join(" | ").slice(0,2000) || "No active Daily push device"]);
    await runtime.nativePool.query(`INSERT INTO notification_delivery_attempts(
      id,public_id,notification_id,attempt,channel,provider,status,masked_destination,provider_message_id,error,started_at,completed_at)
      VALUES($1,$2,$3,$4,'push','web_push',$5,$6,NULL,$7,$8,$8)
      ON CONFLICT (notification_id,attempt) DO NOTHING`, [randomUUID(),`nda_${randomUUID().replaceAll("-", "")}`,notificationUuid,attempts,ok ? "sent" : "failed",`Daily devices ${successCount}/${subscriptions.rowCount}`,ok ? null : errors.join(" | ").slice(0,2000) || "No active Daily push device",new Date(now)]);
    if (ok) sent += 1; else failed += 1;
  }
  return { configured: true, source: vapid.source, mirrored, claimed: claimed.rowCount, sent, failed };
}
