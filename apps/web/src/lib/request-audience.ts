import { headers } from "next/headers";

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
  "whatsapp"
] as const;

/**
 * Public search/social crawlers must never consume Fair Vendor Assignment state.
 * This classification is deliberately used only to select a read-only public
 * rendering path; it does not grant access, bypass authentication or influence
 * checkout/transaction authorization.
 */
export function isReadOnlyPublicCrawlerUserAgent(userAgent: string | null | undefined): boolean {
  const normalized = userAgent?.trim().toLowerCase();
  return Boolean(normalized && READ_ONLY_PUBLIC_CRAWLER_TOKENS.some((token) => normalized.includes(token)));
}

export async function isReadOnlyPublicCrawlerRequest(): Promise<boolean> {
  const requestHeaders = await headers();
  return isReadOnlyPublicCrawlerUserAgent(requestHeaders.get("user-agent"));
}
