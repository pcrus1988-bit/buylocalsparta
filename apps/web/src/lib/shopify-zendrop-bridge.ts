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


export type ShopifyBridgeOrder = Readonly<{
  id: string;
  name: string;
  financialStatus: string;
  fulfillmentStatus: string;
  tags: readonly string[];
}>;

const CONTROLLED_ZENDROP_TEST_TAG = "KONTA_MOU_ZENDROP_BRIDGE_TEST_1905418";
const CONTROLLED_ZENDROP_TEST_VARIANT_ID = "gid://shopify/ProductVariant/54139878605128";

export async function createControlledZendropBridgeTestOrder(input: Readonly<{
  address1: string;
  city: string;
  zip: string;
}>, env: NodeJS.ProcessEnv = process.env): Promise<Readonly<{
  created: boolean;
  order: ShopifyBridgeOrder;
}>> {
  const address1 = input.address1.trim();
  const city = input.city.trim();
  const zip = input.zip.trim();
  if (!address1 || !city || !zip) throw new Error("Complete shipping address is required");

  const recent = await shopifyAdminGraphql<{
    orders: {
      nodes: Array<{
        id: string;
        name: string;
        displayFinancialStatus: string;
        displayFulfillmentStatus: string;
        tags: string[];
      }>;
    };
  }>(`query BridgeRecentOrders {
    orders(first: 50, reverse: true, sortKey: CREATED_AT) {
      nodes {
        id
        name
        displayFinancialStatus
        displayFulfillmentStatus
        tags
      }
    }
  }`, {}, env);

  const existing = recent.orders.nodes.find((order) =>
    Array.isArray(order.tags) && order.tags.includes(CONTROLLED_ZENDROP_TEST_TAG)
  );
  if (existing) {
    return {
      created: false,
      order: {
        id: existing.id,
        name: existing.name,
        financialStatus: existing.displayFinancialStatus,
        fulfillmentStatus: existing.displayFulfillmentStatus,
        tags: existing.tags
      }
    };
  }

  const result = await shopifyAdminGraphql<{
    orderCreate: {
      userErrors: Array<{ field?: string[] | null; message: string }>;
      order: {
        id: string;
        name: string;
        displayFinancialStatus: string;
        displayFulfillmentStatus: string;
        tags: string[];
      } | null;
    };
  }>(
    `mutation CreateControlledZendropBridgeOrder($order: OrderCreateOrderInput!) {
      orderCreate(order: $order) {
        userErrors { field message }
        order {
          id
          name
          displayFinancialStatus
          displayFulfillmentStatus
          tags
        }
      }
    }`,
    {
      order: {
        lineItems: [{ variantId: CONTROLLED_ZENDROP_TEST_VARIANT_ID, quantity: 1 }],
        financialStatus: "PAID",
        shippingAddress: {
          firstName: "KONTA",
          lastName: "MOY TEST",
          address1,
          city,
          countryCode: "GR",
          zip
        },
        billingAddress: {
          firstName: "KONTA",
          lastName: "MOY TEST",
          address1,
          city,
          countryCode: "GR",
          zip
        },
        tags: [
          CONTROLLED_ZENDROP_TEST_TAG,
          "KONTA_MOU_TEST_ONLY",
          "DO_NOT_AUTO_FULFILL"
        ],
        note: "Controlled KONTA MOY -> Shopify -> Zendrop bridge verification. Do not auto-fulfill."
      }
    },
    env
  );

  if (result.orderCreate.userErrors.length) {
    throw new Error(
      "Shopify orderCreate rejected: " +
      result.orderCreate.userErrors.map((item) => item.message).join("; ")
    );
  }
  const order = result.orderCreate.order;
  if (!order) throw new Error("Shopify orderCreate returned no order");

  return {
    created: true,
    order: {
      id: order.id,
      name: order.name,
      financialStatus: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,
      tags: order.tags
    }
  };
}
