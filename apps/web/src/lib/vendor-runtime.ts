import { createHash, randomUUID } from "node:crypto";
import {
  InMemoryAuthService,
  InMemoryRateLimiter,
  PostgresUnitOfWork,
  formatMoney,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter, PostgresVendorAuthService } from "@buy-local-sparta/postgres-runtime";
import { offers, runtime as commerceRuntime, variants, vendors } from "./demo-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { assertDatabaseLessPreviewCsrf, createDatabaseLessPreviewSession, databaseLessPreviewSessionEnabled, databaseLessPreviewSessionFromToken, previewCredentialMatches } from "./preview-auth";
import { marketplaceReferenceMap } from "./public-reference-service";

export const VENDOR_SESSION_COOKIE = "bls_vendor_session";

const memoryGlobalKey = "__buyLocalSpartaVendorMemoryRuntime" as const;
const postgresAuthKey = "__buyLocalSpartaVendorPostgresAuth" as const;
const postgresLimiterKey = "__buyLocalSpartaVendorPostgresLimiter" as const;
type MemoryRuntime = ReturnType<typeof createMemoryRuntime>;
type Globals = typeof globalThis & { [memoryGlobalKey]?: MemoryRuntime; [postgresAuthKey]?: PostgresVendorAuthService; [postgresLimiterKey]?: PostgresFixedWindowRateLimiter };
const globals = globalThis as Globals;

function authSecret(): string {
  const configured = process.env.BLS_AUTH_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("BLS_AUTH_SECRET (minimum 32 characters) is required for production vendor sessions");
  return "buy-local-sparta-development-vendor-auth-secret-not-production";
}

export function postgresVendorRuntimeEnabled(): boolean { return Boolean(process.env.DATABASE_URL?.trim()); }

function createMemoryRuntime() {
  if (process.env.NODE_ENV === "production" && process.env.BLS_ALLOW_EPHEMERAL_VENDOR_RUNTIME !== "true") {
    throw new Error("Production vendor backoffice requires PostgreSQL identity/vendor persistence; ephemeral in-memory vendor runtime is disabled");
  }
  const auth = new InMemoryAuthService({ secret: authSecret(), sessionTtlMs: 8 * 60 * 60 * 1000 });
  const rateLimiter = new InMemoryRateLimiter();
  const now = Date.now();
  const demoEnabled = process.env.BLS_ENABLE_DEMO_ACCOUNTS === "true" || process.env.NODE_ENV !== "production";
  if (demoEnabled) {
    for (const [index, vendor] of vendors.entries()) {
      auth.register({ email: `vendor${index + 1}@demo.local`, password: "Vendor!12345", roles: ["vendor_owner"], vendorId: vendor.id, emailVerified: true, now });
    }
  }
  return { auth, rateLimiter };
}

function memoryRuntime(): MemoryRuntime { return globals[memoryGlobalKey] ?? (globals[memoryGlobalKey] = createMemoryRuntime()); }
function postgresAuth(): PostgresVendorAuthService {
  const runtime = getProductionPostgresRuntime();
  return globals[postgresAuthKey] ?? (globals[postgresAuthKey] = new PostgresVendorAuthService({ identity: runtime.persistence.identity, secret: authSecret(), sessionTtlMs: 8 * 60 * 60 * 1000 }));
}
function postgresLimiter(): PostgresFixedWindowRateLimiter {
  const runtime = getProductionPostgresRuntime();
  return globals[postgresLimiterKey] ?? (globals[postgresLimiterKey] = new PostgresFixedWindowRateLimiter(runtime.sqlPool));
}

export function consumeVendorLoginLimit(visitorKey: string, now: number) {
  if (postgresVendorRuntimeEnabled()) return postgresLimiter().consume({ route: "vendor-login", key: visitorKey, limit: 5, windowMs: 15 * 60 * 1000, now });
  return memoryRuntime().rateLimiter.consume({ key: `vendor-login:${visitorKey}`, rule: { limit: 5, windowMs: 15 * 60 * 1000 }, now });
}

