/**
 * Review-only name matching between GEMI genitive Greek municipality labels and
 * the CC BY 4.0 English municipal-centre gazetteer.
 * A match is NEVER proof of a company's physical location or 25-km eligibility.
 */
export type GazetteerLabel = Readonly<{ id: string; name: string }>;
const greekToLatin: Readonly<Record<string, string>> = {
  Α: "A", Β: "V", Γ: "G", Δ: "D", Ε: "E", Ζ: "Z",
  Η: "I", Θ: "TH", Ι: "I", Κ: "K", Λ: "L", Μ: "M", Ν: "N",
  Ξ: "X", Ο: "O", Π: "P", Ρ: "R", Σ: "S", Τ: "T",
  Υ: "Y", Φ: "F", Χ: "CH", Ψ: "PS", Ω: "O"
};

export function normalizedMunicipalityLabel(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/ΟΥ/g, "OU").replace(/ΑΙ/g, "AI").replace(/ΕΙ/g, "I")
    .split("").map(char => greekToLatin[char] ?? char).join("")
    .replace(/[^A-Z0-9]+/g, "");
}

function unique<T extends GazetteerLabel>(values: readonly T[]): T[] {
  return [...new Map(values.map(item => [item.id, item])).values()];
}

/**
 * Exact normalized transliterations take precedence; common genitive-ending
 * variants only enter if no exact form matched. Ambiguous names stay unmatched.
 */
export function matchMunicipalityName<T extends GazetteerLabel>(
  municipality: string,
  byNormalizedLabel: ReadonlyMap<string, readonly T[]>
): Readonly<{ record: T; rule: "exact" | "genitive_variant" }> | undefined {
  const k = normalizedMunicipalityLabel(municipality);
  if (!k || k.length < 3) return undefined;
  const exactForms = [
    k, k.replace(/OU$/, "OS"), k.replace(/AS$/, "A"),
    k.replace(/ION$/, "IO"), k.replace(/EON$/, "ES"), k.replace(/ON$/, "A")
  ];
  const exactMatches = unique(exactForms.flatMap(v => byNormalizedLabel.get(v) ?? []));
  if (exactMatches.length === 1) return { record: exactMatches[0]!, rule: "exact" };
  if (exactMatches.length > 1) return undefined;

  const genitiveForms = [
    k.replace(/S$/, ""), k.replace(/OU$/, ""),
    k.replace(/IOU$/, "I"), k.replace(/IS$/, "I"),
    k.replace(/EON$/, "I"), k.replace(/AION$/, "A"),
    k.replace(/AIAN$/, "A"), k.replace(/ON$/, "ES")
  ];
  const options = unique(genitiveForms.filter(v => v && v !== k)
    .flatMap(v => byNormalizedLabel.get(v) ?? []));
  return options.length === 1 ? { record: options[0]!, rule: "genitive_variant" } : undefined;
}
