import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { publicVendorInstagramSettings, type VendorInstagramSettings } from "./vendor-storefront-settings";

const INSTAGRAM_AUTHORIZE_ENDPOINT = "https://www.instagram.com/oauth/authorize";
const INSTAGRAM_TOKEN_ENDPOINT = "https://api.instagram.com/oauth/access_token";
const INSTAGRAM_GRAPH_ORIGIN = "https://graph.instagram.com";
const OAUTH_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type VendorInstagramConnectionStatus = Readonly<{
  configured: boolean;
  connected: boolean;
  username?: string;
  accountType?: string;
  profilePictureUrl?: string;
  connectedAt?: string;
  tokenExpiresAt?: string;
}>;

export type PublicVendorInstagramMedia = Readonly<{
  id: string;
  caption?: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaProductType?: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  permalink: string;
  timestamp?: string;
}>;

type OAuthState = Readonly<{
  vendorId: string;
  nonce: string;
  expiresAt: number;
}>;

type ConnectionRow = SqlRow & {
  vendor_uuid?: string;
  instagram_user_id?: string;
  username?: string;
  account_type?: string | null;
  profile_picture_url?: string | null;
  access_token_ciphertext?: string;
  token_expires_at?: string | null;
  connected_at?: string | null;
  storefront_settings?: unknown;
  vendor_status?: string;
};

export function instagramOAuthConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_APP_ID?.trim() && process.env.INSTAGRAM_APP_SECRET?.trim());
}

