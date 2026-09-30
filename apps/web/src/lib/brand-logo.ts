const PUBLIC_BRAND_BUCKET = "https://eemihhfreggbigxejjhj.supabase.co/storage/v1/object/public/brands/";

function officialExternalLogoUrl(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return undefined;
    if (/^(?:localhost|127\.|0\.0\.0\.0$|\[?::1\]?$)/i.test(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Prefer the canonical Storage object; fall back only to a verified HTTPS asset from the official brand site. */
export function publicBrandLogoUrl(
  objectKey: string | null | undefined,
  officialExternalUrl?: string | null
): string | undefined {
  if (objectKey && /^[a-z0-9][a-z0-9/_-]*\.(?:svg|png|webp)$/i.test(objectKey) && !objectKey.includes("..")) {
    return PUBLIC_BRAND_BUCKET + objectKey.split("/").map(encodeURIComponent).join("/");
  }
  return officialExternalLogoUrl(officialExternalUrl);
}
