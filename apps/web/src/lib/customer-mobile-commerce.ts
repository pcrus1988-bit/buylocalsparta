const CUSTOMER_MOBILE_COMMERCE_EXCLUDED_PREFIXES = [
  "/vendor",
  "/driver",
  "/admin",
  "/delivery/manage"
] as const;

export function isCustomerMobileCommercePath(pathname: string): boolean {
  const normalized = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  return !CUSTOMER_MOBILE_COMMERCE_EXCLUDED_PREFIXES.some((prefix) =>
    normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}
