/**
 * SEO timestamps must come from published content or an actual verification,
 * never from the request clock, catalogue refresh or a guessed launch date.
 */
type PublicContentDateSource = Readonly<{
  status: string;
  publishedAt?: number;
  scheduledAt?: number;
  updatedAt: number;
}>;

function epochIso(value: number | undefined, now: number): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  // Milliseconds since epoch; reject seconds, placeholders and future dates.
  if (value < Date.UTC(2000, 0, 1) || value > now + 5 * 60_000) return undefined;
  return new Date(value).toISOString();
}

export function publicContentDates(page: PublicContentDateSource, now = Date.now()): Readonly<{
  datePublished?: string;
  dateModified?: string;
}> {
  const release = page.publishedAt
    ?? (page.status === "scheduled" && typeof page.scheduledAt === "number" && page.scheduledAt <= now
      ? page.scheduledAt : undefined);
  const datePublished = epochIso(release, now);
  const lastEdit = epochIso(page.updatedAt, now);
  // A page published after its last draft edit is not publicly modified before publication.
  const dateModified = datePublished && lastEdit && lastEdit < datePublished
    ? datePublished
    : lastEdit;
  return { datePublished, dateModified };
}

/** A research source check or governed editorial review is NOT a content edit. */
export function publicLastReviewed(value: string | undefined, now = Date.now()): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return undefined;
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp) || stamp < Date.UTC(2000, 0, 1) || stamp > now + 5 * 60_000) return undefined;
  return new Date(stamp).toISOString();
}
