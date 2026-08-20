import { randomUUID } from "node:crypto";
import { S3ObjectStorage, objectStorageConfigFromEnv } from "@buy-local-sparta/object-storage";

export type HomepageHeroSlide = Readonly<{
  id: string;
  title: string;
  altText: string;
  linkUrl: string | null;
  sortOrder: number;
  isVisible: boolean;
  imageUrl: string;
  objectKey: string | null;
  isSeed: boolean;
}>;

const MANIFEST_KEY = "homepage-hero/manifest.json";
const ASSET_PREFIX = "homepage-hero/assets/";
const SEED_ID = "konta-mou-white-night-2026";

export const DEFAULT_HOMEPAGE_HERO_SLIDE: HomepageHeroSlide = {
  id: SEED_ID,
  title: "ΚΟΝΤΑ ΜΟΥ · Λευκή Νύχτα Σπάρτης",
  altText: "ΚΟΝΤΑ ΜΟΥ — διαγωνισμός Λευκής Νύχτας Σπάρτης με κουπόνια και πρόσκληση εγγραφής.",
  linkUrl: null,
  sortOrder: 0,
  isVisible: true,
  imageUrl: "/hero/konta-mou-white-night-2026.avif",
  objectKey: null,
  isSeed: true
};

function storage() {
  return new S3ObjectStorage(objectStorageConfigFromEnv());
}

async function bodyToBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function normalizeLinkUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Hero link must be an http(s) URL or a /relative path.");
  return url.toString();
}

function normalizeSlide(value: unknown): HomepageHeroSlide | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = String(raw.id ?? "").trim();
  const title = String(raw.title ?? "").trim();
  const imageUrl = String(raw.imageUrl ?? "").trim();
  if (!id || !title || !imageUrl) return null;
  const sortOrder = Number(raw.sortOrder ?? 0);
  return {
    id,
    title,
    altText: String(raw.altText ?? "").trim().slice(0, 500),
    linkUrl: (() => { try { return normalizeLinkUrl(raw.linkUrl); } catch { return null; } })(),
    sortOrder: Number.isSafeInteger(sortOrder) ? sortOrder : 0,
    isVisible: raw.isVisible !== false,
    imageUrl,
    objectKey: raw.objectKey ? String(raw.objectKey) : null,
    isSeed: raw.isSeed === true || id === SEED_ID
  };
}

function ordered(slides: readonly HomepageHeroSlide[]) {
  return [...slides].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "el"));
}

async function readManifest(): Promise<HomepageHeroSlide[]> {
  try {
    const object = await storage().read(MANIFEST_KEY);
    const json = JSON.parse((await bodyToBuffer(object.stream)).toString("utf8")) as unknown;
    if (!Array.isArray(json)) return [DEFAULT_HOMEPAGE_HERO_SLIDE];
    const slides = json.map(normalizeSlide).filter((slide): slide is HomepageHeroSlide => Boolean(slide));
    if (!slides.some((slide) => slide.id === SEED_ID)) slides.push(DEFAULT_HOMEPAGE_HERO_SLIDE);
    return ordered(slides);
  } catch {
    return [DEFAULT_HOMEPAGE_HERO_SLIDE];
  }
}

async function writeObject(objectKey: string, contentType: string, body: BodyInit) {
  const store = storage();
  const intent = await store.createUploadUrl({ objectKey, contentType, expiresInSeconds: 300 });
  const response = await fetch(intent.url, { method: "PUT", headers: intent.headers, body });
  if (!response.ok) throw new Error(`Object storage upload failed (${response.status}).`);
}

async function writeManifest(slides: readonly HomepageHeroSlide[]) {
  await writeObject(
    MANIFEST_KEY,
    "application/json",
    JSON.stringify(ordered(slides), null, 2)
  );
}

export async function listHomepageHeroSlides(input: { visibleOnly?: boolean } = {}): Promise<HomepageHeroSlide[]> {
  const slides = await readManifest();
  return input.visibleOnly ? slides.filter((slide) => slide.isVisible) : slides;
}

function extensionForType(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/avif") return "avif";
  return "jpg";
}

function validateImage(file: File) {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
  if (!allowed.has(file.type)) throw new Error("Upload a JPG, PNG, WebP, GIF or AVIF image.");
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("Hero images must be between 1 byte and 10 MB.");
}

export async function createHomepageHeroSlide(input: {
  file: File;
  title: string;
  altText?: string;
  linkUrl?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
}): Promise<HomepageHeroSlide> {
  validateImage(input.file);
  const title = input.title.trim();
  if (!title) throw new Error("Title is required.");
  const id = randomUUID();
  const objectKey = `${ASSET_PREFIX}${id}.${extensionForType(input.file.type)}`;
  await writeObject(objectKey, input.file.type, new Uint8Array(await input.file.arrayBuffer()));

  const slide: HomepageHeroSlide = {
    id,
    title,
    altText: String(input.altText ?? "").trim().slice(0, 500),
    linkUrl: normalizeLinkUrl(input.linkUrl),
    sortOrder: Number.isSafeInteger(input.sortOrder) ? Number(input.sortOrder) : 100,
    isVisible: input.isVisible !== false,
    imageUrl: `/api/hero-image/${id}`,
    objectKey,
    isSeed: false
  };

  const slides = await readManifest();
  slides.push(slide);
  await writeManifest(slides);
  return slide;
}

export async function updateHomepageHeroSlide(
  id: string,
  input: { title?: string; altText?: string; linkUrl?: string | null; sortOrder?: number; isVisible?: boolean }
): Promise<HomepageHeroSlide> {
  const slides = await readManifest();
  const index = slides.findIndex((slide) => slide.id === id);
  if (index < 0) throw new Error("Hero slide not found.");
  const current = slides[index];
  const title = input.title === undefined ? current.title : input.title.trim();
  if (!title) throw new Error("Title is required.");
  const next: HomepageHeroSlide = {
    ...current,
    title,
    altText: input.altText === undefined ? current.altText : input.altText.trim().slice(0, 500),
    linkUrl: input.linkUrl === undefined ? current.linkUrl : normalizeLinkUrl(input.linkUrl),
    sortOrder: input.sortOrder === undefined ? current.sortOrder : Number(input.sortOrder),
    isVisible: input.isVisible === undefined ? current.isVisible : Boolean(input.isVisible)
  };
  if (!Number.isSafeInteger(next.sortOrder)) throw new Error("Sort order must be a whole number.");
  slides[index] = next;
  await writeManifest(slides);
  return next;
}

export async function deleteHomepageHeroSlide(id: string): Promise<void> {
  if (id === SEED_ID) throw new Error("The launch banner is protected. Hide it instead of deleting it.");
  const slides = await readManifest();
  const current = slides.find((slide) => slide.id === id);
  if (!current) throw new Error("Hero slide not found.");
  await writeManifest(slides.filter((slide) => slide.id !== id));
  if (current.objectKey) {
    try { await storage().delete(current.objectKey); } catch { /* manifest is authoritative; orphan cleanup can be retried later */ }
  }
}

export async function readHomepageHeroImage(id: string) {
  const slides = await readManifest();
  const slide = slides.find((candidate) => candidate.id === id);
  if (!slide?.objectKey) return null;
  const object = await storage().read(slide.objectKey);
  return {
    bytes: await bodyToBuffer(object.stream),
    contentType: object.contentType || "application/octet-stream",
    etag: object.etag
  };
}
