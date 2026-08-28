const DEFAULT_MAX_RENDERED_TITLE_LENGTH = 68;
const MINIMUM_ENTITY_TITLE_LENGTH = 24;

/**
 * Keep generated entity titles within a conservative search-result length while
 * accounting for the site's configured `%s` title-template overhead.
 *
 * Explicit SEO overrides remain untouched elsewhere; this helper is for generated
 * defaults where we can safely shorten a long entity name without inventing copy.
 */
export function fitSeoTitleToTemplate(
  value: string,
  titleTemplate: string,
  maxRenderedLength = DEFAULT_MAX_RENDERED_TITLE_LENGTH
): string {
  const title = value.trim().replace(/\s+/g, " ");
  if (!title) return title;

  const templateOverhead = titleTemplate.includes("%s")
    ? titleTemplate.replace("%s", "").length
    : titleTemplate.length;
  const available = Math.max(MINIMUM_ENTITY_TITLE_LENGTH, maxRenderedLength - templateOverhead);
  if (title.length <= available) return title;

  const candidate = title.slice(0, available + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const bounded = lastSpace >= Math.floor(available * 0.62)
    ? candidate.slice(0, lastSpace)
    : title.slice(0, available);

  return bounded.trim().replace(/[\s·|,;:–—-]+$/u, "");
}
