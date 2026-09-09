import { headers } from "next/headers";
import { isReadOnlyPublicCrawlerUserAgent } from "./public-crawler";

export { isReadOnlyPublicCrawlerUserAgent } from "./public-crawler";

/**
 * Public search/social crawlers must never consume Fair Vendor Assignment state.
 * This classification is deliberately used only to select a read-only public
 * rendering path; it does not grant access, bypass authentication or influence
 * checkout/transaction authorization.
 */
export async function isReadOnlyPublicCrawlerRequest(): Promise<boolean> {
  const requestHeaders = await headers();
  return isReadOnlyPublicCrawlerUserAgent(requestHeaders.get("user-agent"));
}
