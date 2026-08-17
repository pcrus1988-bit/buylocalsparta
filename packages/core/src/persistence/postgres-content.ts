import { randomUUID } from "node:crypto";
import type {
  ContentBlock,
  ContentLocale,
  ContentPage,
  ContentPageType,
  ContentRedirect,
  ContentStatus,
  ContentTranslation,
  MerchantStory,
  NavigationMenu,
  ProductCollection,
  SeoMetadata,
  StoryStatus
} from "../content/index.ts";
import { PostgresUnitOfWork, requireSingleRow, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

function epoch(value: unknown, field: string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`Database field ${field} is not a timestamp`);
}

function optionalEpoch(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  return epoch(value, "timestamp");
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Database field ${field} is not a string`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function jsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return structuredClone(value) as T[];
  if (typeof value === "string") {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as T[];
  }
  return [];
}

function seoFrom(row: SqlRow): SeoMetadata {
  return {
    title: requiredString(row.seo_title, "seo_title"),
    description: requiredString(row.seo_description, "seo_description"),
    noindex: row.noindex === true || row.seo_noindex === true,
    ogTitle: optionalString(row.og_title),
    ogDescription: optionalString(row.og_description),
    ogImage: optionalString(row.og_image)
  };
}

async function marketUuid(db: SqlExecutor, marketId: string): Promise<string> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code=$1 OR id::text=$1", [marketId]);
  return String(requireSingleRow(result, `Market ${marketId} was not found`).id);
}

async function userUuid(db: SqlExecutor, userId: string): Promise<string | null> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [userId]);
  return result.rowCount === 1 ? String(result.rows[0].id) : null;
}

async function vendorUuid(db: SqlExecutor, vendorId: string): Promise<string> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1", [vendorId]);
  return String(requireSingleRow(result, `Vendor ${vendorId} was not found`).id);
}

async function canonicalUuids(db: SqlExecutor, publicIds: readonly string[]): Promise<string[]> {
  const values: string[] = [];
  for (const publicId of publicIds) {
    const result = await db.query<SqlRow>("SELECT id::text AS id FROM canonical_variants WHERE public_id=$1 OR id::text=$1", [publicId]);
    values.push(String(requireSingleRow(result, `Canonical product ${publicId} was not found`).id));
  }
  return values;
}

export class PostgresContentRepository {
  readonly #uow: PostgresUnitOfWork;
  readonly #db: SqlExecutor;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool);
    this.#db = pool;
  }

  async savePage(input: { scope: DatabaseScope; page: ContentPage; revisionReason: string }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.page.marketId, platformAccess: true }, async (tx) => {
      const marketId = await marketUuid(tx, input.page.marketId);
      const createdBy = await userUuid(tx, input.page.createdBy);
      const updatedBy = await userUuid(tx, input.page.updatedBy);
      const inserted = await tx.query<SqlRow>(`
        INSERT INTO cms_pages (id,public_id,market_id,page_type,slug,status,blocks,published_at,scheduled_at,version,created_by,updated_by,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,'[]'::jsonb,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (public_id) DO UPDATE SET page_type=EXCLUDED.page_type,slug=EXCLUDED.slug,status=EXCLUDED.status,
          published_at=EXCLUDED.published_at,scheduled_at=EXCLUDED.scheduled_at,version=EXCLUDED.version,
          updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
        RETURNING id::text AS id
      `, [randomUUID(), input.page.id, marketId, input.page.pageType, input.page.slug, input.page.status,
        input.page.publishedAt ? new Date(input.page.publishedAt) : null, input.page.scheduledAt ? new Date(input.page.scheduledAt) : null,
        input.page.version, createdBy, updatedBy, new Date(input.page.createdAt), new Date(input.page.updatedAt)]);
      const pageUuid = String(requireSingleRow(inserted, "Unable to persist CMS page").id);
      await tx.query("DELETE FROM cms_page_translations WHERE page_id=$1", [pageUuid]);
      for (const translation of Object.values(input.page.translations).filter(Boolean) as ContentTranslation[]) {
        await tx.query(`
          INSERT INTO cms_page_translations (page_id,locale,title,seo_title,seo_description,translated_blocks,noindex,og_title,og_description,og_image)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
        `, [pageUuid, translation.locale, translation.title, translation.seo.title, translation.seo.description, JSON.stringify(translation.blocks),
          translation.seo.noindex ?? false, translation.seo.ogTitle ?? null, translation.seo.ogDescription ?? null, translation.seo.ogImage ?? null]);
      }
      await tx.query(`
        INSERT INTO cms_page_revisions (id,public_id,page_id,version,actor_user_id,actor_public_id,reason,snapshot,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
        ON CONFLICT (page_id,version) DO NOTHING
      `, [randomUUID(), `revision-${input.page.id}-${input.page.version}`, pageUuid, input.page.version, updatedBy, input.page.updatedBy,
        input.revisionReason, JSON.stringify(input.page), new Date(input.page.updatedAt)]);
    });
  }

  async page(pageId: string): Promise<ContentPage | undefined> {
    const base = await this.#db.query<SqlRow>(`
      SELECT p.*,m.code AS market_code,cu.public_id AS created_by_public,uu.public_id AS updated_by_public
      FROM cms_pages p JOIN markets m ON m.id=p.market_id
      LEFT JOIN users cu ON cu.id=p.created_by LEFT JOIN users uu ON uu.id=p.updated_by
      WHERE p.public_id=$1 OR p.id::text=$1
    `, [pageId]);
    if (base.rowCount === 0) return undefined;
    return this.#mapPage(base.rows[0]);
  }

  async publicPage(input: { marketId: string; slug: string; locale: ContentLocale; now: number }): Promise<{ page: ContentPage; translation: ContentTranslation } | undefined> {
    const result = await this.#db.query<SqlRow>(`
      SELECT p.*,m.code AS market_code,cu.public_id AS created_by_public,uu.public_id AS updated_by_public
      FROM cms_pages p JOIN markets m ON m.id=p.market_id
      LEFT JOIN users cu ON cu.id=p.created_by LEFT JOIN users uu ON uu.id=p.updated_by
      WHERE (m.code=$1 OR m.id::text=$1) AND p.slug=$2 AND (p.status='published' OR (p.status='scheduled' AND p.scheduled_at <= $3))
      LIMIT 1
    `, [input.marketId, input.slug, new Date(input.now)]);
    if (result.rowCount === 0) return undefined;
    const page = await this.#mapPage(result.rows[0]);
    const translation = page.translations[input.locale] ?? page.translations.el;
    return translation ? { page, translation } : undefined;
  }

  async saveNavigation(input: { scope: DatabaseScope; menu: NavigationMenu }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.menu.marketId, platformAccess: true }, async (tx) => {
      const marketId = await marketUuid(tx, input.menu.marketId);
      const updatedBy = await userUuid(tx, input.menu.updatedBy);
      await tx.query(`
        INSERT INTO cms_navigation_menus (id,public_id,market_id,menu_key,locale,version,items,updated_by,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
        ON CONFLICT (market_id,menu_key,locale) DO UPDATE SET public_id=EXCLUDED.public_id,version=EXCLUDED.version,
          items=EXCLUDED.items,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
      `, [randomUUID(), input.menu.id, marketId, input.menu.key, input.menu.locale, input.menu.version, JSON.stringify(input.menu.items), updatedBy, new Date(input.menu.updatedAt)]);
    });
  }

  async saveRedirect(input: { scope: DatabaseScope; redirect: ContentRedirect }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.redirect.marketId, platformAccess: true }, async (tx) => {
      const marketId = await marketUuid(tx, input.redirect.marketId);
      const actor = await userUuid(tx, input.redirect.createdBy);
      await tx.query("UPDATE cms_redirects SET active=false WHERE market_id=$1 AND from_path=$2 AND active AND public_id<>$3", [marketId, input.redirect.fromPath, input.redirect.id]);
      await tx.query(`
        INSERT INTO cms_redirects (id,public_id,market_id,from_path,to_path,status_code,active,created_by,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (public_id) DO UPDATE SET to_path=EXCLUDED.to_path,status_code=EXCLUDED.status_code,active=EXCLUDED.active
      `, [randomUUID(), input.redirect.id, marketId, input.redirect.fromPath, input.redirect.toPath, input.redirect.statusCode, input.redirect.active, actor, new Date(input.redirect.createdAt)]);
    });
  }

  async saveStory(input: { scope: DatabaseScope; story: MerchantStory }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.story.marketId, platformAccess: true }, async (tx) => {
      const marketId = await marketUuid(tx, input.story.marketId);
      const vendorId = await vendorUuid(tx, input.story.vendorId);
      const approvedBy = input.story.vendorApprovedBy ? await userUuid(tx, input.story.vendorApprovedBy) : null;
      await tx.query(`
        INSERT INTO merchant_stories (id,public_id,market_id,vendor_id,slug,locale,status,title,excerpt,blocks,seo_title,seo_description,seo_noindex,og_title,og_description,og_image,author_label,vendor_approved_at,vendor_approved_by,published_at,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status,title=EXCLUDED.title,excerpt=EXCLUDED.excerpt,blocks=EXCLUDED.blocks,
          seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description,seo_noindex=EXCLUDED.seo_noindex,
          og_title=EXCLUDED.og_title,og_description=EXCLUDED.og_description,og_image=EXCLUDED.og_image,
          vendor_approved_at=EXCLUDED.vendor_approved_at,vendor_approved_by=EXCLUDED.vendor_approved_by,published_at=EXCLUDED.published_at,updated_at=EXCLUDED.updated_at
      `, [randomUUID(), input.story.id, marketId, vendorId, input.story.slug, input.story.locale, input.story.status, input.story.title,
        input.story.excerpt, JSON.stringify(input.story.blocks), input.story.seo.title, input.story.seo.description, input.story.seo.noindex ?? false,
        input.story.seo.ogTitle ?? null, input.story.seo.ogDescription ?? null, input.story.seo.ogImage ?? null, input.story.authorLabel,
        input.story.vendorApprovedAt ? new Date(input.story.vendorApprovedAt) : null, approvedBy, input.story.publishedAt ? new Date(input.story.publishedAt) : null,
        new Date(input.story.createdAt), new Date(input.story.updatedAt)]);
    });
  }

  async approveStory(input: { scope: DatabaseScope; storyId: string; vendorId: string; actorUserId: string; now: number }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, actorUserId: input.actorUserId, vendorId: input.vendorId, platformAccess: false }, async (tx) => {
      const actor = await userUuid(tx, input.actorUserId);
      if (!actor) throw new Error(`Story approver ${input.actorUserId} was not found`);
      const vendorId = await vendorUuid(tx, input.vendorId);
      const result = await tx.query(`
        UPDATE merchant_stories
        SET status='approved',vendor_approved_at=$1,vendor_approved_by=$2,updated_at=$1
        WHERE (public_id=$3 OR id::text=$3) AND vendor_id=$4 AND status IN ('draft','vendor_review')
        RETURNING id::text AS id
      `, [new Date(input.now), actor, input.storyId, vendorId]);
      requireSingleRow(result, "Merchant story was not found in this vendor scope or is not awaiting approval");
    });
  }

  async saveCollection(input: { scope: DatabaseScope; collection: ProductCollection }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.collection.marketId, platformAccess: true }, async (tx) => {
      const marketId = await marketUuid(tx, input.collection.marketId);
      const actor = await userUuid(tx, input.collection.updatedBy);
      const variants = await canonicalUuids(tx, input.collection.canonicalVariantIds);
      await tx.query(`
        INSERT INTO product_collections (id,public_id,market_id,slug,locale,title,description,canonical_variant_ids,status,seo_title,seo_description,seo_noindex,og_title,og_description,og_image,published_at,updated_by,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (public_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,canonical_variant_ids=EXCLUDED.canonical_variant_ids,
          status=EXCLUDED.status,seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description,seo_noindex=EXCLUDED.seo_noindex,
          og_title=EXCLUDED.og_title,og_description=EXCLUDED.og_description,og_image=EXCLUDED.og_image,published_at=EXCLUDED.published_at,
          updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
      `, [randomUUID(), input.collection.id, marketId, input.collection.slug, input.collection.locale, input.collection.title,
        input.collection.description ?? null, variants, input.collection.status, input.collection.seo.title, input.collection.seo.description,
        input.collection.seo.noindex ?? false, input.collection.seo.ogTitle ?? null, input.collection.seo.ogDescription ?? null,
        input.collection.seo.ogImage ?? null, input.collection.publishedAt ? new Date(input.collection.publishedAt) : null, actor, new Date(input.collection.updatedAt)]);
    });
  }

  async #mapPage(row: SqlRow): Promise<ContentPage> {
    const translations = await this.#db.query<SqlRow>(`
      SELECT t.* FROM cms_page_translations t JOIN cms_pages p ON p.id=t.page_id WHERE p.public_id=$1 OR p.id::text=$1
    `, [row.public_id ?? row.id]);
    const mapped: Partial<Record<ContentLocale, ContentTranslation>> = {};
    for (const item of translations.rows) {
      const locale = requiredString(item.locale, "locale") as ContentLocale;
      mapped[locale] = {
        locale,
        title: requiredString(item.title, "title"),
        seo: seoFrom(item),
        blocks: jsonArray<ContentBlock>(item.translated_blocks)
      };
    }
    return {
      id: requiredString(row.public_id, "public_id"),
      marketId: requiredString(row.market_code, "market_code"),
      pageType: requiredString(row.page_type, "page_type") as ContentPageType,
      slug: requiredString(row.slug, "slug"),
      status: requiredString(row.status, "status") as ContentStatus,
      version: Number(row.version),
      translations: mapped,
      scheduledAt: optionalEpoch(row.scheduled_at),
      publishedAt: optionalEpoch(row.published_at),
      createdAt: epoch(row.created_at, "created_at"),
      updatedAt: epoch(row.updated_at, "updated_at"),
      createdBy: optionalString(row.created_by_public) ?? "system",
      updatedBy: optionalString(row.updated_by_public) ?? "system"
    };
  }
}
