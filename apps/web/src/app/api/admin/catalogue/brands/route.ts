import { createHash } from "node:crypto";
import { requireAdminSession } from "../../../../../lib/admin-session";
import { recordAdminAudit } from "../../../../../lib/admin-runtime";
import {
  adminBrandIdentity,
  adminQueueBrandEnrichment,
  adminRemoveBrandLogo,
  adminSetBrandLogo,
  adminUpdateBrandWebsite
} from "../../../../../lib/admin-brand-runtime";

const PROJECT_URL = "https://eemihhfreggbigxejjhj.supabase.co";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function uuid(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw new Error("Invalid brand id");
  return text;
}

function officialWebsite(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const url = new URL(text);
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) throw new Error("Official website must be a public HTTPS URL");
  return url.toString();
}

function reviewedSourceUrl(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return officialWebsite(value);
}

function storageAdminKey(): string {
  const direct = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (direct) return direct;
  try {
    const keys = JSON.parse(process.env.SUPABASE_SECRET_KEYS ?? "{}") as Record<string, unknown>;
    if (typeof keys.default === "string" && keys.default.trim()) return keys.default.trim();
  } catch { /* ignore malformed optional key bundle */ }
  throw new Error("Supabase Storage admin key is not configured");
}

function storageHeaders(key: string): Record<string, string> {
  return key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };
}

function safeSlug(value: string, fallback: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;
}

function mimeAndExtension(file: File, bytes: Uint8Array): Readonly<{ mime: string; extension: "svg" | "png" | "webp" }> {
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_LOGO_BYTES) throw new Error("Logo must be between 100 bytes and 2 MiB");
  const decoder = new TextDecoder();
  const supplied = file.type.toLowerCase().split(";")[0];
  const png = bytes.byteLength >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = bytes.byteLength >= 16 && decoder.decode(bytes.slice(0, 4)) === "RIFF" && decoder.decode(bytes.slice(8, 12)) === "WEBP";
  const head = decoder.decode(bytes.slice(0, Math.min(bytes.byteLength, 4096)));
  const svg = /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(head);

  if (png && supplied === "image/png") return { mime: "image/png", extension: "png" };
  if (webp && supplied === "image/webp") return { mime: "image/webp", extension: "webp" };
  if (svg && supplied === "image/svg+xml") {
    const full = decoder.decode(bytes);
    if (/<(?:script|foreignObject|iframe|object|embed)\b|<!DOCTYPE|\bon[a-z]+\s*=|(?:href|xlink:href|url)\s*=\s*["']?\s*(?:https?:|data:|javascript:)/i.test(full)) throw new Error("SVG contains unsupported active or external content");
    return { mime: "image/svg+xml", extension: "svg" };
  }
  throw new Error("Only validated SVG, PNG or WebP logo files are supported");
}

function encodeObjectPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

async function uploadLogo(objectKey: string, bytes: Uint8Array, mime: string): Promise<void> {
  const key = storageAdminKey();
  const response = await fetch(`${PROJECT_URL}/storage/v1/object/brands/${encodeObjectPath(objectKey)}`, {
    method: "POST",
    headers: { ...storageHeaders(key), "content-type": mime, "cache-control": "31536000", "x-upsert": "true" },
    body: bytes
  });
  if (!response.ok) throw new Error(`Supabase Storage upload failed (HTTP ${response.status})`);
}

async function handleMultipart(request: Request, principal: Awaited<ReturnType<typeof requireAdminSession>>) {
  const form = await request.formData();
  if (String(form.get("action") ?? "") !== "replace_logo") throw new Error("Invalid multipart brand action");
  const brandId = uuid(form.get("brandId"));
  const file = form.get("logo");
  if (!(file instanceof File)) throw new Error("Logo file is required");
  const sourceUrl = reviewedSourceUrl(form.get("sourceUrl"));
  const brand = await adminBrandIdentity(principal, brandId);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { mime, extension } = mimeAndExtension(file, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const slug = safeSlug(brand.normalizedName, brandId);
  const objectKey = `brands/${slug}-${brandId.slice(0, 8)}/logo-${sha256.slice(0, 12)}.${extension}`;
  await uploadLogo(objectKey, bytes, mime);
  await adminSetBrandLogo(principal, { brandId, objectKey, sourceUrl, sourceType: "admin_upload", sha256 });
  await recordAdminAudit(principal, "brand.logo.replace", "brand", brandId, "Admin replaced canonical brand logo", { objectKey, sourceUrl: sourceUrl ?? null });
  return Response.json({ ok: true, message: `Το λογότυπο ${brand.name} ενημερώθηκε.` });
}

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().startsWith("multipart/form-data")) return await handleMultipart(request, principal);

    const body = await request.json() as Record<string, unknown>;
    const brandId = uuid(body.brandId);
    const action = String(body.action ?? "");

    if (action === "website") {
      const website = officialWebsite(body.website);
      await adminUpdateBrandWebsite(principal, brandId, website);
      await recordAdminAudit(principal, "brand.website.update", "brand", brandId, "Admin updated official brand website", { website: website ?? null });
      return Response.json({ ok: true, message: "Το official website αποθηκεύτηκε." });
    }
    if (action === "retry_enrichment") {
      await adminQueueBrandEnrichment(principal, brandId);
      await recordAdminAudit(principal, "brand.logo.retry_requested", "brand", brandId, "Admin requested brand-logo enrichment retry");
      return Response.json({ ok: true, message: "Το brand μπήκε ξανά σε pending enrichment." });
    }
    if (action === "remove_logo") {
      const brand = await adminBrandIdentity(principal, brandId);
      await adminRemoveBrandLogo(principal, brandId);
      await recordAdminAudit(principal, "brand.logo.remove", "brand", brandId, "Admin removed canonical brand logo from storefront use", { previousObjectKey: brand.logoObjectKey ?? null });
      return Response.json({ ok: true, message: "Το λογότυπο αφαιρέθηκε από τις storefront κάρτες." });
    }
    throw new Error("Unknown brand action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "brand_action_failed";
    const status = message === "ADMIN_AUTH_REQUIRED" ? 401 : /permission|required|csrf/i.test(message) ? 403 : 400;
    return Response.json({ error: message }, { status });
  }
}
