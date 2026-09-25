const DEFAULT_SHOPIFY_ADMIN_API_VERSION = "2026-07";
const TOKEN_EXPIRY_SAFETY_MS = 5 * 60_000;

type TokenEnvelope = Readonly<{
  access_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}>;

type CachedToken = Readonly<{
  accessToken: string;
  expiresAtMs: number;
}>;

export type ShopifyBridgeConfig = Readonly<{
  shop: string;
  clientId: string;
  clientSecret: string;
  apiVersion: string;
}>;

export type ShopifyBridgeIdentity = Readonly<{
  id: string;
  name: string;
  myshopifyDomain: string;
  currencyCode: string | null;
}>;

let cachedToken: CachedToken | null = null;

function requiredEnvironment(name: string, value: string | undefined): string {
  const result = value?.trim();
  if (!result) throw new Error(`${name} is not configured`);
  return result;
}

function normalizedShop(raw: string): string {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/\.myshopify\.com$/, "");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new Error("SHOPIFY_SHOP must be the myshopify.com subdomain only");
  }
  return value;
}

export function shopifyBridgeConfigFromEnvironment(
  env: NodeJS.ProcessEnv = process.env
): ShopifyBridgeConfig {
  return {
    shop: normalizedShop(requiredEnvironment("SHOPIFY_SHOP", env.SHOPIFY_SHOP)),
    clientId: requiredEnvironment("SHOPIFY_CLIENT_ID", env.SHOPIFY_CLIENT_ID),
    clientSecret: requiredEnvironment("SHOPIFY_CLIENT_SECRET", env.SHOPIFY_CLIENT_SECRET),
    apiVersion: env.SHOPIFY_ADMIN_API_VERSION?.trim() || DEFAULT_SHOPIFY_ADMIN_API_VERSION
  };
}

export function shopifyBridgeEnvironmentReadiness(
  env: NodeJS.ProcessEnv = process.env
): Readonly<{ shop: boolean; clientId: boolean; clientSecret: boolean }> {
  return {
    shop: Boolean(env.SHOPIFY_SHOP?.trim()),
    clientId: Boolean(env.SHOPIFY_CLIENT_ID?.trim()),
    clientSecret: Boolean(env.SHOPIFY_CLIENT_SECRET?.trim())
  };
}

async function requestAccessToken(config: ShopifyBridgeConfig): Promise<CachedToken> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret
  });

  const response = await fetch(
    `https://${config.shop}.myshopify.com/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body,
      cache: "no-store"
    }
  );

  const raw = await response.text();
  let payload: TokenEnvelope = {};
  try {
    payload = raw ? JSON.parse(raw) as TokenEnvelope : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    let safeReason = "";
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const errorPayload = payload as Record<string, unknown>;
      const code = typeof errorPayload.error === "string" ? errorPayload.error.trim() : "";
      const description =
        typeof errorPayload.error_description === "string"
          ? errorPayload.error_description.trim()
          : "";
      safeReason = [code, description].filter(Boolean).join(": ");
    }
    throw new Error(
      `Shopify token exchange failed with HTTP ${response.status}${safeReason ? ` (${safeReason})` : ""}`
    );
  }

  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  const expiresIn =
    typeof payload.expires_in === "number"
      ? payload.expires_in
      : Number(payload.expires_in);

  if (!accessToken) throw new Error("Shopify token exchange returned no access token");
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("Shopify token exchange returned an invalid expiry");
  }

  return {
    accessToken,
    expiresAtMs: Date.now() + Math.floor(expiresIn * 1_000)
  };
}

export async function shopifyBridgeAccessToken(
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs - TOKEN_EXPIRY_SAFETY_MS > Date.now()) {
    return cachedToken.accessToken;
  }
  cachedToken = await requestAccessToken(shopifyBridgeConfigFromEnvironment(env));
  return cachedToken.accessToken;
}

export async function shopifyAdminGraphql<T>(
  query: string,
  variables: Readonly<Record<string, unknown>> = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<T> {
  const config = shopifyBridgeConfigFromEnvironment(env);
  const accessToken = await shopifyBridgeAccessToken(env);
  const response = await fetch(
    `https://${config.shop}.myshopify.com/admin/api/${config.apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-shopify-access-token": accessToken
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store"
    }
  );

  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401) cachedToken = null;
    throw new Error(`Shopify Admin GraphQL failed with HTTP ${response.status}`);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Shopify Admin GraphQL returned an invalid response");
  }
  const envelope = payload as {
    data?: T;
    errors?: readonly Readonly<{ message?: string }>[];
  };
  if (Array.isArray(envelope.errors) && envelope.errors.length) {
    throw new Error(
      `Shopify Admin GraphQL error: ${envelope.errors
        .map((item) => item.message || "unknown")
        .join("; ")}`
    );
  }
  if (!envelope.data) throw new Error("Shopify Admin GraphQL returned no data");
  return envelope.data;
}

export async function verifyShopifyBridgeConnection(
  env: NodeJS.ProcessEnv = process.env
): Promise<ShopifyBridgeIdentity> {
  const data = await shopifyAdminGraphql<{
    shop: {
      id: string;
      name: string;
      myshopifyDomain: string;
      currencyCode?: string | null;
    };
  }>(
    `query ShopifyBridgeIdentity {
      shop {
        id
        name
        myshopifyDomain
        currencyCode
      }
    }`,
    {},
    env
  );

  return {
    id: data.shop.id,
    name: data.shop.name,
    myshopifyDomain: data.shop.myshopifyDomain,
    currencyCode: data.shop.currencyCode ?? null
  };
}
