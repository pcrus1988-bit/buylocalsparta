export type ContentLocale = "el" | "en";
export type ContentStatus = "draft" | "scheduled" | "published" | "archived";
export type ContentPageType = "home" | "standard" | "landing" | "legal" | "local_landing";

export type ContentBlockType =
  | "hero"
  | "rich_text"
  | "category_grid"
  | "product_collection"
  | "merchant_spotlight"
  | "shop_story"
  | "advice_cta"
  | "ask_local_cta"
  | "local_impact"
  | "faq"
  | "trust";

export type ContentBlock = Readonly<{
  id: string;
  type: ContentBlockType;
  data: Readonly<Record<string, unknown>>;
}>;

export type SeoMetadata = Readonly<{
  title: string;
  description: string;
  noindex?: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}>;

export type ContentTranslation = Readonly<{
  locale: ContentLocale;
  title: string;
  seo: SeoMetadata;
  blocks: readonly ContentBlock[];
}>;

export type ContentPage = Readonly<{
  id: string;
  marketId: string;
  pageType: ContentPageType;
  slug: string;
  status: ContentStatus;
  version: number;
  translations: Readonly<Partial<Record<ContentLocale, ContentTranslation>>>;
  scheduledAt?: number;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  updatedBy: string;
}>;

export type ContentRevision = Readonly<{
  id: string;
  pageId: string;
  version: number;
  actorId: string;
  reason: string;
  snapshot: ContentPage;
  createdAt: number;
}>;

export type NavigationItem = Readonly<{
  id: string;
  label: string;
  href: string;
  children?: readonly NavigationItem[];
}>;

export type NavigationMenu = Readonly<{
  id: string;
  marketId: string;
  key: "primary" | "footer" | "merchant";
  locale: ContentLocale;
  version: number;
  items: readonly NavigationItem[];
  updatedAt: number;
  updatedBy: string;
}>;

export type ContentRedirect = Readonly<{
  id: string;
  marketId: string;
  fromPath: string;
  toPath: string;
  statusCode: 301 | 302 | 307 | 308;
  active: boolean;
  createdAt: number;
  createdBy: string;
}>;

export type StoryStatus = "draft" | "vendor_review" | "approved" | "published" | "archived";

export type MerchantStory = Readonly<{
  id: string;
  marketId: string;
  vendorId: string;
  slug: string;
  status: StoryStatus;
  locale: ContentLocale;
  title: string;
  excerpt: string;
  blocks: readonly ContentBlock[];
  seo: SeoMetadata;
  authorLabel: string;
  vendorApprovedAt?: number;
  vendorApprovedBy?: string;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
}>;

export type ProductCollection = Readonly<{
  id: string;
  marketId: string;
  slug: string;
  locale: ContentLocale;
  title: string;
  description?: string;
  canonicalVariantIds: readonly string[];
  status: ContentStatus;
  seo: SeoMetadata;
  publishedAt?: number;
  updatedAt: number;
  updatedBy: string;
}>;

export type SitemapEntry = Readonly<{
  path: string;
  locale: ContentLocale;
  lastModified: number;
  changeFrequency?: "daily" | "weekly" | "monthly" | "yearly";
  priority?: number;
  alternates?: Readonly<Partial<Record<ContentLocale, string>>>;
}>;