export function beginVendorInstagramOAuth(principal: SessionPrincipal, request: Request): string {
  const vendorId = requiredVendorId(principal);
  const appId = requiredInstagramEnv("INSTAGRAM_APP_ID");
  requiredInstagramEnv("INSTAGRAM_APP_SECRET");
  const redirectUri = instagramRedirectUri(request);
  const state = signOAuthState({
    vendorId,
    nonce: randomBytes(24).toString("base64url"),
    expiresAt: Date.now() + OAUTH_TTL_MS
  });
  const url = new URL(INSTAGRAM_AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_business_basic");
  url.searchParams.set("state", state);
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_authentication", "1");
  return url.toString();
}

export async function completeVendorInstagramOAuth(
  principal: SessionPrincipal,
  request: Request,
  input: { code: string; state: string }
): Promise<VendorInstagramConnectionStatus> {
  const vendorId = requiredVendorId(principal);
  if (!productionDatabaseConfigured()) throw new Error("instagram_database_not_configured");
  const oauth = readOAuthState(input.state);
  if (oauth.vendorId !== vendorId) throw new Error("instagram_oauth_vendor_mismatch");
  const redirectUri = instagramRedirectUri(request);
  const shortToken = await exchangeAuthorizationCode(input.code, redirectUri);
  const longToken = await exchangeLongLivedToken(shortToken.accessToken);
  const accessToken = longToken.accessToken || shortToken.accessToken;
  const profile = await fetchInstagramProfile(accessToken);
  const expiresAt = longToken.expiresIn
    ? new Date(Date.now() + longToken.expiresIn * 1000).toISOString()
    : undefined;

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  await uow.withTransaction({ actorUserId: principal.userId, vendorId }, async (tx) => {
    const vendor = await tx.query<SqlRow>(`
      SELECT id::text AS vendor_uuid,status::text AS vendor_status,demo_mode
      FROM vendor_businesses
      WHERE public_id=$1 OR id::text=$1
      LIMIT 1
      FOR UPDATE
    `, [vendorId]);
    const row = vendor.rows[0];
    if (!row) throw new Error("instagram_vendor_not_found");
    const status = String(row.vendor_status ?? "");
    if (row.demo_mode !== true && status !== "active") throw new Error("instagram_vendor_not_active");

    await tx.query(`
      INSERT INTO vendor_instagram_connections(
        vendor_id,instagram_user_id,username,account_type,profile_picture_url,
        access_token_ciphertext,token_expires_at,connected_at,refreshed_at,updated_at
      )
      VALUES($1::uuid,$2,$3,$4,$5,$6,$7::timestamptz,now(),now(),now())
      ON CONFLICT(vendor_id) DO UPDATE SET
        instagram_user_id=EXCLUDED.instagram_user_id,
        username=EXCLUDED.username,
        account_type=EXCLUDED.account_type,
        profile_picture_url=EXCLUDED.profile_picture_url,
        access_token_ciphertext=EXCLUDED.access_token_ciphertext,
        token_expires_at=EXCLUDED.token_expires_at,
        connected_at=now(),
        refreshed_at=now(),
        updated_at=now()
    `, [
      String(row.vendor_uuid),
      profile.id,
      profile.username,
      profile.accountType ?? null,
      profile.profilePictureUrl ?? null,
      encryptAccessToken(accessToken),
      expiresAt ?? null
    ]);
  }, { isolation: "serializable" });

  return vendorInstagramConnectionStatus(principal);
}

export async function vendorInstagramConnectionStatus(principal: SessionPrincipal): Promise<VendorInstagramConnectionStatus> {
  const vendorId = requiredVendorId(principal);
  if (!productionDatabaseConfigured()) return { configured: instagramOAuthConfigured(), connected: false };
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction({ actorUserId: principal.userId, vendorId }, async (tx) => {
    const result = await tx.query<ConnectionRow>(`
      SELECT username,account_type,profile_picture_url,connected_at::text,token_expires_at::text
      FROM vendor_instagram_connections connection
      JOIN vendor_businesses vendor ON vendor.id=connection.vendor_id
      WHERE vendor.public_id=$1 OR vendor.id::text=$1
      LIMIT 1
    `, [vendorId]);
    const row = result.rows[0];
    return row ? {
      configured: instagramOAuthConfigured(),
      connected: true,
      username: optionalText(row.username),
      accountType: optionalText(row.account_type),
      profilePictureUrl: safeHttpsUrl(row.profile_picture_url),
      connectedAt: optionalText(row.connected_at),
      tokenExpiresAt: optionalText(row.token_expires_at)
    } : { configured: instagramOAuthConfigured(), connected: false };
  }, { readOnly: true });
}

export async function disconnectVendorInstagram(principal: SessionPrincipal): Promise<void> {
  const vendorId = requiredVendorId(principal);
  if (!productionDatabaseConfigured()) throw new Error("instagram_database_not_configured");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  await uow.withTransaction({ actorUserId: principal.userId, vendorId }, async (tx) => {
    await tx.query(`
      DELETE FROM vendor_instagram_connections connection
      USING vendor_businesses vendor
      WHERE connection.vendor_id=vendor.id
        AND (vendor.public_id=$1 OR vendor.id::text=$1)
    `, [vendorId]);
  });
}

export async function publicVendorInstagramFeed(vendorId: string): Promise<Readonly<{
  username: string;
  profilePictureUrl?: string;
  settings: VendorInstagramSettings;
  items: readonly PublicVendorInstagramMedia[];
}>> {
  if (!productionDatabaseConfigured()) throw new Error("instagram_database_not_configured");
  const cleanVendorId = vendorId.trim();
  if (!cleanVendorId) throw new Error("instagram_vendor_not_found");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const connection = await uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: `public-instagram:${cleanVendorId}` },
    async (tx) => {
      const result = await tx.query<ConnectionRow>(`
        SELECT
          vendor.id::text AS vendor_uuid,
          vendor.status::text AS vendor_status,
          vendor.storefront_settings,
          connection.username,
          connection.profile_picture_url,
          connection.access_token_ciphertext,
          connection.token_expires_at::text
        FROM vendor_businesses vendor
        JOIN vendor_instagram_connections connection ON connection.vendor_id=vendor.id
        WHERE (vendor.public_id=$1 OR vendor.id::text=$1)
          AND vendor.status='active'
          AND vendor.public_directory_visible=true
        LIMIT 1
      `, [cleanVendorId]);
      return result.rows[0];
    },
    { readOnly: true }
  );
  if (!connection) throw new Error("instagram_feed_not_found");
  const settings = publicVendorInstagramSettings(connection.storefront_settings);
  if (!settings) throw new Error("instagram_feed_disabled");
  const cipherText = optionalText(connection.access_token_ciphertext);
  const username = optionalText(connection.username);
  const vendorUuid = optionalText(connection.vendor_uuid);
  if (!cipherText || !username || !vendorUuid) throw new Error("instagram_connection_invalid");

  let accessToken = decryptAccessToken(cipherText);
  const expiresAt = parseTimestamp(connection.token_expires_at);
  if (expiresAt !== undefined && expiresAt - Date.now() <= TOKEN_REFRESH_WINDOW_MS) {
    const refreshed = await refreshLongLivedToken(accessToken).catch(() => undefined);
    if (refreshed?.accessToken) {
      accessToken = refreshed.accessToken;
      const nextExpiry = refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString() : undefined;
      await persistRefreshedToken(vendorUuid, accessToken, nextExpiry).catch(() => undefined);
    }
  }

  const rawItems = await fetchInstagramMedia(accessToken, Math.max(settings.itemCount * 3, 24));
  const filtered = filterAndOrderMedia(rawItems, settings).slice(0, settings.itemCount);
  return {
    username,
    profilePictureUrl: safeHttpsUrl(connection.profile_picture_url),
    settings,
    items: filtered
  };
}

