import { randomUUID } from "node:crypto";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type HomepagePromoCta = Readonly<{
  id: string;
  eyebrow: string;
  headline: string;
  body: string;
  buttonLabel: string;
  linkUrl: string;
  supportingText: string;
  sortOrder: number;
  isVisible: boolean;
}>;

type HomepagePromoCtaRow = Readonly<{
  id: string;
  eyebrow: string;
  headline: string;
  body: string;
  button_label: string;
  link_url: string;
  supporting_text: string;
  sort_order: number;
  is_visible: boolean;
}>;

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

function normalizeLinkUrl(value: unknown): string {
  const raw = normalizeRequiredText(value, "Link", 1000);
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("CTA link must be an http(s) URL or a /relative path.");
  return url.toString();
}

function normalizeSortOrder(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const sortOrder = Number(value);
  if (!Number.isSafeInteger(sortOrder)) throw new Error("Sort order must be a whole number.");
  return sortOrder;
}

function ctaFromRow(row: HomepagePromoCtaRow): HomepagePromoCta {
  return {
    id: row.id,
    eyebrow: row.eyebrow,
    headline: row.headline,
    body: row.body,
    buttonLabel: row.button_label,
    linkUrl: row.link_url,
    supportingText: row.supporting_text,
    sortOrder: Number(row.sort_order),
    isVisible: row.is_visible
  };
}

async function readCtas(): Promise<HomepagePromoCta[]> {
  try {
    const result = await pool().query(`
      SELECT id, eyebrow, headline, body, button_label, link_url, supporting_text, sort_order, is_visible
      FROM bls_private.homepage_promo_ctas
      ORDER BY sort_order ASC, created_at ASC, id ASC
    `);
    return (result.rows as HomepagePromoCtaRow[]).map(ctaFromRow);
  } catch {
    // Homepage content must fail closed: a DB outage should never force a promotion to reappear.
    return [];
  }
}

export async function listHomepagePromoCtas(input: { visibleOnly?: boolean } = {}): Promise<HomepagePromoCta[]> {
  const ctas = await readCtas();
  return input.visibleOnly ? ctas.filter((cta) => cta.isVisible) : ctas;
}

export async function createHomepagePromoCta(input: {
  eyebrow: string;
  headline: string;
  body?: string;
  buttonLabel: string;
  linkUrl: string;
  supportingText?: string;
  sortOrder?: number;
  isVisible?: boolean;
}): Promise<HomepagePromoCta> {
  const id = randomUUID();
  const eyebrow = normalizeRequiredText(input.eyebrow, "Eyebrow", 120);
  const headline = normalizeRequiredText(input.headline, "Headline", 240);
  const body = normalizeOptionalText(input.body, "Body", 1200);
  const buttonLabel = normalizeRequiredText(input.buttonLabel, "Button label", 120);
  const linkUrl = normalizeLinkUrl(input.linkUrl);
  const supportingText = normalizeOptionalText(input.supportingText, "Supporting text", 500);
  const sortOrder = normalizeSortOrder(input.sortOrder, 100);

  const result = await pool().query(
    `INSERT INTO bls_private.homepage_promo_ctas
       (id, eyebrow, headline, body, button_label, link_url, supporting_text, sort_order, is_visible)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, eyebrow, headline, body, button_label, link_url, supporting_text, sort_order, is_visible`,
    [id, eyebrow, headline, body, buttonLabel, linkUrl, supportingText, sortOrder, input.isVisible !== false]
  );

  return ctaFromRow(result.rows[0] as HomepagePromoCtaRow);
}

export async function updateHomepagePromoCta(
  id: string,
  input: {
    eyebrow?: string;
    headline?: string;
    body?: string;
    buttonLabel?: string;
    linkUrl?: string;
    supportingText?: string;
    sortOrder?: number;
    isVisible?: boolean;
  }
): Promise<HomepagePromoCta> {
  const currentResult = await pool().query(
    `SELECT id, eyebrow, headline, body, button_label, link_url, supporting_text, sort_order, is_visible
     FROM bls_private.homepage_promo_ctas
     WHERE id = $1`,
    [id]
  );
  const current = currentResult.rows[0] as HomepagePromoCtaRow | undefined;
  if (!current) throw new Error("Homepage CTA not found.");

  const eyebrow = input.eyebrow === undefined ? current.eyebrow : normalizeRequiredText(input.eyebrow, "Eyebrow", 120);
  const headline = input.headline === undefined ? current.headline : normalizeRequiredText(input.headline, "Headline", 240);
  const body = input.body === undefined ? current.body : normalizeOptionalText(input.body, "Body", 1200);
  const buttonLabel = input.buttonLabel === undefined ? current.button_label : normalizeRequiredText(input.buttonLabel, "Button label", 120);
  const linkUrl = input.linkUrl === undefined ? current.link_url : normalizeLinkUrl(input.linkUrl);
  const supportingText = input.supportingText === undefined ? current.supporting_text : normalizeOptionalText(input.supportingText, "Supporting text", 500);
  const sortOrder = input.sortOrder === undefined ? Number(current.sort_order) : normalizeSortOrder(input.sortOrder, Number(current.sort_order));
  const isVisible = input.isVisible === undefined ? current.is_visible : Boolean(input.isVisible);

  const result = await pool().query(
    `UPDATE bls_private.homepage_promo_ctas
     SET eyebrow = $2,
         headline = $3,
         body = $4,
         button_label = $5,
         link_url = $6,
         supporting_text = $7,
         sort_order = $8,
         is_visible = $9,
         updated_at = now()
     WHERE id = $1
     RETURNING id, eyebrow, headline, body, button_label, link_url, supporting_text, sort_order, is_visible`,
    [id, eyebrow, headline, body, buttonLabel, linkUrl, supportingText, sortOrder, isVisible]
  );

  return ctaFromRow(result.rows[0] as HomepagePromoCtaRow);
}

export async function deleteHomepagePromoCta(id: string): Promise<void> {
  const result = await pool().query(`DELETE FROM bls_private.homepage_promo_ctas WHERE id = $1`, [id]);
  if (!result.rowCount) throw new Error("Homepage CTA not found.");
}
