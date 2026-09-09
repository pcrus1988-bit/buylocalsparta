const READ_ONLY_PUBLIC_CRAWLER_TOKENS = [
  "googlebot",
  "google-inspectiontool",
  "adsbot-google",
  "bingbot",
  "bingpreview",
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "applebot",
  "petalbot",
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "linkedinbot",
  "pinterestbot",
  "slackbot",
  "discordbot",
  "telegrambot",
  "whatsapp",
  "konta-mou-seo-monitor"
] as const;

/**
 * Search/social crawlers and KONTA MOY's own SEO monitor receive the stable,
 * read-only public rendering path. This classifier never grants privileged
 * access; it only prevents crawler requests from consuming personalised state.
 */
export function isReadOnlyPublicCrawlerUserAgent(userAgent: string | null | undefined): boolean {
  const normalized = userAgent?.trim().toLowerCase();
  return Boolean(normalized && READ_ONLY_PUBLIC_CRAWLER_TOKENS.some((token) => normalized.includes(token)));
}
