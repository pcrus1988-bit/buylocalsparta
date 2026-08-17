import { id } from "../common/ids.ts";
import type {
  ContentBlock,
  ContentLocale,
  ContentPage,
  ContentPageType,
  ContentRedirect,
  ContentRevision,
  ContentStatus,
  ContentTranslation,
  MerchantStory,
  NavigationItem,
  NavigationMenu,
  ProductCollection,
  SeoMetadata,
  StoryStatus
} from "./types.ts";

const SUPPORTED_LOCALES = new Set<ContentLocale>(["el", "en"]);
const BLOCK_TYPES = new Set([
  "hero", "rich_text", "category_grid", "product_collection", "merchant_spotlight", "shop_story",
  "advice_cta", "ask_local_cta", "local_impact", "faq", "trust"
]);

function cleanSlug(value: string): string {
  const slug = value.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!slug && value.trim() !== "") throw new Error("Content slug is invalid");
  if (slug.includes("..") || slug.includes("?") || slug.includes("#")) throw new Error("Content slug is invalid");
  if (slug && !/^[a-z0-9\-_/]+$/.test(slug)) throw new Error("Content slug must use URL-safe Latin characters");
  return slug;
}

function cleanPath(value: string): string {
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("\n") || path.includes("\r")) throw new Error("Redirect path must be an internal absolute path");
  return path.replace(/\/{2,}/g, "/");
}

function validateSeo(seo: SeoMetadata): void {
  if (!seo.title.trim()) throw new Error("SEO title is required");
  if (!seo.description.trim()) throw new Error("SEO description is required");
  if (seo.title.length > 120) throw new Error("SEO title is too long");
  if (seo.description.length > 320) throw new Error("SEO description is too long");
  if (seo.ogImage && !seo.ogImage.startsWith("/") && !/^https:\/\//i.test(seo.ogImage)) throw new Error("Open Graph image must use an internal path or HTTPS URL");
}

function validateBlocks(blocks: readonly ContentBlock[]): void {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (!block.id.trim()) throw new Error("Content block ID is required");
    if (ids.has(block.id)) throw new Error("Content block IDs must be unique within a page");
    ids.add(block.id);
    if (!BLOCK_TYPES.has(block.type)) throw new Error(`Unsupported content block type: ${block.type}`);
    if (!block.data || typeof block.data !== "object" || Array.isArray(block.data)) throw new Error("Content block data must be an object");
  }
}

