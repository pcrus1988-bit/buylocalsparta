import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { validateCrawlUrl, validateRedirectTarget, type CrawlFetchPolicy } from "../../packages/core/src/index.ts";

export type CrawlRedirectHop = Readonly<{
  from: string;
  to: string;
  status: number;
  resolvedAddresses: readonly string[];
}>;

export type SecureCrawlFetchResult = Readonly<{
  finalUrl: string;
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Buffer;
  responseBytes: number;
  responseSha256: string;
  resolvedAddresses: readonly string[];
  redirectChain: readonly CrawlRedirectHop[];
}>;

export type SecureCrawlFetchInput = Readonly<{
  url: string;
  policy: CrawlFetchPolicy;
  userAgent: string;
  timeoutMs?: number;
  accept?: string;
}>;

export async function secureCrawlFetch(input: SecureCrawlFetchInput): Promise<SecureCrawlFetchResult> {
  const timeoutMs = positive(input.timeoutMs ?? 15_000, "timeoutMs");
  const maxBytes = positive(input.policy.maxResponseBytes ?? 10 * 1024 * 1024, "maxResponseBytes");
  const maxRedirects = nonNegative(input.policy.maxRedirects ?? 5, "maxRedirects");
  let currentUrl = input.url;
  const redirectChain: CrawlRedirectHop[] = [];

  for (let redirectCount = 0; ; redirectCount += 1) {
    const preflight = redirectCount === 0
      ? validateCrawlUrl(currentUrl, input.policy)
      : validateRedirectTarget(currentUrl, input.policy);
    if (preflight.decision !== "allow" || !preflight.normalizedUrl || !preflight.hostname) {
      throw new Error(`Crawler URL rejected: ${preflight.reason ?? "policy rejected URL"}`);
    }
    currentUrl = preflight.normalizedUrl;
    const resolved = await resolvePublicAddresses(preflight.hostname, currentUrl, input.policy);
    const selected = resolved[0];
    if (!selected) throw new Error(`Crawler DNS resolution returned no usable address for ${preflight.hostname}`);

    const response = await requestPinned({
      url: currentUrl,
      address: selected.address,
      family: selected.family,
      userAgent: input.userAgent,
      timeoutMs,
      maxBytes,
      accept: input.accept
    });

    const location = response.headers.location;
    if (isRedirect(response.status) && location) {
      if (redirectCount >= maxRedirects) throw new Error(`Crawler redirect limit exceeded (${maxRedirects})`);
      const nextUrl = new URL(location, currentUrl).toString();
      redirectChain.push({
        from: currentUrl,
        to: nextUrl,
        status: response.status,
        resolvedAddresses: resolved.map((item) => item.address)
      });
      currentUrl = nextUrl;
      continue;
    }

    return {
      finalUrl: currentUrl,
      status: response.status,
      headers: response.headers,
      body: response.body,
      responseBytes: response.body.length,
      responseSha256: createHash("sha256").update(response.body).digest("hex"),
      resolvedAddresses: resolved.map((item) => item.address),
      redirectChain
    };
  }
}

export function createPinnedLookup(address: string, family: number, expectedHostname: string): LookupFunction {
  const normalizedExpected = normalizeHostname(expectedHostname);
  return ((hostname, options, callback) => {
    if (normalizeHostname(hostname) !== normalizedExpected) {
      const error = new Error(`Pinned lookup refused unexpected hostname ${hostname}`) as NodeJS.ErrnoException;
      error.code = "EACCES";
      callback(error, address, family);
      return;
    }
    if (typeof options === "object" && options?.all) {
      callback(null, [{ address, family }]);
      return;
    }
    callback(null, address, family);
  }) as LookupFunction;
}

async function resolvePublicAddresses(hostname: string, rawUrl: string, policy: CrawlFetchPolicy) {
  const normalizedHostname = normalizeHostname(hostname);
  const ipFamily = isIP(normalizedHostname);
  const addresses = ipFamily
    ? [{ address: normalizedHostname, family: ipFamily }]
    : await lookup(normalizedHostname, { all: true, verbatim: true });
  if (!addresses.length) throw new Error(`Crawler DNS resolution returned no addresses for ${hostname}`);
  const validation = validateCrawlUrl(rawUrl, policy, addresses.map((item) => item.address));
  if (validation.decision !== "allow") throw new Error(`Crawler DNS target rejected: ${validation.reason ?? "unsafe DNS result"}`);
  return addresses;
}

async function requestPinned(input: {
  url: string;
  address: string;
  family: number;
  userAgent: string;
  timeoutMs: number;
  maxBytes: number;
  accept?: string;
}): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const url = new URL(input.url);
  const hostname = normalizeHostname(url.hostname);
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  const options: RequestOptions = {
    method: "GET",
    lookup: createPinnedLookup(input.address, input.family, hostname),
    headers: {
      "User-Agent": input.userAgent,
      "Accept": input.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
      "Accept-Encoding": "identity",
      "Cache-Control": "no-cache"
    },
    timeout: input.timeoutMs,
    maxHeaderSize: 64 * 1024
  };
  if (url.protocol === "https:") (options as RequestOptions & { servername?: string }).servername = hostname;

  return await new Promise((resolve, reject) => {
    const req = request(url, options, (res) => {
      const status = res.statusCode ?? 0;
      const headers = normalizeHeaders(res.headers);
      const declaredLength = Number(headers["content-length"] ?? NaN);
      if (Number.isFinite(declaredLength) && declaredLength > input.maxBytes) {
        res.destroy();
        reject(new Error(`Crawler response exceeds byte limit (${declaredLength} > ${input.maxBytes})`));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        res.destroy();
        reject(error);
      };
      res.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > input.maxBytes) {
          fail(new Error(`Crawler response exceeded byte limit (${input.maxBytes})`));
          return;
        }
        chunks.push(buffer);
      });
      res.on("error", (error) => fail(error));
      res.on("end", () => {
        if (settled) return;
        settled = true;
        resolve({ status, headers, body: Buffer.concat(chunks, total) });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`Crawler request timed out after ${input.timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });
}

function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) result[key.toLowerCase()] = value.join(", ");
    else if (value != null) result[key.toLowerCase()] = String(value);
  }
  return result;
}
function isRedirect(status: number): boolean { return status === 301 || status === 302 || status === 303 || status === 307 || status === 308; }
function normalizeHostname(value: string): string { return value.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, ""); }
function positive(value: number, name: string): number { if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`); return value; }
function nonNegative(value: number, name: string): number { if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`); return value; }
