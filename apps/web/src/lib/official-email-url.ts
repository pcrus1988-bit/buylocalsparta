/**
 * Authoritative base URL for KONTA MOY transactional and operational email.
 *
 * Emails must never inherit Vercel's production/preview aliases: multiple
 * domains may be attached to the project, and the first one is not necessarily
 * the customer-facing KONTA MOY domain.
 */
export const KONTA_MOY_EMAIL_BASE_URL = "https://kontamou.site" as const;
