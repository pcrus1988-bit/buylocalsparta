import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CmsContentRenderer } from "../../components/CmsContentRenderer";
import { getPublicCmsPage, getPublicCmsSeo, isContentLocale } from "../../lib/public-cms";
import { getSeoGlobalSettingsSnapshot } from "../../lib/seo-settings";

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
  const resolved = await getPublicCmsPage(resolvedRoute.locale, resolvedRoute.slug);
  if (!resolved) notFound();
  return <CmsContentRenderer translation={resolved.translation} locale={resolvedRoute.locale} />;
}