async function persistRefreshedToken(vendorUuid: string, accessToken: string, expiresAt?: string): Promise<void> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  await uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: `instagram-refresh:${vendorUuid}` },
    (tx) => tx.query(`
      UPDATE vendor_instagram_connections
      SET access_token_ciphertext=$2,
          token_expires_at=COALESCE($3::timestamptz,token_expires_at),
          refreshed_at=now(),
          updated_at=now()
      WHERE vendor_id=$1::uuid
    `, [vendorUuid, encryptAccessToken(accessToken), expiresAt ?? null])
  );
}

function filterAndOrderMedia(items: readonly PublicVendorInstagramMedia[], settings: VendorInstagramSettings): PublicVendorInstagramMedia[] {
  let filtered = items.filter((item) => {
    const reel = item.mediaProductType === "REELS" || /\/reels?\//i.test(item.permalink);
    if (settings.contentMode === "reels") return reel;
    if (settings.contentMode === "posts") return !reel;
    return true;
  });
  if (settings.curatedUrls.length) {
    const order = new Map(settings.curatedUrls.map((url, index) => [normalizePermalink(url), index]));
    filtered = filtered
      .filter((item) => order.has(normalizePermalink(item.permalink)))
      .sort((a, b) => (order.get(normalizePermalink(a.permalink)) ?? 999) - (order.get(normalizePermalink(b.permalink)) ?? 999));
  }
  return filtered;
}

async function exchangeAuthorizationCode(code: string, redirectUri: string): Promise<{ accessToken: string }> {
  const response = await fetch(INSTAGRAM_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredInstagramEnv("INSTAGRAM_APP_ID"),
      client_secret: requiredInstagramEnv("INSTAGRAM_APP_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code
    }),
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({})) as { access_token?: unknown; error_message?: unknown };
  if (!response.ok || typeof body.access_token !== "string" || !body.access_token) {
    throw new Error(typeof body.error_message === "string" ? body.error_message : "instagram_token_exchange_failed");
  }
  return { accessToken: body.access_token };
}

async function exchangeLongLivedToken(shortToken: string): Promise<{ accessToken: string; expiresIn?: number }> {
  const url = new URL("/access_token", INSTAGRAM_GRAPH_ORIGIN);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", requiredInstagramEnv("INSTAGRAM_APP_SECRET"));
  url.searchParams.set("access_token", shortToken);
  const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as { access_token?: unknown; expires_in?: unknown };
  if (!response.ok || typeof body.access_token !== "string" || !body.access_token) throw new Error("instagram_long_token_exchange_failed");
  return { accessToken: body.access_token, expiresIn: positiveInteger(body.expires_in) };
}

async function refreshLongLivedToken(accessToken: string): Promise<{ accessToken: string; expiresIn?: number }> {
  const url = new URL("/refresh_access_token", INSTAGRAM_GRAPH_ORIGIN);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as { access_token?: unknown; expires_in?: unknown };
  if (!response.ok || typeof body.access_token !== "string" || !body.access_token) throw new Error("instagram_token_refresh_failed");
  return { accessToken: body.access_token, expiresIn: positiveInteger(body.expires_in) };
}

async function fetchInstagramProfile(accessToken: string): Promise<{
  id: string;
  username: string;
  accountType?: string;
  profilePictureUrl?: string;
}> {
  const url = new URL("/me", INSTAGRAM_GRAPH_ORIGIN);
  url.searchParams.set("fields", "id,username,account_type,profile_picture_url");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error("instagram_profile_fetch_failed");
  const id = optionalText(body.id);
  const username = optionalText(body.username);
  if (!id || !username || !/^[A-Za-z0-9._]{1,30}$/.test(username)) throw new Error("instagram_profile_invalid");
  return {
    id,
    username,
    accountType: optionalText(body.account_type),
    profilePictureUrl: safeHttpsUrl(body.profile_picture_url)
  };
}

