import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CmsContentRenderer } from "../../components/CmsContentRenderer";
import { getPublicCmsSeo, isContentLocale } from "../../lib/public-cms";
import { getSeoGlobalSettingsSnapshot } from "../../lib/seo-settings";
import { publicContentDates } from "../../lib/public-seo-dates";

export const dynamic = "force-dynamic";

type CmsRouteProps = Readonly<{ params: Promise<{ cmsPath: string[] }> }>;

function routeParts(parts: readonly string[]) {
  const locale = parts[0];
  if (!isContentLocale(locale)) return undefined;
  return { locale, slug: parts.slice(1).join("/") };
}

export async function generateMetadata({ params }: CmsRouteProps): Promise<Metadata> {
  const resolvedRoute = routeParts((await params).cmsPath ?? []);
  if (!resolvedRoute) return {};
  const { settings } = await getSeoGlobalSettingsSnapshot();
  const resolved = await getPublicCmsSeo(resolvedRoute.locale, resolvedRoute.slug, settings.canonicalOrigin);
  if (!resolved) return {};
  const cmsAllowsIndexing = resolved.seo.robots === "index,follow";
  const index = settings.indexingEnabled && cmsAllowsIndexing;
  return {
    title: resolved.seo.title,
    description: resolved.seo.description,
    alternates: {
      canonical: resolved.seo.canonicalUrl,
      languages: resolved.seo.alternates
    },
    robots: { index, follow: true },
    openGraph: {
      title: resolved.seo.openGraph.title,
      description: resolved.seo.openGraph.description,
      url: resolved.seo.openGraph.url,
      images: resolved.seo.openGraph.image ? [resolved.seo.openGraph.image] : undefined,
      type: "website"
    }
  };
}

export default async function CmsPublicPage({ params }: CmsRouteProps) {
  const resolvedRoute = routeParts((await params).cmsPath ?? []);
  if (!resolvedRoute) notFound();
  const { settings } = await getSeoGlobalSettingsSnapshot();
  const resolved = await getPublicCmsSeo(resolvedRoute.locale, resolvedRoute.slug, settings.canonicalOrigin);
  if (!resolved) notFound();
  const dates = publicContentDates(resolved.page);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${resolved.seo.canonicalUrl}#webpage`,
    url: resolved.seo.canonicalUrl,
    name: resolved.translation.title,
    description: resolved.seo.description,
    inLanguage: resolvedRoute.locale === "el" ? "el-GR" : "en",
    isPartOf: { "@id": `${settings.canonicalOrigin}/#website` },
    publisher: { "@id": `${settings.canonicalOrigin}/#organization` },
    datePublished: dates.datePublished,
    dateModified: dates.dateModified
  };
  return <>
    {settings.indexingEnabled && resolved.seo.robots === "index,follow"
      ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }} />
      : null}
    <CmsContentRenderer translation={resolved.translation} locale={resolvedRoute.locale} dates={dates} />
  </>;
}
