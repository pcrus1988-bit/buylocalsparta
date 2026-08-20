import { createHash, randomUUID } from "node:crypto";
import { getProductionPostgresRuntime } from "./postgres-runtime";

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

type HeroSlideRow = Readonly<{
  id: string;
  title: string;
  alt_text: string;
  link_url: string | null;
  sort_order: number;
  is_visible: boolean;
  is_seed: boolean;
  static_image_url: string | null;
}>;

type HeroImageRow = Readonly<{
  image_bytes: Buffer | Uint8Array | null;
  image_content_type: string | null;
  image_etag: string | null;
}>;

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

function pool() {
  return getProductionPostgresRuntime().nativePool;
}

function normalizeLinkUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Hero link must be an http(s) URL or a /relative path.");
  return url.toString();
}

function normalizeTitle(value: unknown): string {
  const title = String(value ?? "").trim();
  if (!title) throw new Error("Title is required.");
  if (title.length > 240) throw new Error("Title must be at most 240 characters.");
  return title;
}

function normalizeAltText(value: unknown): string {
  const altText = String(value ?? "").trim();
  if (altText.length > 500) throw new Error("Alt text must be at most 500 characters.");
  return altText;
}

function normalizeSortOrder(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const sortOrder = Number(value);
  if (!Number.isSafeInteger(sortOrder)) throw new Error("Sort order must be a whole number.");
  return sortOrder;
}

function slideFromRow(row: HeroSlideRow): HomepageHeroSlide {
  return {
    id: row.id,
    title: row.title,
    altText: row.alt_text,
    linkUrl: row.link_url,
    sortOrder: Number(row.sort_order),
    isVisible: row.is_visible,
    imageUrl: row.static_image_url || `/api/hero-image/${encodeURIComponent(row.id)}`,
    objectKey: null,
    isSeed: row.is_seed
  };
}

async function readSlides(): Promise<HomepageHeroSlide[]> {
  try {
    const result = await pool().query(`
      SELECT id, title, alt_text, link_url, sort_order, is_visible, is_seed, static_image_url
      FROM bls_private.homepage_hero_slides
      ORDER BY sort_order ASC, created_at ASC, id ASC
    `);
    const rows = result.rows as HeroSlideRow[];
    if (!rows.length) return [DEFAULT_HOMEPAGE_HERO_SLIDE];
    return rows.map(slideFromRow);
  } catch {
    // The homepage must remain usable during a temporary database outage or during rollout.
    return [DEFAULT_HOMEPAGE_HERO_SLIDE];
  }
}

export async function listHomepageHeroSlides(input: { visibleOnly?: boolean } = {}): Promise<HomepageHeroSlide[]> {
  const slides = await readSlides();
  return input.visibleOnly ? slides.filter((slide) => slide.isVisible) : slides;
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
  const title = normalizeTitle(input.title);
  const altText = normalizeAltText(input.altText);
  const linkUrl = normalizeLinkUrl(input.linkUrl);
  const sortOrder = normalizeSortOrder(input.sortOrder, 100);
  const id = randomUUID();
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const etag = createHash("sha256").update(bytes).digest("hex");

  const result = await pool().query(
    `INSERT INTO bls_private.homepage_hero_slides
       (id, title, alt_text, link_url, sort_order, is_visible, is_seed, static_image_url,
        image_bytes, image_content_type, image_etag)
     VALUES ($1, $2, $3, $4, $5, $6, false, NULL, $7, $8, $9)
     RETURNING id, title, alt_text, link_url, sort_order, is_visible, is_seed, static_image_url`,
    [id, title, altText, linkUrl, sortOrder, input.isVisible !== false, bytes, input.file.type, etag]
  );

  return slideFromRow(result.rows[0] as HeroSlideRow);
}

export async function updateHomepageHeroSlide(
  id: string,
  input: { title?: string; altText?: string; linkUrl?: string | null; sortOrder?: number; isVisible?: boolean }
): Promise<HomepageHeroSlide> {
  const currentResult = await pool().query(
    `SELECT id, title, alt_text, link_url, sort_order, is_visible, is_seed, static_image_url
     FROM bls_private.homepage_hero_slides
     WHERE id = $1`,
    [id]
  );
  const current = currentResult.rows[0] as HeroSlideRow | undefined;
  if (!current) throw new Error("Hero slide not found.");

  const title = input.title === undefined ? current.title : normalizeTitle(input.title);
  const altText = input.altText === undefined ? current.alt_text : normalizeAltText(input.altText);
  const linkUrl = input.linkUrl === undefined ? current.link_url : normalizeLinkUrl(input.linkUrl);
  const sortOrder = input.sortOrder === undefined ? Number(current.sort_order) : normalizeSortOrder(input.sortOrder, Number(current.sort_order));
  const isVisible = input.isVisible === undefined ? current.is_visible : Boolean(input.isVisible);

  const result = await pool().query(
    `UPDATE bls_private.homepage_hero_slides
     SET title = $2,
         alt_text = $3,
         link_url = $4,
         sort_order = $5,
         is_visible = $6,
         updated_at = now()
     WHERE id = $1
     RETURNING id, title, alt_text, link_url, sort_order, is_visible, is_seed, static_image_url`,
    [id, title, altText, linkUrl, sortOrder, isVisible]
  );

  return slideFromRow(result.rows[0] as HeroSlideRow);
}

export async function deleteHomepageHeroSlide(id: string): Promise<void> {
  const result = await pool().query(
    `SELECT is_seed FROM bls_private.homepage_hero_slides WHERE id = $1`,
    [id]
  );
  const current = result.rows[0] as { is_seed: boolean } | undefined;
  if (!current) throw new Error("Hero slide not found.");
  if (current.is_seed || id === SEED_ID) throw new Error("The launch banner is protected. Hide it instead of deleting it.");
  await pool().query(`DELETE FROM bls_private.homepage_hero_slides WHERE id = $1`, [id]);
}

export async function readHomepageHeroImage(id: string) {
  const result = await pool().query(
    `SELECT image_bytes, image_content_type, image_etag
     FROM bls_private.homepage_hero_slides
     WHERE id = $1 AND is_seed = false`,
    [id]
  );
  const row = result.rows[0] as HeroImageRow | undefined;
  if (!row?.image_bytes || !row.image_content_type || !row.image_etag) return null;
  return {
    bytes: Buffer.from(row.image_bytes),
    contentType: row.image_content_type,
    etag: `"${row.image_etag}"`
  };
}