export async function authenticateVendor(input: { email: string; password: string; now: number }) {
  if (postgresVendorRuntimeEnabled()) return postgresAuth().authenticate(input);
  if (databaseLessPreviewSessionEnabled("vendor")) {
    const email = input.email.trim().toLowerCase();
    const match = /^vendor([1-9][0-9]*)@demo\.local$/.exec(email);
    const index = match ? Number(match[1]) - 1 : -1;
    const vendor = Number.isSafeInteger(index) && index >= 0 ? vendors[index] : undefined;
    if (!vendor || !previewCredentialMatches(input.password, "Vendor!12345")) throw new Error("Invalid email or password");
    return createDatabaseLessPreviewSession({ kind:"vendor", userId:`preview_vendor_${index+1}`, email, roles:["vendor_owner"], vendorId:vendor.id, now:input.now, ttlMs:8*60*60*1000 });
  }
  return memoryRuntime().auth.authenticate(input);
}

export async function vendorSessionFromToken(token: string | undefined, now: number): Promise<SessionPrincipal | undefined> {
  if (postgresVendorRuntimeEnabled()) return postgresAuth().session(token, now);
  if (databaseLessPreviewSessionEnabled("vendor")) return databaseLessPreviewSessionFromToken(token, "vendor", now);
  return memoryRuntime().auth.session(token, now);
}

export function assertVendorCsrf(principal: SessionPrincipal, suppliedToken: string | undefined): void {
  if (postgresVendorRuntimeEnabled()) postgresAuth().assertCsrf(principal, suppliedToken);
  else if (databaseLessPreviewSessionEnabled("vendor")) assertDatabaseLessPreviewCsrf(principal, suppliedToken);
  else memoryRuntime().auth.assertCsrf(principal, suppliedToken);
}

export async function logoutVendor(token: string | undefined, now = Date.now()): Promise<void> {
  if (postgresVendorRuntimeEnabled()) await postgresAuth().logout(token, now);
  else if (!databaseLessPreviewSessionEnabled("vendor")) memoryRuntime().auth.logout(token);
}

export async function vendorDashboard(principal: SessionPrincipal) {
  if (postgresVendorRuntimeEnabled()) {
    const dashboard = await getProductionPostgresRuntime().vendorOperations.dashboard(principal);
    const references = await marketplaceReferenceMap("order", dashboard.fulfilments.map((item) => item.orderId));
    return {
      ...dashboard,
      fulfilments: dashboard.fulfilments.map((item) => ({ ...item, orderReference: references.get(item.orderId) ?? item.orderId }))
    };
  }
  return memoryVendorDashboard(principal);
}

export type VendorLocalDeliveryContact = Readonly<{
  fulfilmentId: string;
  recipientName: string;
  line1: string;
  line2?: string;
  locality: string;
  region?: string;
  postcode: string;
  countryCode: string;
  phone?: string;
}>;

function snapshotText(snapshot: Record<string, unknown>, key: string, required = false): string | undefined {
  const value = typeof snapshot[key] === "string" ? snapshot[key].trim() : "";
  if (!value && required) throw new Error(`Delivery contact is missing ${key}`);
  return value || undefined;
}

