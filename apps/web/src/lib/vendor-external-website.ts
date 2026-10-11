/** A claimed merchant's optional off-platform site. Never fetch merchant URLs server-side. */
export type VendorExternalWebsiteSettings = Readonly<{
  enabled: boolean;
  url: string;
}>;

/** Accept public HTTPS hostnames only; never iframe our own origin or private-network URLs. */
export function normalizeVendorExternalWebsiteUrl(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 2048) throw new Error("Δώσε έγκυρη διεύθυνση HTTPS (έως 2048 χαρακτήρες).");
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) throw new Error("Η διεύθυνση ιστοσελίδας περιέχει μη έγκυρους χαρακτήρες.");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Η ιστοσελίδα πρέπει να έχει πλήρη διεύθυνση, π.χ. https://example.gr.");
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    parsed.protocol !== "https:" ||
    Boolean(parsed.username || parsed.password) ||
    Boolean(parsed.port && parsed.port !== "443") ||
    !host.includes(".") ||
    host.startsWith(".") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.includes(":") ||
    host.startsWith("[") ||
    ["localhost", "kontamou.site", "kontamou.gr"].some((domain) => host === domain || host.endsWith(`.${domain}`)) ||
    [".local", ".internal", ".test", ".invalid", ".example", ".localhost"].some((suffix) => host.endsWith(suffix))
  ) throw new Error("Επιτρέπονται μόνο εξωτερικές δημόσιες ιστοσελίδες HTTPS.");
  parsed.hash = "";
  return parsed.toString();
}

export function normalizeVendorExternalWebsiteSettings(value: unknown): VendorExternalWebsiteSettings {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const url = normalizeVendorExternalWebsiteUrl(source.url);
  if (source.enabled === true && !url) throw new Error("Συμπλήρωσε τη διεύθυνση ιστοσελίδας πριν ενεργοποιήσεις την προβολή.");
  return { enabled: source.enabled === true, url };
}

/** A corrupt/old JSON setting must never break the public storefront. */
export function publicVendorExternalWebsiteUrl(value: unknown): string | undefined {
  try {
    const settings = normalizeVendorExternalWebsiteSettings(value);
    return settings.enabled ? settings.url : undefined;
  } catch {
    return undefined;
  }
}
