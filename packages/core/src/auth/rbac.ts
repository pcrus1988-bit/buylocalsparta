export type Role =
  | "customer"
  | "vendor_owner"
  | "vendor_catalog"
  | "vendor_fulfilment"
  | "vendor_adviser"
  | "vendor_finance"
  | "super_admin"
  | "vendor_operations"
  | "catalog_qa"
  | "customer_support"
  | "platform_finance"
  | "content_seo"
  | "compliance"
  | "logistics"
  | "auditor";

export type Permission =
  | "catalog.read"
  | "catalog.write"
  | "inventory.read"
  | "inventory.write"
  | "fulfilment.read"
  | "fulfilment.write"
  | "advice.read"
  | "advice.write"
  | "finance.read"
  | "finance.write"
  | "fairness.read"
  | "fairness.appeal"
  | "fairness.manage"
  | "content.read"
  | "content.write"
  | "content.vendor_approve"
  | "analytics.vendor.read"
  | "analytics.market.read"
  | "notifications.read"
  | "notifications.manage"
  | "security.read"
  | "reviews.read"
  | "reviews.respond"
  | "reviews.report"
  | "reviews.manage"
  | "promotions.read"
  | "promotions.write"
  | "privacy.read"
  | "privacy.manage"
  | "returns.read"
  | "returns.manage"
  | "customer.read"
  | "customer.manage"
  | "customer.export"
  | "vendor.manage"
  | "admin.audit.read";

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  customer: new Set(),
  vendor_owner: new Set(["catalog.read", "catalog.write", "inventory.read", "inventory.write", "fulfilment.read", "fulfilment.write", "advice.read", "advice.write", "finance.read", "finance.write", "fairness.read", "fairness.appeal", "content.vendor_approve", "analytics.vendor.read", "notifications.read", "reviews.read", "reviews.respond", "reviews.report", "returns.read", "vendor.manage"]),
  vendor_catalog: new Set(["catalog.read", "catalog.write", "inventory.read", "inventory.write", "fairness.read"]),
  vendor_fulfilment: new Set(["inventory.read", "inventory.write", "fulfilment.read", "fulfilment.write", "returns.read"]),
  vendor_adviser: new Set(["catalog.read", "advice.read", "advice.write", "reviews.read", "reviews.respond"]),
  vendor_finance: new Set(["finance.read", "finance.write", "analytics.vendor.read"]),
  super_admin: new Set(["catalog.read", "catalog.write", "inventory.read", "inventory.write", "fulfilment.read", "fulfilment.write", "advice.read", "advice.write", "finance.read", "finance.write", "fairness.read", "fairness.manage", "content.read", "content.write", "customer.read", "customer.manage", "customer.export", "vendor.manage", "admin.audit.read", "analytics.market.read", "notifications.read", "notifications.manage", "security.read", "reviews.read", "reviews.manage", "promotions.read", "promotions.write", "privacy.read", "privacy.manage", "returns.read", "returns.manage"]),
  vendor_operations: new Set(["catalog.read", "inventory.read", "fulfilment.read", "fulfilment.write", "fairness.read", "fairness.manage", "content.read", "vendor.manage", "admin.audit.read", "analytics.market.read", "notifications.read", "security.read", "reviews.read", "reviews.manage", "privacy.read", "returns.read"]),
  catalog_qa: new Set(["catalog.read", "catalog.write", "inventory.read", "fairness.read", "fairness.manage", "promotions.read", "admin.audit.read", "analytics.market.read"]),
  customer_support: new Set(["catalog.read", "fulfilment.read", "advice.read", "advice.write", "customer.read", "customer.manage", "admin.audit.read", "notifications.read", "reviews.read", "reviews.manage", "privacy.read", "privacy.manage", "returns.read", "returns.manage"]),
  platform_finance: new Set(["finance.read", "finance.write", "promotions.read", "fulfilment.read", "admin.audit.read", "analytics.market.read", "returns.read"]),
  content_seo: new Set(["catalog.read", "catalog.write", "content.read", "content.write", "promotions.read", "promotions.write", "analytics.market.read", "notifications.read", "notifications.manage"]),
  compliance: new Set(["catalog.read", "catalog.write", "fairness.read", "vendor.manage", "admin.audit.read", "reviews.read", "reviews.manage", "privacy.read", "returns.read", "returns.manage"]),
  logistics: new Set(["inventory.read", "fulfilment.read", "fulfilment.write", "returns.read"]),
  auditor: new Set(["catalog.read", "inventory.read", "fulfilment.read", "advice.read", "finance.read", "fairness.read", "content.read", "admin.audit.read", "analytics.market.read", "notifications.read", "security.read", "reviews.read", "privacy.read", "returns.read"])
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new Error(`Role ${role} lacks ${permission}`);
}

export function assertVendorScope(actorVendorId: string | undefined, resourceVendorId: string): void {
  if (!actorVendorId || actorVendorId !== resourceVendorId) {
    throw new Error("Vendor isolation violation");
  }
}
