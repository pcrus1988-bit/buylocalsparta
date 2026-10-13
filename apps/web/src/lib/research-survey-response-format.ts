/** Read-only formatting helpers for questionnaire answers and safe CSV output. */
const asText = (value: unknown): string => value == null ? "" : String(value);

function options(config: unknown, key: string): Map<string, string> {
  if (!config || typeof config !== "object" || Array.isArray(config)) return new Map();
  const value = (config as Record<string, unknown>)[key];
  return new Map(Array.isArray(value)
    ? value.filter((x): x is [string, string] => Array.isArray(x) && x.length >= 2)
      .map((x): [string, string] => [String(x[0]), String(x[1])])
    : []);
}

/** Friendly values from the exact questionnaire version; raw JSON remains unchanged. */
export function readableResearchAnswer(answer: unknown, config: unknown): string {
  const choices = options(config, "options");
  const rows = options(config, "items");
  const scale = options(config, "scale");
  const choice = (value: unknown) => choices.get(String(value)) ?? scale.get(String(value)) ?? String(value);
  if (answer == null) return "—";
  if (Array.isArray(answer)) return answer.map(choice).join(", ");
  if (typeof answer === "object") {
    return Object.entries(answer).map(([key, value]) =>
      (rows.get(key) ?? key) + ": " + choice(value)).join("\n");
  }
  return choice(answer);
}

/** Guard against CSV/spreadsheet formula execution, including whitespace-prefixed formulas. */
export function researchCsvCell(value: unknown): string {
  let text = asText(value);
  if (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