export async function vendorLocalDeliveryContact(principal: SessionPrincipal, fulfilmentId: string, accessRoute = "/api/vendor/fulfilments/delivery-contact"): Promise<VendorLocalDeliveryContact> {
  const vendorId = requiredVendorId(principal);
  if (!postgresVendorRuntimeEnabled()) throw new Error("Local-delivery contact reveal requires the PostgreSQL runtime");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const contact = await uow.withTransaction({ actorUserId: principal.userId, vendorId, marketId: "sparta" }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT fo.status::text AS fulfilment_status,co.status::text AS order_status,co.shipping_address_snapshot
      FROM fulfilment_orders fo
      JOIN customer_orders co ON co.id=fo.order_id
      WHERE fo.public_id=$1
        AND fo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2)
        AND fo.mode='local_delivery'
      LIMIT 1
    `, [fulfilmentId, vendorId]);
    if (!result.rowCount) throw new Error("Local-delivery fulfilment access denied");
    const row = result.rows[0];
    const fulfilmentStatus = String(row.fulfilment_status ?? "");
    const orderStatus = String(row.order_status ?? "");
    if (!["confirmed", "partially_fulfilled"].includes(orderStatus)) throw new Error("Delivery details are available only for payment-confirmed orders");
    if (!["accepted", "picking", "packed", "ready_for_handover"].includes(fulfilmentStatus)) throw new Error("Delivery details are available only while the accepted local delivery is active");
    const snapshot = typeof row.shipping_address_snapshot === "string"
      ? JSON.parse(row.shipping_address_snapshot) as Record<string, unknown>
      : row.shipping_address_snapshot as Record<string, unknown> | null;
    if (!snapshot) throw new Error("Local-delivery address is unavailable");
    return {
      fulfilmentId,
      recipientName: snapshotText(snapshot, "recipientName", true)!,
      line1: snapshotText(snapshot, "line1", true)!,
      line2: snapshotText(snapshot, "line2"),
      locality: snapshotText(snapshot, "locality", true)!,
      region: snapshotText(snapshot, "region"),
      postcode: snapshotText(snapshot, "postcode", true)!,
      countryCode: snapshotText(snapshot, "countryCode") ?? "GR",
      phone: snapshotText(snapshot, "phone")
    };
  }, { readOnly: true });

  await runtime.persistence.security.record({
    id: `sec_${randomUUID()}`,
    type: "personal_data.revealed",
    severity: "low",
    route: accessRoute,
    method: "POST",
    subjectHash: createHash("sha256").update(`fulfilment:${fulfilmentId}`).digest("hex"),
    actorUserId: principal.userId,
    details: {
      purpose: "order_fulfilment",
      resourceType: "fulfilment",
      dataClasses: "identity,contact,address",
      recordCount: 1,
      accessScope: "individual"
    },
    occurredAt: Date.now()
  });
  return contact;
}

export async function updateVendorStock(principal: SessionPrincipal, input: { offerId: string; onHand: number; now?: number }) {
  if (postgresVendorRuntimeEnabled()) return getProductionPostgresRuntime().vendorOperations.updateStock(principal, input);
  return memoryUpdateVendorStock(principal, input);
}

export async function actOnVendorFulfilment(principal: SessionPrincipal, input: { fulfilmentId: string; action: string; now?: number }) {
  if (postgresVendorRuntimeEnabled()) return getProductionPostgresRuntime().vendorOperations.actOnFulfilment(principal, input);
  return memoryActOnVendorFulfilment(principal, input);
}

function memoryVendorDashboard(principal: SessionPrincipal) {
  const vendorId = requiredVendorId(principal);
  const vendor = vendors.find((entry) => entry.id === vendorId);
  if (!vendor) throw new Error("Vendor profile not found");
  const products = variants.flatMap((variant) => (offers[variant.id] ?? []).filter((offer) => offer.vendorId === vendorId).map((offer) => {
    const balance = commerceRuntime.inventory.balance(offer.offerId);
    return { offerId: offer.offerId, canonicalVariantId: variant.id, title: variant.title, retailPrice: formatMoney(variant.platformPrice), supplierPrice: formatMoney(offer.supplierUnitPrice), onHand: balance.onHand, reserved: balance.activeReservations, blocked: balance.blocked, safetyStock: balance.safetyStock, availableToSell: commerceRuntime.inventory.availableToSell(offer.offerId), updatedAt: balance.updatedAt };
  }));
  const fulfilments = commerceRuntime.commerce.orders().flatMap((order) => order.fulfilments.filter((fulfilment) => fulfilment.vendorId === vendorId).map((fulfilment) => ({
    id: fulfilment.id, orderId: order.id, orderReference: order.id, orderStatus: order.status, status: fulfilment.status, mode: order.fulfilmentMode, postcode: order.postcode, createdAt: order.createdAt, customerIdentified: Boolean(order.customerId), merchandiseSubtotal: formatMoney(fulfilment.merchandiseSubtotal), deliveryCharge: formatMoney(fulfilment.deliveryCharge),
    lines: fulfilment.lineIds.flatMap((lineId) => { const line = order.lines.find((entry) => entry.id === lineId); return line ? [{ id: line.id, title: line.titleSnapshot, quantity: line.quantity, status: line.status }] : []; }), actions: fulfilmentActions(order.status, order.fulfilmentMode, fulfilment.status)
  }))).sort((a, b) => b.createdAt - a.createdAt);
  const ownLines = commerceRuntime.commerce.orders().flatMap((order) => order.lines.filter((line) => line.vendorId === vendorId));
  const supplierValueMinor = ownLines.filter((line) => line.status !== "cancelled").reduce((sum, line) => sum + line.supplierUnitPrice.minor * line.quantity, 0);
  return { vendor: { id: vendor.id, name: vendor.name, adviser: vendor.adviser }, account: { email: principal.email, roles: principal.roles }, csrfToken: principal.csrfToken,
    metrics: { ordersRequiringAction: fulfilments.filter((entry) => ["awaiting_acceptance", "accepted", "picking", "packed"].includes(entry.status)).length, activeProducts: products.length, availableUnits: products.reduce((sum, product) => sum + product.availableToSell, 0), openFulfilments: fulfilments.filter((entry) => !["delivered", "rejected", "cancelled", "failed"].includes(entry.status)).length },
    products, fulfilments, finance: { supplierValueSnapshot: formatMoney({ minor: supplierValueMinor, currency: "EUR" }), note: "Operational supplier-value snapshot only. Supplier invoices, platform fees, settlement approval and payout remain governed by the finance workflow." } };
}

function memoryUpdateVendorStock(principal: SessionPrincipal, input: { offerId: string; onHand: number; now?: number }) {
  const vendorId = requiredVendorId(principal);
  const owned = Object.values(offers).flat().find((offer) => offer.offerId === input.offerId && offer.vendorId === vendorId);
  if (!owned) throw new Error("Vendor inventory access denied");
  if (!Number.isSafeInteger(input.onHand) || input.onHand < 0 || input.onHand > 1_000_000) throw new Error("Stock must be a non-negative integer");
  const balance = commerceRuntime.inventory.balance(input.offerId);
  if (input.onHand < balance.activeReservations) throw new Error("On-hand stock cannot be lower than active customer reservations");
  commerceRuntime.inventory.adjustOnHand(input.offerId, input.onHand, input.now ?? Date.now(), "vendor_backoffice", principal.userId);
  return commerceRuntime.inventory.balance(input.offerId);
}

function memoryActOnVendorFulfilment(principal: SessionPrincipal, input: { fulfilmentId: string; action: string; now?: number }) {
  const vendorId = requiredVendorId(principal); const now = input.now ?? Date.now();
  const order = commerceRuntime.commerce.orders().find((candidate) => candidate.fulfilments.some((fulfilment) => fulfilment.id === input.fulfilmentId));
  if (!order) throw new Error("Fulfilment not found");
  const fulfilment = order.fulfilments.find((entry) => entry.id === input.fulfilmentId);
  if (!fulfilment || fulfilment.vendorId !== vendorId) throw new Error("Vendor fulfilment access denied");
  if (input.action === "accept") return commerceRuntime.commerce.acceptFulfilment(order.id, fulfilment.id, now);
  if (input.action === "reject") return commerceRuntime.commerce.rejectFulfilment(order.id, fulfilment.id, now);
  if (input.action === "ready") {
    if (!["confirmed", "partially_fulfilled"].includes(order.status)) throw new Error("Order must be confirmed before pickup preparation can complete");
    if (order.fulfilmentMode !== "pickup") throw new Error("Ready-for-pickup is only valid for pickup fulfilments");
    return commerceRuntime.commerce.markReadyForHandover(order.id, fulfilment.id);
  }
  if (input.action === "delivered") {
    if (!["confirmed", "partially_fulfilled"].includes(order.status)) throw new Error("Order must be confirmed before local delivery can complete");
    if (order.fulfilmentMode !== "local_delivery") throw new Error("Vendor delivery confirmation is only allowed for local-delivery fulfilments; shipping delivery is carrier-confirmed");
    return commerceRuntime.commerce.markDelivered(order.id, fulfilment.id, now);
  }
  throw new Error("Unsupported fulfilment action");
}

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}
function fulfilmentActions(orderStatus: string, mode: string, status: string): readonly string[] {
  if (status === "awaiting_acceptance") return ["accept", "reject"];
  if (!["confirmed", "partially_fulfilled"].includes(orderStatus)) return [];
  if (mode === "pickup" && ["accepted", "picking", "packed"].includes(status)) return ["ready"];
  if (mode === "local_delivery" && ["accepted", "picking", "packed", "ready_for_handover"].includes(status)) return ["delivered"];
  return [];
}
