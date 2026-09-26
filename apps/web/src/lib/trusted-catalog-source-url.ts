const TRUSTED_CDN_PARENT_DOMAINS: Readonly<Record<string, readonly string[]>> = {
  symphonya: ["symphonya.eu"],
  // Zendrop catalogue assets are served from provider-owned CDN hosts such as
  // file.zendrop.com while the catalogue source website is zendrop.com.
  // Keep this provider-scoped so arbitrary external image hosts remain rejected.
  zendrop: ["zendrop.com"]
};

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/**
 * Supplier assets are public only when they stay on the supplier website host,
 * except for explicitly allow-listed supplier CDN subdomains.
 *
 * Symphonya serves catalogue media from cdn.symphonya.eu while its catalogue
 * source website is www.symphonya.eu. Keeping the exception provider-scoped
 * avoids turning catalogue payload URLs into an open redirect/image proxy.
 */
export function trustedCatalogSourceHttpsUrl(
  sourceCode: unknown,
  sourceWebsite: unknown,
  candidate: unknown
): string | undefined {
  const website = optionalText(sourceWebsite);
  const value = optionalText(candidate);
  if (!website || !value) return undefined;

  try {
    const source = new URL(website);
    const asset = new URL(value, source);
    if (source.protocol !== "https:" || asset.protocol !== "https:") return undefined;

    const sourceHost = normalizeHost(source.hostname);
    const assetHost = normalizeHost(asset.hostname);
    if (sourceHost === assetHost) return asset.toString();

    const code = optionalText(sourceCode)?.toLowerCase() ?? "";
    const allowedParents = TRUSTED_CDN_PARENT_DOMAINS[code] ?? [];
    if (allowedParents.some((parent) => assetHost === parent || assetHost.endsWith(`.${parent}`))) {
      // Symphonya occasionally emits Windows-style separators in otherwise
      // valid CDN paths (for example /images/\\_products/...). WHATWG URL
      // parsing turns that into a duplicate slash, so repair only this
      // provider-scoped trusted CDN path after the hostname check.
      if (code === "symphonya") {
        asset.pathname = asset.pathname.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
      }
      return asset.toString();
    }

    return undefined;
  } catch {
    return undefined;
  }
}
