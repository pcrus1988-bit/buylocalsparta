import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminCustomerSupportQueue } from "../admin-customer-support-queue";
import { adminCustomersWorkspace } from "../admin-customer-management";
import { adminOrdersReturnsWorkspace } from "../admin-governance-runtime";
import { adminVendorsWorkspace, hasAdminPermission } from "../admin-runtime";
import { marketplaceReferenceMap } from "../public-reference-service";
import { researchVendorsWorkspace } from "../research-vendors-runtime";
import { adminVendorShopsWorkspace } from "../vendor-admin-controls";
import { searchAdminProducts } from "./product-intelligence";

export type AdminAssistantSearchResult = Readonly<{
  kind: "order" | "product" | "customer" | "support" | "vendor" | "vendor_application" | "research_vendor";
  id: string;
  label: string;
  detail: string;
  href: string;
}>;

function norm(value: unknown): string { return String(value ?? "").trim().toLocaleLowerCase("el-GR"); }
function contains(query: string, ...values: unknown[]): boolean { return values.some((value) => norm(value).includes(query)); }

export async function searchAdminEntities(
  principal: SessionPrincipal,
  rawQuery: string
): Promise<readonly AdminAssistantSearchResult[]> {
  const queryText = rawQuery.trim().slice(0, 200);
  const query = norm(queryText);
  if (!query) return [];

  const canCatalog = hasAdminPermission(principal, "catalog.read");
  const canCustomer = hasAdminPermission(principal, "customer.read");
  const canFulfil = hasAdminPermission(principal, "fulfilment.read");
  const canVendor = hasAdminPermission(principal, "vendor.manage");
  const [products, customers, support, orderData, applications, shops, research] = await Promise.all([
    canCatalog ? searchAdminProducts(principal, queryText).catch(() => []) : [],
    canCustomer ? adminCustomersWorkspace(principal, { query: queryText }).catch(() => undefined) : undefined,
    canCustomer ? adminCustomerSupportQueue(principal, { query: queryText }).catch(() => undefined) : undefined,
    canFulfil ? adminOrdersReturnsWorkspace(principal).catch(() => undefined) : undefined,
    canVendor ? adminVendorsWorkspace(principal).catch(() => undefined) : undefined,
    canVendor ? adminVendorShopsWorkspace(principal).catch(() => undefined) : undefined,
    canVendor ? researchVendorsWorkspace(principal).catch(() => undefined) : undefined
  ]);

  const results: AdminAssistantSearchResult[] = [];
  const orderReferences = orderData ? await marketplaceReferenceMap("order", orderData.orders.map((order) => order.id)) : new Map<string, string>();
  for (const order of orderData?.orders ?? []) {
    if (!contains(query, order.id, orderReferences.get(order.id), order.customerId, order.status, ...order.lines.flatMap((line) => [line.title, line.vendorId]))) continue;
    const reference = orderReferences.get(order.id) ?? order.id;
    results.push({ kind: "order", id: order.id, label: reference, detail: `${order.status} · ${order.lines.length} line(s) · ${order.customerId ?? "guest"}`, href: `/admin/orders/${encodeURIComponent(reference)}` });
    if (results.filter((item) => item.kind === "order").length >= 12) break;
  }

  for (const product of products.slice(0, 12)) {
    results.push({ kind: "product", id: product.id, label: product.title, detail: product.detail, href: product.href });
  }

  for (const customer of customers?.customers.slice(0, 12) ?? []) {
    const label = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email || customer.id;
    results.push({ kind: "customer", id: customer.id, label, detail: `${customer.email ?? customer.id} · ${customer.status}`, href: `/admin/customers/${encodeURIComponent(customer.id)}` });
  }

  for (const item of support?.cases.slice(0, 12) ?? []) {
    results.push({ kind: "support", id: item.id, label: item.referenceNumber, detail: `${item.subject} · ${item.customerName} · ${item.status}`, href: `/admin/customers/${encodeURIComponent(item.customerId)}` });
  }

  for (const shop of shops?.shops.filter((item) => contains(query, item.id, item.tradingName, item.legalName)).slice(0, 12) ?? []) {
    results.push({ kind: "vendor", id: shop.id, label: shop.tradingName, detail: `${shop.legalName} · ${shop.status}`, href: `/admin/partners/${encodeURIComponent(shop.id)}` });
  }

  for (const application of applications?.applications.filter((item) => contains(query, item.id, item.tradingName, item.legalName, item.contactEmail, item.taxNumber, item.gemiNumber)).slice(0, 12) ?? []) {
    results.push({ kind: "vendor_application", id: application.id, label: application.tradingName, detail: `${application.legalName} · ${application.state}`, href: "/admin/partners/pipeline" });
  }

  for (const vendor of research?.vendors.filter((item) => contains(query, item.id, item.tradingName, item.legalName, item.email, item.phone)).slice(0, 12) ?? []) {
    results.push({ kind: "research_vendor", id: vendor.id, label: vendor.tradingName, detail: `${vendor.legalName} · research lead`, href: `/admin/research-vendors/${encodeURIComponent(vendor.id)}` });
  }

  return results.slice(0, 40);
}
