const SPARTA_TIME_ZONE = "Europe/Athens";

const spartaFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: SPARTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

function spartaOffsetMs(instant: Date): number {
  const parts = Object.fromEntries(
    spartaFormatter
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return localAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * HTML datetime-local controls submit a wall-clock time without a timezone.
 * Agreements belong to the Sparta market, so interpret those values in
 * Europe/Athens rather than in the Vercel server's UTC timezone.
 * Values that already contain an explicit offset or Z are left unchanged.
 */
export function normalizeSpartaLocalDateTime(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const raw = value.trim();
  if (!raw || /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return raw;

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(raw);
  if (!match) return raw;

  const [, year, month, day, hour, minute, second = "0", fraction = "0"] = match;
  const milliseconds = Number(fraction.padEnd(3, "0"));
  const wallClockAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds
  );

  let offset = spartaOffsetMs(new Date(wallClockAsUtc));
  let instant = new Date(wallClockAsUtc - offset);
  const correctedOffset = spartaOffsetMs(instant);
  if (correctedOffset !== offset) {
    offset = correctedOffset;
    instant = new Date(wallClockAsUtc - offset);
  }
  return instant.toISOString();
}
