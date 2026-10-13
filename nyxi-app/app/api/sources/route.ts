import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const atlasEndpoint = "https://eemihhfreggbigxejjhj.supabase.co/functions/v1/nyxi-public-atlas";
const noStore = { "cache-control": "public, max-age=60, s-maxage=300", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" };
type Ref = { key: string; title: string; authority: string; url: string };
function validate(row: unknown): Ref | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const x = row as Record<string, unknown>;
  if (typeof x.key !== "string" || !/^[a-z0-9][a-z0-9_-]{1,89}$/i.test(x.key)) return null;
  if (typeof x.title !== "string" || x.title.length < 3 || x.title.length > 170) return null;
  if (typeof x.authority !== "string" || x.authority.length < 3 || x.authority.length > 130) return null;
  try {
    const url = new URL(String(x.url));
    if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.includes(".")) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.0\.0\.0$|\[::1\]|\[fc|\[fd|\[fe80)/i.test(url.hostname)) return null;
    return { key: x.key, title: x.title, authority: x.authority, url: url.href };
  } catch { return null; }
}
export async function GET(_request: NextRequest) {
  try {
    const response = await fetch(atlasEndpoint, { signal: AbortSignal.timeout(7000), next: { revalidate: 300 } });
    if (!response.ok) return Response.json({ error: "atlas_unavailable" }, { status: 503, headers: noStore });
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid_payload");
    const x = data as Record<string, unknown>;
    if (x.status !== "ok" || x.kind !== "public_source_references" || x.publication !== "links_only_not_evidence_approval" || !Array.isArray(x.sources)) throw new Error("invalid_schema");
    const sources = x.sources.slice(0, 50).map(validate).filter((v): v is Ref => v !== null);
    return Response.json({ status: "ok", publication: "references_only", sources, count: sources.length }, { headers: noStore });
  } catch {
    return Response.json({ error: "atlas_unavailable" }, { status: 503, headers: { ...noStore, "cache-control": "no-store" } });
  }
}