async function fetchInstagramMedia(accessToken: string, limit: number): Promise<PublicVendorInstagramMedia[]> {
  const url = new URL("/me/media", INSTAGRAM_GRAPH_ORIGIN);
  url.searchParams.set("fields", "id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp");
  url.searchParams.set("limit", String(Math.max(1, Math.min(100, limit))));
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as { data?: unknown };
  if (!response.ok || !Array.isArray(body.data)) throw new Error("instagram_media_fetch_failed");
  return body.data.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const id = optionalText(row.id);
    const mediaType = row.media_type === "VIDEO" || row.media_type === "CAROUSEL_ALBUM" || row.media_type === "IMAGE"
      ? row.media_type
      : undefined;
    const mediaUrl = safeHttpsUrl(row.media_url);
    const permalink = safeInstagramPermalink(row.permalink);
    if (!id || !mediaType || !mediaUrl || !permalink) return [];
    return [{
      id,
      mediaType,
      mediaProductType: optionalText(row.media_product_type),
      mediaUrl,
      thumbnailUrl: safeHttpsUrl(row.thumbnail_url),
      permalink,
      caption: optionalText(row.caption)?.slice(0, 500),
      timestamp: optionalText(row.timestamp)
    } satisfies PublicVendorInstagramMedia];
  });
}

function instagramRedirectUri(request: Request): string {
  const configured = process.env.INSTAGRAM_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return "https://kontamou.site/api/vendor/instagram/callback";
  }
  return `${new URL(request.url).origin}/api/vendor/instagram/callback`;
}

function requiredInstagramEnv(name: "INSTAGRAM_APP_ID" | "INSTAGRAM_APP_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("instagram_oauth_not_configured");
  return value;
}

function requiredVendorId(principal: SessionPrincipal): string {
  const vendorId = principal.vendorId?.trim();
  if (!vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return vendorId;
}

function oauthSecret(): string {
  const secret = process.env.BLS_AUTH_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("BLS_AUTH_SECRET is required for Instagram OAuth");
  return "buy-local-sparta-development-instagram-secret-not-production";
}

function signOAuthState(payload: OAuthState): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", oauthSecret()).update(`instagram-oauth:${encoded}`).digest("base64url");
  return `${encoded}.${signature}`;
}

function readOAuthState(value: string): OAuthState {
  const separator = value.lastIndexOf(".");
  if (separator <= 0) throw new Error("instagram_oauth_state_invalid");
  const encoded = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = createHmac("sha256", oauthSecret()).update(`instagram-oauth:${encoded}`).digest("base64url");
  if (!safeEqual(signature, expected)) throw new Error("instagram_oauth_state_invalid");
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("instagram_oauth_state_invalid");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("instagram_oauth_state_invalid");
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.vendorId !== "string" || typeof candidate.nonce !== "string" || typeof candidate.expiresAt !== "number") {
    throw new Error("instagram_oauth_state_invalid");
  }
  if (candidate.expiresAt <= Date.now()) throw new Error("instagram_oauth_state_expired");
  return { vendorId: candidate.vendorId, nonce: candidate.nonce, expiresAt: candidate.expiresAt };
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(`instagram-token:${oauthSecret()}`, "utf8").digest();
}

function encryptAccessToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptAccessToken(value: string): string {
  const [version, ivEncoded, tagEncoded, dataEncoded] = value.split(".");
  if (version !== "v1" || !ivEncoded || !tagEncoded || !dataEncoded) throw new Error("instagram_token_ciphertext_invalid");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(dataEncoded, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("instagram_token_decryption_failed");
  }
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function safeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safeInstagramPermalink(value: unknown): string | undefined {
  const url = safeHttpsUrl(value);
  if (!url) return undefined;
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "instagram.com" || !/^\/(?:p|reel|reels)\/[A-Za-z0-9_-]+\/?$/.test(parsed.pathname)) return undefined;
  return normalizePermalink(parsed.toString());
}

function normalizePermalink(value: string): string {
  try {
    const url = new URL(value);
    return `https://www.instagram.com${url.pathname.replace(/\/$/, "")}/`;
  } catch {
    return value;
  }
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
