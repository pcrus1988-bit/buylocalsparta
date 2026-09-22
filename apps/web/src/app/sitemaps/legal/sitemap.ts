import type { MetadataRoute } from "next";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { settings } = await getSeoGlobalSettingsSnapshot();
  if (!settings.indexingEnabled || !settings.sitemap.staticPages) return [];

  const origin = settings.canonicalOrigin;
  return [
    {
      url: new URL("/terms", `${origin}/`).toString(),
      changeFrequency: "monthly",
      priority: 0.5
    }
  ];
}
