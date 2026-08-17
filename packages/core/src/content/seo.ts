import type { ContentLocale, ContentPage, ContentTranslation, MerchantStory, ProductCollection, SitemapEntry } from "./types.ts";

export type PublicSeoDocument = Readonly<{
  title: string;
  description: string;
  canonicalUrl: string;
  robots: "index,follow" | "noindex,follow";
  alternates: Readonly<Partial<Record<ContentLocale, string>>>;
  openGraph: Readonly<{ title: string; description: string; url: string; image?: string }>;
}>;

function originUrl(origin: string, path: string): string {
  return `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function localePath(locale: ContentLocale, slug: string): string {
  const normalized = slug.replace(/^\/+|\/+$/g, "");
  return normalized ? `/${locale}/${normalized}` : `/${locale}`;
}

export function seoForPage(input: { origin: string; page: ContentPage; translation: ContentTranslation; locale: ContentLocale }): PublicSeoDocument {
  const path = localePath(input.locale, input.page.slug);
  const canonicalUrl = originUrl(input.origin, path);
  const alternates: Partial<Record<ContentLocale, string>> = {};
  for (const locale of ["el", "en"] as const) if (input.page.translations[locale]) alternates[locale] = originUrl(input.origin, localePath(locale, input.page.slug));
  return {
    title: input.translation.seo.title,
    description: input.translation.seo.description,
    canonicalUrl,
    robots: input.translation.seo.noindex ? "noindex,follow" : "index,follow",
    alternates,
    openGraph: {
      title: input.translation.seo.ogTitle ?? input.translation.seo.title,
      description: input.translation.seo.ogDescription ?? input.translation.seo.description,
      url: canonicalUrl,
      image: input.translation.seo.ogImage ? originUrl(input.origin, input.translation.seo.ogImage) : undefined
    }
  };
}

export function contentSitemap(input: {
  pages: readonly ContentPage[];
  stories?: readonly MerchantStory[];
  collections?: readonly ProductCollection[];
  now: number;
}): readonly SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const page of input.pages) {
    if (page.status !== "published" || page.publishedAt === undefined || page.publishedAt > input.now) continue;
    const alternates: Partial<Record<ContentLocale, string>> = {};
    for (const locale of ["el", "en"] as const) if (page.translations[locale] && !page.translations[locale]?.seo.noindex) alternates[locale] = localePath(locale, page.slug);
    for (const locale of ["el", "en"] as const) {
      const translation = page.translations[locale];
      if (!translation || translation.seo.noindex) continue;
      entries.push({ path: localePath(locale, page.slug), locale, lastModified: page.updatedAt, changeFrequency: page.pageType === "home" ? "daily" : "weekly", priority: page.pageType === "home" ? 1 : 0.7, alternates });
    }
  }
  for (const story of input.stories ?? []) {
    if (story.status !== "published" || !story.publishedAt || story.publishedAt > input.now || story.seo.noindex) continue;
    entries.push({ path: `/${story.locale}/stories/${story.slug}`, locale: story.locale, lastModified: story.updatedAt, changeFrequency: "monthly", priority: 0.6 });
  }
  for (const collection of input.collections ?? []) {
    if (collection.status !== "published" || !collection.publishedAt || collection.publishedAt > input.now || collection.seo.noindex) continue;
    entries.push({ path: `/${collection.locale}/collections/${collection.slug}`, locale: collection.locale, lastModified: collection.updatedAt, changeFrequency: "weekly", priority: 0.7 });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function productStructuredData(input: {
  url: string;
  name: string;
  description?: string;
  imageUrls?: readonly string[];
  brand?: string;
  sku?: string;
  gtin?: string;
  priceMinor: number;
  currency: string;
  available: boolean;
  sellerName: string;
  fulfillerName?: string;
}): Readonly<Record<string, unknown>> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    image: input.imageUrls,
    brand: input.brand ? { "@type": "Brand", name: input.brand } : undefined,
    sku: input.sku,
    gtin: input.gtin,
    offers: {
      "@type": "Offer",
      url: input.url,
      priceCurrency: input.currency,
      price: (input.priceMinor / 100).toFixed(2),
      availability: input.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: input.sellerName }
    },
    additionalProperty: input.fulfillerName ? [{ "@type": "PropertyValue", name: "Local fulfilment partner", value: input.fulfillerName }] : undefined
  };
}

export function localBusinessStructuredData(input: {
  url: string;
  name: string;
  description?: string;
  address: { streetAddress: string; postalCode: string; addressLocality: string; addressCountry?: string };
  telephone?: string;
  imageUrls?: readonly string[];
}): Readonly<Record<string, unknown>> {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: input.name,
    url: input.url,
    description: input.description,
    telephone: input.telephone,
    image: input.imageUrls,
    address: { "@type": "PostalAddress", ...input.address, addressCountry: input.address.addressCountry ?? "GR" }
  };
}

export function articleStructuredData(input: { url: string; headline: string; description: string; datePublished: number; dateModified: number; authorName: string; publisherName: string }): Readonly<Record<string, unknown>> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    description: input.description,
    mainEntityOfPage: input.url,
    datePublished: new Date(input.datePublished).toISOString(),
    dateModified: new Date(input.dateModified).toISOString(),
    author: { "@type": "Organization", name: input.authorName },
    publisher: { "@type": "Organization", name: input.publisherName }
  };
}

export function breadcrumbStructuredData(items: readonly { name: string; url: string }[]): Readonly<Record<string, unknown>> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url }))
  };
}
