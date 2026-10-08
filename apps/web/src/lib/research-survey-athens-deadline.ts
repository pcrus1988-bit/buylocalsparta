/** Convert survey deadlines without depending on the administrator's browser timezone. */
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});

function athensInput(date: Date): string {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function isoToAthensDeadlineInput(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? athensInput(date) : "";
}

/** Reject DST gaps and ambiguous repeated clock times instead of silently shifting deadlines. */
export function athensDeadlineInputToIso(input: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input);
  if (!match) throw new Error("RESEARCH_ATHENS_DEADLINE_INVALID");
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  if (year < 2000 || year > 2100 || month < 1 || month > 12 ||
      day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new Error("RESEARCH_ATHENS_DEADLINE_INVALID");
  }
  const clockTime = Date.UTC(year, month - 1, day, hour, minute);
  const matches = [120, 180]
    .map((offsetMinutes) => new Date(clockTime - offsetMinutes * 60_000))
    .filter((date) => athensInput(date) === input);
  if (matches.length !== 1) throw new Error("RESEARCH_ATHENS_DEADLINE_AMBIGUOUS_OR_NONEXISTENT");
  return matches[0]!.toISOString();
}
