import { isIP } from "node:net";

/** External iframe targets are strictly HTTPS and never a private/network address. */
export function validHubClaimWebsite(raw: string): string | undefined {
  if (!raw || raw.length > 240) return undefined;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") return undefined;
    if (!url.hostname || url.hostname.length > 253 || isIP(url.hostname) || /(^|\.)localhost$/.test(url.hostname)) return undefined;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (host === "kontamou.site" || host.endsWith(".kontamou.site")
      || host === "kontamou.gr" || host.endsWith(".kontamou.gr")
      || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test")
      || host.endsWith(".invalid") || host.endsWith(".onion")) return undefined;
    if (url.hash.length > 120) return undefined;
    return url.toString();
  } catch { return undefined; }
}

export function validHubClaimSocial(raw: string, platform: "instagram" | "facebook"): string | undefined {
  if (!raw.trim()) return undefined;
  const url = validHubClaimWebsite(raw);
  if (!url) return undefined;
  const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (platform === "instagram" && hostname !== "instagram.com") return undefined;
  if (platform === "facebook" && !["facebook.com","m.facebook.com"].includes(hostname)) return undefined;
  return url;
}

export function optionalClaimText(value: FormDataEntryValue | null, maximum: number): string {
  if (typeof value !== "string") throw new Error("INVALID_CLAIM_TEXT");
  const text = value.trim().replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  if (text.length > maximum) throw new Error("CLAIM_TEXT_TOO_LONG");
  return text;
}
