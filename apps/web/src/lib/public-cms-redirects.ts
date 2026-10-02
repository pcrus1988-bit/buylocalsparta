import type { ContentRedirect, SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const MARKET_ID = "sparta";
const REDIRECT_CACHE_MS = 30_000;
const REDIRECT_CACHE_MAX = 1_000;

type RedirectRow = SqlRow & {
  public_id: string;
  from_path: string;
  to_path: string;
  status_code: number | string;
  created_at: string | Date;
  created_by_public?: string | null;
};

type CachedRedirect = Readonly<{
  expiresAt: number;
  item?: ContentRedirect;
}>;

const redirectCache = globalThis as typeof globalThis & {
  __blsPublicCmsRedirectCache?: Map<string, CachedRedirect>;
};

function activeRedirectCache(): Map<string, CachedRedirect> {
  return redirectCache.__blsPublicCmsRedirectCache
    ?? (redirectCache.__blsPublicCmsRedirectCache = new Map<string, CachedRedirect>());
}

function normalizeLookupPath(value: string): string {
  const raw = value.trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  const [pathname] = raw.split(/[?#]/, 1);
  const collapsed = (pathname || "/").replace(/\/{2,}/g, "/");
  return collapsed.length > 1 && collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

function normalizeTargetPath(value: string): string | undefined {
  const raw = value.trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\r\n]/.test(raw)) return undefined;
  const match = raw.match(/^([^?#]*)(.*)$/s);
  const pathname = normalizeLookupPath(match?.[1] ?? raw);
  const suffix = match?.[2] ?? "";
  return `${pathname}${suffix}`;
}

function epoch(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function statusCode(value: unknown): 301 | 302 | 307 | 308 {
  const parsed = Number(value);
  return parsed === 302 || parsed === 307 || parsed === 308 ? parsed : 301;
}

async function loadActiveRedirect(pathname: string, now = Date.now()): Promise<ContentRedirect | undefined> {
  const normalized = normalizeLookupPath(pathname);
  const cache = activeRedirectCache();
  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > now) return cached.item;
  if (!productionDatabaseConfigured()) return undefined;

  try {
    // Redirect resolution is on the request hot path. Resolve exactly one indexed source path
    // instead of loading/sorting the entire redirect table and opening a multi-statement
    // transaction on every cold Vercel instance.
    const rows = await getProductionPostgresRuntime().sqlPool.query<RedirectRow>(`
      SELECT r.public_id,r.from_path,r.to_path,r.status_code,r.created_at,u.public_id AS created_by_public
      FROM cms_redirects r
      JOIN markets m ON m.id=r.market_id
      LEFT JOIN users u ON u.id=r.created_by
      WHERE m.code=$1 AND r.from_path=$2 AND r.active=true
      LIMIT 1
    `, [MARKET_ID, normalized]);

    const row = rows.rows[0];
    let item: ContentRedirect | undefined;
    if (row) {
      const fromPath = normalizeLookupPath(String(row.from_path));
      const toPath = normalizeTargetPath(String(row.to_path));
      if (toPath && fromPath !== "/" && fromPath !== normalizeLookupPath(toPath)) {
        item = {
          id: String(row.public_id),
          marketId: MARKET_ID,
          fromPath,
          toPath,
          statusCode: statusCode(row.status_code),
          active: true,
          createdAt: epoch(row.created_at),
          createdBy: typeof row.created_by_public === "string" && row.created_by_public ? row.created_by_public : "system"
        };
      }
    }

    if (cache.size >= REDIRECT_CACHE_MAX) cache.clear();
    cache.set(normalized, { expiresAt: now + REDIRECT_CACHE_MS, item });
    return item;
  } catch {
    // Redirect lookup is optional routing assistance. Database pressure must never turn a
    // normal page request (including /admin) into a 500.
    return undefined;
  }
}

export async function getActivePublicCmsRedirect(pathname: string): Promise<ContentRedirect | undefined> {
  const normalized = normalizeLookupPath(pathname);
  if (normalized === "/") return undefined;
  return loadActiveRedirect(normalized);
}