function validateTranslation(translation: ContentTranslation): void {
  if (!SUPPORTED_LOCALES.has(translation.locale)) throw new Error("Unsupported content locale");
  if (!translation.title.trim()) throw new Error("Content title is required");
  validateSeo(translation.seo);
  validateBlocks(translation.blocks);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class ContentService {
  readonly #pages = new Map<string, ContentPage>();
  readonly #pageByRoute = new Map<string, string>();
  readonly #revisions: ContentRevision[] = [];
  readonly #menus = new Map<string, NavigationMenu>();
  readonly #redirects = new Map<string, ContentRedirect>();
  readonly #stories = new Map<string, MerchantStory>();
  readonly #collections = new Map<string, ProductCollection>();

  createPage(input: {
    marketId: string;
    pageType: ContentPageType;
    slug: string;
    translations: readonly ContentTranslation[];
    actorId: string;
    now: number;
  }): ContentPage {
    if (!input.marketId.trim() || !input.actorId.trim()) throw new Error("Market and content actor are required");
    const slug = cleanSlug(input.slug);
    const routeKey = `${input.marketId}:${slug}`;
    if (this.#pageByRoute.has(routeKey)) throw new Error("A CMS page already exists at this market route");
    const translations = this.#translationMap(input.translations);
    const page: ContentPage = {
      id: id("page"), marketId: input.marketId, pageType: input.pageType, slug, status: "draft", version: 1,
      translations, createdAt: input.now, updatedAt: input.now, createdBy: input.actorId, updatedBy: input.actorId
    };
    this.#pages.set(page.id, page);
    this.#pageByRoute.set(routeKey, page.id);
    this.#recordRevision(page, input.actorId, "page created", input.now);
    return clone(page);
  }

  updatePage(input: {
    pageId: string;
    translations?: readonly ContentTranslation[];
    pageType?: ContentPageType;
    actorId: string;
    reason: string;
    now: number;
  }): ContentPage {
    const page = this.#requiredPage(input.pageId);
    if (page.status === "archived") throw new Error("Archived pages must be restored before editing");
    if (!input.actorId.trim() || !input.reason.trim()) throw new Error("Content edits require actor and reason");
    const next: ContentPage = {
      ...page,
      pageType: input.pageType ?? page.pageType,
      translations: input.translations ? this.#translationMap(input.translations) : page.translations,
      version: page.version + 1,
      updatedAt: input.now,
      updatedBy: input.actorId
    };
    this.#pages.set(page.id, next);
    this.#recordRevision(next, input.actorId, input.reason.trim(), input.now);
    return clone(next);
  }

  publishPage(input: { pageId: string; actorId: string; now: number; scheduledAt?: number }): ContentPage {
    const page = this.#requiredPage(input.pageId);
    this.#assertPublishable(page);
    if (input.scheduledAt !== undefined && input.scheduledAt <= input.now) throw new Error("Scheduled publication time must be in the future");
    const status: ContentStatus = input.scheduledAt ? "scheduled" : "published";
    const next: ContentPage = {
      ...page,
      status,
      scheduledAt: input.scheduledAt,
      publishedAt: input.scheduledAt ? page.publishedAt : input.now,
      version: page.version + 1,
      updatedAt: input.now,
      updatedBy: input.actorId
    };
    this.#pages.set(page.id, next);
    this.#recordRevision(next, input.actorId, status === "published" ? "page published" : "page scheduled", input.now);
    return clone(next);
  }

  archivePage(input: { pageId: string; actorId: string; reason: string; now: number }): ContentPage {
    const page = this.#requiredPage(input.pageId);
    if (!input.reason.trim()) throw new Error("Archiving content requires a reason");
    const next: ContentPage = { ...page, status: "archived", scheduledAt: undefined, version: page.version + 1, updatedAt: input.now, updatedBy: input.actorId };
    this.#pages.set(page.id, next);
    this.#recordRevision(next, input.actorId, `archived: ${input.reason.trim()}`, input.now);
    return clone(next);
  }

  restorePage(input: { pageId: string; actorId: string; now: number }): ContentPage {
    const page = this.#requiredPage(input.pageId);
    if (page.status !== "archived") throw new Error("Only archived content can be restored");
    const next: ContentPage = { ...page, status: "draft", version: page.version + 1, updatedAt: input.now, updatedBy: input.actorId };
    this.#pages.set(page.id, next);
    this.#recordRevision(next, input.actorId, "page restored to draft", input.now);
    return clone(next);
  }

  releaseScheduled(now: number, actorId = "system:scheduler"): readonly ContentPage[] {
    const published: ContentPage[] = [];
    for (const page of this.#pages.values()) {
      if (page.status !== "scheduled" || page.scheduledAt === undefined || page.scheduledAt > now) continue;
      const next: ContentPage = { ...page, status: "published", publishedAt: page.scheduledAt, scheduledAt: undefined, version: page.version + 1, updatedAt: now, updatedBy: actorId };
      this.#pages.set(page.id, next);
      this.#recordRevision(next, actorId, "scheduled page published", now);
      published.push(clone(next));
    }
    return published;
  }

  page(pageId: string): ContentPage | undefined {
    const page = this.#pages.get(pageId);
    return page ? clone(page) : undefined;
  }

  pages(filter: { marketId?: string; status?: ContentStatus } = {}): readonly ContentPage[] {
    return [...this.#pages.values()]
      .filter((page) => !filter.marketId || page.marketId === filter.marketId)
      .filter((page) => !filter.status || page.status === filter.status)
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map(clone);
  }

  publicPage(input: { marketId: string; slug: string; locale: ContentLocale; now: number }): Readonly<{ page: ContentPage; translation: ContentTranslation }> | undefined {
    const pageId = this.#pageByRoute.get(`${input.marketId}:${cleanSlug(input.slug)}`);
    if (!pageId) return undefined;
    const page = this.#pages.get(pageId)!;
    const live = page.status === "published" || (page.status === "scheduled" && page.scheduledAt !== undefined && page.scheduledAt <= input.now);
    if (!live) return undefined;
    const translation = page.translations[input.locale] ?? page.translations.el;
    if (!translation) return undefined;
    return { page: clone(page), translation: clone(translation) };
  }

  revisions(pageId: string): readonly ContentRevision[] {
    return this.#revisions.filter((revision) => revision.pageId === pageId).map(clone);
  }

  setNavigation(input: { marketId: string; key: NavigationMenu["key"]; locale: ContentLocale; items: readonly NavigationItem[]; actorId: string; now: number }): NavigationMenu {
    if (!SUPPORTED_LOCALES.has(input.locale)) throw new Error("Unsupported navigation locale");
    this.#validateNavigation(input.items);
    const mapKey = `${input.marketId}:${input.key}:${input.locale}`;
    const previous = this.#menus.get(mapKey);
    const menu: NavigationMenu = {
      id: previous?.id ?? id("nav"), marketId: input.marketId, key: input.key, locale: input.locale,
      version: (previous?.version ?? 0) + 1, items: clone(input.items), updatedAt: input.now, updatedBy: input.actorId
    };
    this.#menus.set(mapKey, menu);
    return clone(menu);
  }

  navigation(marketId: string, key: NavigationMenu["key"], locale: ContentLocale): NavigationMenu | undefined {
    const menu = this.#menus.get(`${marketId}:${key}:${locale}`) ?? this.#menus.get(`${marketId}:${key}:el`);
    return menu ? clone(menu) : undefined;
  }

  addRedirect(input: { marketId: string; fromPath: string; toPath: string; statusCode?: ContentRedirect["statusCode"]; actorId: string; now: number }): ContentRedirect {
    const fromPath = cleanPath(input.fromPath);
    const toPath = cleanPath(input.toPath);
    if (fromPath === toPath) throw new Error("Redirect source and destination cannot be identical");
    this.#assertNoRedirectLoop(input.marketId, fromPath, toPath);
    const existing = [...this.#redirects.values()].find((redirect) => redirect.marketId === input.marketId && redirect.fromPath === fromPath && redirect.active);
    if (existing) this.#redirects.set(existing.id, { ...existing, active: false });
    const redirect: ContentRedirect = { id: id("redirect"), marketId: input.marketId, fromPath, toPath, statusCode: input.statusCode ?? 301, active: true, createdAt: input.now, createdBy: input.actorId };
    this.#redirects.set(redirect.id, redirect);
    return clone(redirect);
  }

  resolveRedirect(marketId: string, fromPath: string): ContentRedirect | undefined {
    const path = cleanPath(fromPath);
    const redirect = [...this.#redirects.values()].find((item) => item.marketId === marketId && item.fromPath === path && item.active);
    return redirect ? clone(redirect) : undefined;
  }

  redirects(marketId?: string): readonly ContentRedirect[] {
    return [...this.#redirects.values()].filter((item) => !marketId || item.marketId === marketId).map(clone);
  }

  createStory(input: Omit<MerchantStory, "id" | "status" | "vendorApprovedAt" | "vendorApprovedBy" | "publishedAt" | "createdAt" | "updatedAt"> & { now: number }): MerchantStory {
    if (!input.vendorId.trim() || !input.authorLabel.trim() || !input.title.trim() || !input.excerpt.trim()) throw new Error("Merchant story identity, title, excerpt and author are required");
    validateBlocks(input.blocks);
    validateSeo(input.seo);
    const slug = cleanSlug(input.slug);
    if ([...this.#stories.values()].some((story) => story.marketId === input.marketId && story.slug === slug && story.locale === input.locale)) throw new Error("Merchant story route already exists");
    const story: MerchantStory = { ...clone(input), id: id("story"), slug, status: "draft", createdAt: input.now, updatedAt: input.now };
    this.#stories.set(story.id, story);
    return clone(story);
  }

  requestStoryApproval(storyId: string, now: number): MerchantStory {
    return this.#setStoryStatus(storyId, "vendor_review", now);
  }

  approveStory(input: { storyId: string; vendorId: string; actorId: string; now: number }): MerchantStory {
    const story = this.#requiredStory(input.storyId);
    if (story.vendorId !== input.vendorId) throw new Error("Merchant story belongs to another vendor");
    if (story.status !== "vendor_review" && story.status !== "draft") throw new Error("Merchant story is not awaiting vendor approval");
    const next: MerchantStory = { ...story, status: "approved", vendorApprovedAt: input.now, vendorApprovedBy: input.actorId, updatedAt: input.now };
    this.#stories.set(story.id, next);
    return clone(next);
  }

  publishStory(input: { storyId: string; actorId: string; now: number }): MerchantStory {
    const story = this.#requiredStory(input.storyId);
    if (story.status !== "approved" || !story.vendorApprovedAt) throw new Error("Merchant story requires vendor approval before publication");
    const next: MerchantStory = { ...story, status: "published", publishedAt: input.now, updatedAt: input.now };
    this.#stories.set(story.id, next);
    return clone(next);
  }

  stories(filter: { marketId?: string; vendorId?: string; status?: StoryStatus; locale?: ContentLocale } = {}): readonly MerchantStory[] {
    return [...this.#stories.values()]
      .filter((story) => !filter.marketId || story.marketId === filter.marketId)
      .filter((story) => !filter.vendorId || story.vendorId === filter.vendorId)
      .filter((story) => !filter.status || story.status === filter.status)
      .filter((story) => !filter.locale || story.locale === filter.locale)
      .sort((a, b) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt))
      .map(clone);
  }

  createCollection(input: Omit<ProductCollection, "id" | "status" | "publishedAt" | "updatedAt"> & { actorId: string; now: number }): ProductCollection {
    if (!input.title.trim()) throw new Error("Collection title is required");
    if (new Set(input.canonicalVariantIds).size !== input.canonicalVariantIds.length) throw new Error("Collection cannot contain duplicate canonical products");
    validateSeo(input.seo);
    const slug = cleanSlug(input.slug);
    const collection: ProductCollection = { ...clone(input), id: id("collection"), slug, status: "draft", updatedAt: input.now, updatedBy: input.actorId };
    this.#collections.set(collection.id, collection);
    return clone(collection);
  }

  publishCollection(input: { collectionId: string; actorId: string; now: number }): ProductCollection {
    const collection = this.#collections.get(input.collectionId);
    if (!collection) throw new Error("Collection not found");
    const next: ProductCollection = { ...collection, status: "published", publishedAt: input.now, updatedAt: input.now, updatedBy: input.actorId };
    this.#collections.set(collection.id, next);
    return clone(next);
  }

  collections(filter: { marketId?: string; status?: ContentStatus; locale?: ContentLocale } = {}): readonly ProductCollection[] {
    return [...this.#collections.values()]
      .filter((collection) => !filter.marketId || collection.marketId === filter.marketId)
      .filter((collection) => !filter.status || collection.status === filter.status)
      .filter((collection) => !filter.locale || collection.locale === filter.locale)
      .map(clone);
  }

  #translationMap(input: readonly ContentTranslation[]): Readonly<Partial<Record<ContentLocale, ContentTranslation>>> {
    if (!input.length) throw new Error("At least one content translation is required");
    const result: Partial<Record<ContentLocale, ContentTranslation>> = {};
    for (const translation of input) {
      validateTranslation(translation);
      if (result[translation.locale]) throw new Error("Duplicate content locale");
      result[translation.locale] = clone(translation);
    }
    if (!result.el) throw new Error("Greek content is required for the Sparta pilot");
    return result;
  }

  #assertPublishable(page: ContentPage): void {
    const greek = page.translations.el;
    if (!greek) throw new Error("Greek translation is required before publication");
    validateTranslation(greek);
    if (!greek.blocks.length && page.pageType !== "legal") throw new Error("Non-legal page requires at least one content block before publication");
  }

  #recordRevision(page: ContentPage, actorId: string, reason: string, now: number): void {
    this.#revisions.push({ id: id("revision"), pageId: page.id, version: page.version, actorId, reason, snapshot: clone(page), createdAt: now });
  }

  #requiredPage(pageId: string): ContentPage {
    const page = this.#pages.get(pageId);
    if (!page) throw new Error("CMS page not found");
    return page;
  }

  #validateNavigation(items: readonly NavigationItem[], depth = 0): void {
    if (depth > 2) throw new Error("Navigation nesting is limited to three levels");
    const ids = new Set<string>();
    for (const item of items) {
      if (!item.id.trim() || !item.label.trim()) throw new Error("Navigation items require ID and label");
      if (ids.has(item.id)) throw new Error("Navigation item IDs must be unique within a menu level");
      ids.add(item.id);
      if (!item.href.startsWith("/") && !/^https:\/\//i.test(item.href)) throw new Error("Navigation links must be internal or HTTPS");
      if (item.children?.length) this.#validateNavigation(item.children, depth + 1);
    }
  }

  #assertNoRedirectLoop(marketId: string, fromPath: string, toPath: string): void {
    let cursor = toPath;
    const visited = new Set([fromPath]);
    for (let i = 0; i < 20; i += 1) {
      if (visited.has(cursor)) throw new Error("Redirect would create a loop");
      visited.add(cursor);
      const next = [...this.#redirects.values()].find((item) => item.marketId === marketId && item.fromPath === cursor && item.active);
      if (!next) return;
      cursor = next.toPath;
    }
    throw new Error("Redirect chain is too deep");
  }

  #requiredStory(storyId: string): MerchantStory {
    const story = this.#stories.get(storyId);
    if (!story) throw new Error("Merchant story not found");
    return story;
  }

  #setStoryStatus(storyId: string, status: StoryStatus, now: number): MerchantStory {
    const story = this.#requiredStory(storyId);
    const next = { ...story, status, updatedAt: now };
    this.#stories.set(story.id, next);
    return clone(next);
  }
}
