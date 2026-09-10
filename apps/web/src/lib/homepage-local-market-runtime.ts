import { createHash } from "node:crypto";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type HomepageLocalMarketScene = Readonly<{
  id: string;
  eyebrow: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  altText: string;
  isVisible: boolean;
  imageUrl: string | null;
}>;

type HomepageLocalMarketSceneRow = Readonly<{
  id: string;
  eyebrow: string;
  headline: string;
  body: string;
  cta_label: string;
  cta_url: string;
  alt_text: string;
  is_visible: boolean;
  has_image: boolean;
  image_etag: string | null;
}>;

type HomepageLocalMarketImageRow = Readonly<{
  image_bytes: Buffer | Uint8Array | null;
  image_content_type: string | null;
  image_etag: string | null;
}>;

const SCENE_ID = "sparta-local-market";

const FAIL_CLOSED_SCENE: HomepageLocalMarketScene = {
  id: SCENE_ID,
  eyebrow: "ΣΠΑΡΤΗ · ΤΟΠΙΚΗ ΑΓΟΡΑ",
  headline: "Η πόλη πίσω από τα προϊόντα.",
  body: "Άνθρωποι, προϊόντα και πραγματικά καταστήματα — στο ίδιο μέρος.",
  ctaLabel: "Γνώρισε τα καταστήματα",
  ctaUrl: "/shops",
  altText: "Η κεντρική πλατεία της Σπάρτης με τον Ταΰγετο στο βάθος.",
  isVisible: false,
  imageUrl: null
};

function pool() {
  return getProductionPostgresRuntime().nativePool;
}

function normalizeRequiredText(value: unknown, field: string, maxLength: number): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} is required.`);
  if (text.length > maxLength) throw new Error(`${field} must be at most ${maxLength} characters.`);
  return text;
}

function normalizeOptionalText(value: unknown, field: string, maxLength: number): string {
  const text = String(value ?? "").trim();
  if (text.length > maxLength) throw new Error(`${field} must be at most ${maxLength} characters.`);
  return text;
}

function normalizeCtaUrl(value: unknown): string {
  const raw = normalizeOptionalText(value, "CTA link", 1000);
  if (!raw) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("CTA link must be an http(s) URL or a /relative path.");
  return url.toString();
}

function validateImage(file: File) {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
  if (!allowed.has(file.type)) throw new Error("Upload a JPG, PNG, WebP, GIF or AVIF image.");
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("Images must be between 1 byte and 10 MB.");
}

function sceneFromRow(row: HomepageLocalMarketSceneRow): HomepageLocalMarketScene {
  return {
    id: row.id,
    eyebrow: row.eyebrow,
    headline: row.headline,
    body: row.body,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    altText: row.alt_text,
    isVisible: row.is_visible,
    imageUrl: row.has_image ? `/api/homepage-local-market-image?v=${encodeURIComponent(row.image_etag || "1")}` : null
  };
}

export async function getHomepageLocalMarketScene(): Promise<HomepageLocalMarketScene> {
  try {
    const result = await pool().query(`
      SELECT id, eyebrow, headline, body, cta_label, cta_url, alt_text, is_visible,
             (image_bytes IS NOT NULL) AS has_image, image_etag
      FROM bls_private.homepage_local_market_scene
      WHERE id = $1
      LIMIT 1
    `, [SCENE_ID]);
    const row = result.rows[0] as HomepageLocalMarketSceneRow | undefined;
    return row ? sceneFromRow(row) : FAIL_CLOSED_SCENE;
  } catch {
    return FAIL_CLOSED_SCENE;
  }
}

export async function updateHomepageLocalMarketScene(input: {
  eyebrow: string;
  headline: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  altText?: string;
  isVisible?: boolean;
  file?: File | null;
}): Promise<HomepageLocalMarketScene> {
  const eyebrow = normalizeRequiredText(input.eyebrow, "Eyebrow", 120);
  const headline = normalizeRequiredText(input.headline, "Headline", 240);
  const body = normalizeOptionalText(input.body, "Body", 1200);
  const ctaLabel = normalizeOptionalText(input.ctaLabel, "CTA label", 120);
  const ctaUrl = normalizeCtaUrl(input.ctaUrl);
  const altText = normalizeOptionalText(input.altText, "Alt text", 500);
  if (Boolean(ctaLabel) !== Boolean(ctaUrl)) throw new Error("CTA label and CTA link must either both be filled or both be empty.");

  const isVisible = input.isVisible !== false;
  let result;

  if (input.file) {
    validateImage(input.file);
    const bytes = Buffer.from(await input.file.arrayBuffer());
    const etag = createHash("sha256").update(bytes).digest("hex");
    result = await pool().query(
      `UPDATE bls_private.homepage_local_market_scene
       SET eyebrow = $2,
           headline = $3,
           body = $4,
           cta_label = $5,
           cta_url = $6,
           alt_text = $7,
           is_visible = $8,
           image_bytes = $9,
           image_content_type = $10,
           image_etag = $11,
           updated_at = now()
       WHERE id = $1
       RETURNING id, eyebrow, headline, body, cta_label, cta_url, alt_text, is_visible,
                 (image_bytes IS NOT NULL) AS has_image, image_etag`,
      [SCENE_ID, eyebrow, headline, body, ctaLabel, ctaUrl, altText, isVisible, bytes, input.file.type, etag]
    );
  } else {
    result = await pool().query(
      `UPDATE bls_private.homepage_local_market_scene
       SET eyebrow = $2,
           headline = $3,
           body = $4,
           cta_label = $5,
           cta_url = $6,
           alt_text = $7,
           is_visible = $8,
           updated_at = now()
       WHERE id = $1
       RETURNING id, eyebrow, headline, body, cta_label, cta_url, alt_text, is_visible,
                 (image_bytes IS NOT NULL) AS has_image, image_etag`,
      [SCENE_ID, eyebrow, headline, body, ctaLabel, ctaUrl, altText, isVisible]
    );
  }

  const row = result.rows[0] as HomepageLocalMarketSceneRow | undefined;
  if (!row) throw new Error("Homepage local-market section not found.");
  return sceneFromRow(row);
}

export async function readHomepageLocalMarketImage() {
  const result = await pool().query(
    `SELECT image_bytes, image_content_type, image_etag
     FROM bls_private.homepage_local_market_scene
     WHERE id = $1`,
    [SCENE_ID]
  );
  const row = result.rows[0] as HomepageLocalMarketImageRow | undefined;
  if (!row?.image_bytes || !row.image_content_type || !row.image_etag) return null;
  return {
    bytes: Buffer.from(row.image_bytes),
    contentType: row.image_content_type,
    etag: `"${row.image_etag}"`
  };
}
