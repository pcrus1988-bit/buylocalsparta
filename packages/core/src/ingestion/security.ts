import { isIP } from "node:net";
import type { CrawlFetchPolicy, CrawlUrlValidation } from "./types.ts";

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"] as const;
const DEFAULT_PORTS = new Set([80, 443]);

export function validateCrawlUrl(
  rawUrl: string,
  policy: CrawlFetchPolicy,
  resolvedAddresses: readonly string[] = []
): CrawlUrlValidation {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return reject("URL is not valid");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return reject("Only HTTP(S) crawl targets are allowed");
  }
  if (url.protocol === "http:" && policy.allowHttp !== true) {
    return reject("Plain HTTP is disabled for this crawl source");
  }
  if (url.username || url.password) {
    return reject("Credential-bearing crawl URLs are not allowed");
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) return reject("URL hostname is required");
  if (isBlockedHostname(hostname)) return reject("Local or internal hostnames are not allowed");

  const allowedHosts = policy.allowedHosts.map(normalizeHostname).filter(Boolean);
  if (!allowedHosts.length) return reject("Crawl policy has no allowed hosts");
  const hostAllowed = allowedHosts.some(
    (allowed) =>
      hostname === allowed ||
      (policy.allowSubdomains === true && hostname.endsWith(`.${allowed}`))
  );
  if (!hostAllowed) return reject(`Hostname '${hostname}' is outside the crawl allowlist`);

  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  const allowedPorts = new Set(policy.allowedPorts ?? [...DEFAULT_PORTS]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || !allowedPorts.has(port)) {
    return reject(`Port ${String(port)} is outside the crawl allowlist`);
  }

  if (isIP(hostname) !== 0 && !isPublicIpAddress(hostname)) {
    return reject("Private, loopback, link-local, documentation or reserved IP targets are not allowed");
  }

  for (const address of resolvedAddresses) {
    if (!isPublicIpAddress(address)) {
      return reject(`DNS resolution produced a non-public address (${address})`);
    }
  }

  url.hash = "";
  return { decision: "allow", normalizedUrl: url.toString(), hostname };
}

export function validateRedirectTarget(
  targetUrl: string,
  policy: CrawlFetchPolicy,
  resolvedAddresses: readonly string[] = []
): CrawlUrlValidation {
  return validateCrawlUrl(targetUrl, policy, resolvedAddresses);
}

export function isPublicIpAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 4) return !isNonPublicIpv4(normalized);
  if (family === 6) return !isNonPublicIpv6(normalized);
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "localhost.localdomain") return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function isNonPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && octets[2] === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && octets[2] === 100) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    a >= 224
  );
}

function isNonPublicIpv6(address: string): boolean {
  const value = ipv6ToBigInt(address);
  if (value === undefined) return true;

  if (value === 0n || value === 1n) return true;

  if ((value >> 32n) === 0n || (value >> 32n) === 0xffffn) {
    const embedded = Number(value & 0xffffffffn);
    const ipv4 = [
      (embedded >>> 24) & 255,
      (embedded >>> 16) & 255,
      (embedded >>> 8) & 255,
      embedded & 255
    ].join(".");
    return isNonPublicIpv4(ipv4);
  }

  if ((value >> 121n) === 0x7en) return true;
  if ((value >> 118n) === 0x3fan) return true;
  if ((value >> 118n) === 0x3fbn) return true;
  if ((value >> 120n) === 0xffn) return true;
  if ((value >> 64n) === 0x0100000000000000n) return true;
  if ((value >> 96n) === 0x20010db8n) return true;
  if ((value >> 80n) === 0x200100020000n) return true;
  if ((value >> 100n) === 0x2001002n) return true;
  if ((value >> 112n) === 0x2002n) return true;

  return false;
}

function ipv6ToBigInt(address: string): bigint | undefined {
  const withoutZone = address.split("%", 1)[0];
  const embeddedMatch = withoutZone.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  let normalized = withoutZone;
  if (embeddedMatch) {
    const parts = embeddedMatch[1].split(".").map(Number);
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
    const high = ((parts[0] << 8) | parts[1]).toString(16);
    const low = ((parts[2] << 8) | parts[3]).toString(16);
    normalized = `${withoutZone.slice(0, -embeddedMatch[1].length)}${high}:${low}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (left.some((part) => !isHextet(part)) || right.some((part) => !isHextet(part))) return undefined;

  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return undefined;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8) return undefined;

  let value = 0n;
  for (const group of groups) value = (value << 16n) | BigInt(`0x${group || "0"}`);
  return value;
}

function isHextet(value: string): boolean {
  return /^[0-9a-f]{1,4}$/i.test(value);
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function reject(reason: string): CrawlUrlValidation {
  return { decision: "reject", reason };
}
