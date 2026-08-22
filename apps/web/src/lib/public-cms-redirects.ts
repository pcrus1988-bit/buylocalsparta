import { PostgresUnitOfWork, type ContentRedirect, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const MARKET_ID = "sparta";
const REDIRECT_CACHE_MS = 30_000;

type RedirectRow = SqlRow & {
  public_id: string;
  from_path: string;
  to_path: string;
  status_code: number | string;
  created_at: string | Date;
  created_by_public?: string | null;
};

const redirectCache = globalThis as typeof globalThis & {
  __blsPublicCmsRedirectCache?: { expiresAt: number; items: Map<string, ContentRedirect> };
};

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

async function loadActiveRedirects(now = Date.now()): Promise<Map<string, ContentRedirect>> {
  const cached = redirectCache.__blsPublicCmsRedirectCache;
  if (cached && cached.expiresAt > now) return cached.items;
  if (!productionDatabaseConfigured()) return new Map();
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 5_000, lockTimeoutMs: 1_000 });
  const rows = await uow.withTransaction({ marketId: MARKET_ID }, (tx) => tx.query<RedirectRow>(`
    SELECT r.public_id,r.from_path,r.to_path,r.status_code,r.created_at,u.public_id AS created_by_public
    FROM cms_redirects r
    JOIN markets m ON m.id=r.market_id
    LEFT JOIN users u ON u.id=r.created_by
    WHERE m.code=$1 AND r.active=true
    ORDER BY r.created_at DESC
    LIMIT 1000
  `, [MARKET_ID]), { readOnly: true });
  const items = new Map<string, ContentRedirect>();
  for (const row of rows.rows) {
    const fromPath = normalizeLookupPath(String(row.from_path));
    const toPath = normalizeTargetPath(String(row.to_path));
    if (!toPath || fromPath === "/" || fromPath === normalizeLookupPath(toPath)) continue;
    items.set(fromPath, {
      id: String(row.public_id),
      marketId: MARKET_ID,
      fromPath,
      toPath,
      statusCode: statusCode(row.status_code),
      active: true,
      createdAt: epoch(row.created_at),
      createdBy: typeof row.created_by_public === "string" && row.created_by_public ? row.created_by_public : "system"
    });
  }
  redirectCache.__blsPublicCmsRedirectCache = { expiresAt: now + REDIRECT_CACHE_MS, items };
  return items;
}

export async function getActivePublicCmsRedirect(pathname: string): Promise<ContentRedirect | undefined> {
  const normalized = normalizeLookupPath(pathname);
  if (normalized === "/") return undefined;
  return (await loadActiveRedirects()).get(normalized);
}
