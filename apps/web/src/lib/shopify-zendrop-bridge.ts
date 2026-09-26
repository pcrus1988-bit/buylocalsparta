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


export type ShopifyBridgeLineItem = Readonly<{
  shopifyVariantId: string;
  quantity: number;
}>;

export type ShopifyBridgeAddress = Readonly<{
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  countryCode: string;
  zip: string;
  phone?: string;
}>;

export type ShopifyBridgeOrderDetails = ShopifyBridgeOrder & Readonly<{
  cancelledAt: string | null;
  tracking: readonly Readonly<{
    company: string | null;
    number: string | null;
    url: string | null;
  }>[];
}>;

export class ShopifyBridgeOrderRejectedError extends Error {
  readonly userErrors: readonly Readonly<{ field?: readonly string[] | null; message: string }>[];

  constructor(userErrors: readonly Readonly<{ field?: readonly string[] | null; message: string }>[]) {
    super(`Shopify orderCreate rejected: ${userErrors.map((item) => item.message).join("; ")}`);
    this.name = "ShopifyBridgeOrderRejectedError";
    this.userErrors = userErrors;
  }
}

export function shopifyVariantGid(value: string | number): string {
  const normalized = String(value).trim();
  if (!normalized) throw new Error("Shopify bridge variant id is required");
  if (normalized.startsWith("gid://shopify/ProductVariant/")) return normalized;
  if (!/^\d+$/.test(normalized)) throw new Error("Shopify bridge variant id must be numeric or a ProductVariant gid");
  return `gid://shopify/ProductVariant/${normalized}`;
}

export function shopifyBridgeOrderTag(customerOrderId: string): string {
  const normalized = customerOrderId.trim().replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 120);
  if (!normalized) throw new Error("Customer order id is required for Shopify bridge idempotency");
  return `KONTA_MOU_ORDER_${normalized}`;
}

export function shopifyBridgeAddressFromSnapshot(
  snapshot: Readonly<Record<string, unknown>>,
  label = "shipping"
): ShopifyBridgeAddress {
  const displayName = optionalText(snapshot.recipientName) ?? optionalText(snapshot.fullName);
  if (!displayName) throw new Error(`${label} recipient name is required`);
  const parts = displayName.split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || "KONTA";
  const lastName = parts.join(" ") || "-";
  const address1 = optionalText(snapshot.line1);
  const city = optionalText(snapshot.locality);
  const zip = optionalText(snapshot.postcode);
  if (!address1) throw new Error(`${label} address line 1 is required`);
  if (!city) throw new Error(`${label} city is required`);
  if (!zip) throw new Error(`${label} postcode is required`);
  const countryCode = (optionalText(snapshot.countryCode) ?? "GR").toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error(`${label} country code is invalid`);

  const address2 = optionalText(snapshot.line2);
  const province = optionalText(snapshot.region);
  const phone = optionalText(snapshot.phone);
  return {
    firstName,
    lastName,
    address1,
    ...(address2 ? { address2 } : {}),
    city,
    ...(province ? { province } : {}),
    countryCode,
    zip,
    ...(phone ? { phone } : {})
  };
}

export async function findShopifyBridgeOrderByTag(
  tag: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<ShopifyBridgeOrderDetails | null> {
  const normalizedTag = tag.trim();
  if (!normalizedTag) throw new Error("Shopify bridge order tag is required");
  const data = await shopifyAdminGraphql<{
    orders: { nodes: Array<ShopifyOrderGraphqlShape> };
  }>(
    `query FindBridgeOrder($query: String!) {
      orders(first: 5, reverse: true, sortKey: CREATED_AT, query: $query) {
        nodes {
          id
          name
          displayFinancialStatus
          displayFulfillmentStatus
          tags
          cancelledAt
          fulfillments {
            trackingInfo { company number url }
          }
        }
      }
    }`,
    { query: `tag:${normalizedTag}` },
    env
  );
  const exact = data.orders.nodes.find((order) => order.tags.includes(normalizedTag));
  return exact ? normalizeOrder(exact) : null;
}

export async function getShopifyBridgeOrder(
  orderId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<ShopifyBridgeOrderDetails> {
  const id = orderId.trim();
  if (!id) throw new Error("Shopify bridge order id is required");
  const gid = id.startsWith("gid://shopify/Order/")
    ? id
    : /^\d+$/.test(id)
      ? `gid://shopify/Order/${id}`
      : id;
  const data = await shopifyAdminGraphql<{
    order: ShopifyOrderGraphqlShape | null;
  }>(
    `query ReadBridgeOrder($id: ID!) {
      order(id: $id) {
        id
        name
        displayFinancialStatus
        displayFulfillmentStatus
        tags
        cancelledAt
        fulfillments {
          trackingInfo { company number url }
        }
      }
    }`,
    { id: gid },
    env
  );
  if (!data.order) throw new Error(`Shopify bridge order ${id} was not found`);
  return normalizeOrder(data.order);
}

export async function createShopifyBridgeOrder(input: Readonly<{
  customerOrderId: string;
  customerOrderNumber: string;
  shippingAddress: ShopifyBridgeAddress;
  billingAddress: ShopifyBridgeAddress;
  lines: readonly ShopifyBridgeLineItem[];
}>, env: NodeJS.ProcessEnv = process.env): Promise<Readonly<{
  created: boolean;
  order: ShopifyBridgeOrderDetails;
}>> {
  if (!input.lines.length) throw new Error("Shopify bridge order requires at least one line");
  const lines = input.lines.map((line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("Shopify bridge quantity must be a positive integer");
    }
    return {
      variantId: shopifyVariantGid(line.shopifyVariantId),
      quantity: line.quantity
    };
  });

  const tag = shopifyBridgeOrderTag(input.customerOrderId);
  const existing = await findShopifyBridgeOrderByTag(tag, env);
  if (existing) return { created: false, order: existing };

  const result = await shopifyAdminGraphql<{
    orderCreate: {
      userErrors: Array<{ field?: string[] | null; message: string }>;
      order: ShopifyOrderGraphqlShape | null;
    };
  }>(
    `mutation CreateZendropBridgeOrder($order: OrderCreateOrderInput!) {
      orderCreate(order: $order) {
        userErrors { field message }
        order {
          id
          name
          displayFinancialStatus
          displayFulfillmentStatus
          tags
          cancelledAt
          fulfillments {
            trackingInfo { company number url }
          }
        }
      }
    }`,
    {
      order: {
        lineItems: lines,
        financialStatus: "PAID",
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress,
        tags: [tag, "KONTA_MOU_ZENDROP_BRIDGE", "DO_NOT_EMAIL_CUSTOMER"],
        note: `KONTA MOY order ${input.customerOrderNumber}. Hidden Zendrop fulfillment bridge.`
      }
    },
    env
  );

  if (result.orderCreate.userErrors.length) {
    throw new ShopifyBridgeOrderRejectedError(result.orderCreate.userErrors);
  }
  if (!result.orderCreate.order) throw new Error("Shopify orderCreate returned no order");
  return { created: true, order: normalizeOrder(result.orderCreate.order) };
}

type ShopifyOrderGraphqlShape = Readonly<{
  id: string;
  name: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  tags: string[];
  cancelledAt?: string | null;
  fulfillments?: Array<Readonly<{
    trackingInfo?: Array<Readonly<{
      company?: string | null;
      number?: string | null;
      url?: string | null;
    }>>;
  }>>;
}>;

function normalizeOrder(order: ShopifyOrderGraphqlShape): ShopifyBridgeOrderDetails {
  const tracking = (order.fulfillments ?? [])
    .flatMap((fulfillment) => fulfillment.trackingInfo ?? [])
    .map((item) => ({
      company: item.company ?? null,
      number: item.number ?? null,
      url: item.url ?? null
    }));
  return {
    id: order.id,
    name: order.name,
    financialStatus: order.displayFinancialStatus,
    fulfillmentStatus: order.displayFulfillmentStatus,
    tags: order.tags,
    cancelledAt: order.cancelledAt ?? null,
    tracking
  };
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}


export type ShopifyBridgeVariantInventory = Readonly<{
  id: string;
  sku: string | null;
  inventoryQuantity: number;
  tracked: boolean;
}>;

/**
 * Reads the hidden Shopify bridge inventory that KONTA MOY treats as the
 * authoritative Zendrop stock source for mapped variants.
 *
 * This deliberately reads ProductVariant.inventoryQuantity from Shopify,
 * rather than trusting Zendrop catalogue-level availability labels.
 */
export async function getShopifyBridgeVariantInventories(
  variantIds: readonly (string | number)[],
  env: NodeJS.ProcessEnv = process.env
): Promise<readonly ShopifyBridgeVariantInventory[]> {
  if (!variantIds.length) return [];
  if (variantIds.length > 100) {
    throw new Error("Shopify bridge inventory batch is limited to 100 variants");
  }

  const ids = [...new Set(variantIds.map(shopifyVariantGid))];
  const data = await shopifyAdminGraphql<{
    nodes: Array<{
      id: string;
      sku?: string | null;
      inventoryQuantity?: number | null;
      inventoryItem?: { tracked?: boolean | null } | null;
    } | null>;
  }>(
    `query ReadZendropBridgeInventory($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          sku
          inventoryQuantity
          inventoryItem { tracked }
        }
      }
    }`,
    { ids },
    env
  );

  return data.nodes.flatMap((node) => {
    if (!node) return [];
    const quantity = Number(node.inventoryQuantity);
    if (!Number.isSafeInteger(quantity)) {
      throw new Error(`Shopify bridge variant ${node.id} returned invalid inventoryQuantity`);
    }
    return [{
      id: node.id,
      sku: optionalText(node.sku) ?? null,
      inventoryQuantity: Math.max(0, quantity),
      tracked: node.inventoryItem?.tracked === true
    }];
  });
}

export async function getShopifyBridgeVariantInventory(
  variantId: string | number,
  env: NodeJS.ProcessEnv = process.env
): Promise<ShopifyBridgeVariantInventory> {
  const id = shopifyVariantGid(variantId);
  const rows = await getShopifyBridgeVariantInventories([id], env);
  const inventory = rows.find((row) => row.id === id);
  if (!inventory) throw new Error(`Shopify bridge variant ${id} was not found`);
  return inventory;
}
