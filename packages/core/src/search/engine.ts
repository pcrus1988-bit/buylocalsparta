import type { SearchDocument, SearchHit, SearchQuery } from "./types.ts";

const GREEK_TO_LATIN: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m",
  ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o"
};

const DIGRAPH_NORMALIZATIONS: readonly [RegExp, string][] = [
  [/αι/g, "e"], [/ει/g, "i"], [/οι/g, "i"], [/ου/g, "ou"], [/γγ/g, "ng"], [/γκ/g, "gk"], [/μπ/g, "b"], [/ντ/g, "d"], [/τσ/g, "ts"], [/τζ/g, "tz"]
];

export function normalizeSearchText(input: string): string {
  let value = input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("el-GR")
    .replace(/ς/g, "σ");
  for (const [pattern, replacement] of DIGRAPH_NORMALIZATIONS) value = value.replace(pattern, replacement);
  value = [...value].map((char) => GREEK_TO_LATIN[char] ?? char).join("");
  return value
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return normalizeSearchText(value).split(" ").filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = old;
    }
  }
  return previous[b.length];
}

function fuzzyTokenMatch(queryToken: string, docToken: string): number {
  if (queryToken === docToken) return 1;
  if (docToken.startsWith(queryToken) || queryToken.startsWith(docToken)) return 0.85;
  const maxLength = Math.max(queryToken.length, docToken.length);
  if (maxLength < 4) return 0;
  const distance = levenshtein(queryToken, docToken);
  const similarity = 1 - distance / maxLength;
  return similarity >= 0.72 ? similarity * 0.75 : 0;
}

export class LocalSearchEngine {
  readonly #documents = new Map<string, SearchDocument>();

  upsert(document: SearchDocument): void {
    if (!document.id.trim() || !document.title.trim()) throw new Error("Search document requires id and title");
    this.#documents.set(document.id, structuredClone(document));
  }

  remove(id: string): void {
    this.#documents.delete(id);
  }

  document(id: string): SearchDocument | undefined {
    const document = this.#documents.get(id);
    return document ? structuredClone(document) : undefined;
  }

  documents(): readonly SearchDocument[] {
    return [...this.#documents.values()].map((document) => structuredClone(document));
  }

  search(query: SearchQuery): readonly SearchHit[] {
    const limit = Math.min(100, Math.max(1, query.limit ?? 24));
    const normalizedQuery = normalizeSearchText(query.q);
    const queryTokens = tokens(query.q);

    const hits: SearchHit[] = [];
    for (const document of this.#documents.values()) {
      if (document.marketId !== query.marketId) continue;
      if (query.type && query.type !== "all" && document.type !== query.type) continue;
      if (query.availability === "in_stock" && !document.available) continue;
      if (query.availability === "pickup_today" && !document.pickupToday) continue;
      if (query.adviceOnly && !document.adviceAvailable) continue;
      if (query.minPriceMinor !== undefined && (document.priceMinor === undefined || document.priceMinor < query.minPriceMinor)) continue;
      if (query.maxPriceMinor !== undefined && (document.priceMinor === undefined || document.priceMinor > query.maxPriceMinor)) continue;
      if (query.categoryCode && !document.categoryCodes?.includes(query.categoryCode)) continue;
      if (query.attributeFilters) {
        const attributes = document.attributes ?? {};
        let matchesAttributes = true;
        for (const [code, expected] of Object.entries(query.attributeFilters)) {
          const actual = attributes[code];
          const requested = Array.isArray(expected) ? expected : [expected];
          if (!actual || !requested.some((value) => actual.split("|").includes(String(value)))) { matchesAttributes = false; break; }
        }
        if (!matchesAttributes) continue;
      }

      const reasons: string[] = [];
      let score = 0;
      const identifierFields = document.identifiers ?? [];
      const normalizedIdentifiers = identifierFields.map(normalizeSearchText);
      if (normalizedQuery && normalizedIdentifiers.includes(normalizedQuery)) {
        score += 100;
        reasons.push("exact_identifier");
      }

      const title = normalizeSearchText([document.title, document.titleEl, document.titleEn].filter(Boolean).join(" "));
      const brandModel = normalizeSearchText([document.brand, document.model].filter(Boolean).join(" "));
      const synonymText = normalizeSearchText((document.synonyms ?? []).join(" "));
      const body = normalizeSearchText(document.body ?? "");

      if (normalizedQuery && title === normalizedQuery) {
        score += 60;
        reasons.push("exact_title");
      } else if (normalizedQuery && title.includes(normalizedQuery)) {
        score += 38;
        reasons.push("title_phrase");
      }
      if (normalizedQuery && brandModel.includes(normalizedQuery)) {
        score += 32;
        reasons.push("brand_model");
      }
      if (normalizedQuery && synonymText.includes(normalizedQuery)) {
        score += 20;
        reasons.push("synonym");
      }

      const weightedTokenFields = [
        { tokens: tokens(title), weight: 16, reason: "title_token" },
        { tokens: tokens(brandModel), weight: 14, reason: "brand_model_token" },
        { tokens: tokens(synonymText), weight: 10, reason: "synonym_token" },
        { tokens: tokens(body), weight: 4, reason: "body_token" }
      ];
      for (const queryToken of queryTokens) {
        let best = 0;
        let reason = "";
        for (const field of weightedTokenFields) {
          for (const docToken of field.tokens) {
            const match = fuzzyTokenMatch(queryToken, docToken) * field.weight;
            if (match > best) {
              best = match;
              reason = field.reason;
            }
          }
        }
        if (best > 0) {
          score += best;
          if (!reasons.includes(reason)) reasons.push(reason);
        }
      }

      // Availability/advice are secondary ranking signals, never a substitute for textual relevance.
      // A non-empty query with no lexical/identifier match must remain a genuine zero-result query.
      if (normalizedQuery && score <= 0) continue;
      if (!normalizedQuery) score += 1;
      if (document.available) score += 2;
      if (document.pickupToday) score += 1.5;
      if (document.adviceAvailable) score += 1;
      if (score > 0) hits.push({ document: structuredClone(document), score, reasons });
    }

    return hits
      .sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title, "el"))
      .slice(0, limit);
  }

  autocomplete(input: { marketId: string; q: string; limit?: number }): readonly string[] {
    const q = normalizeSearchText(input.q);
    if (!q) return [];
    const candidates = new Map<string, number>();
    for (const document of this.#documents.values()) {
      if (document.marketId !== input.marketId) continue;
      for (const value of [document.title, document.brand, document.model, ...(document.synonyms ?? [])]) {
        if (!value) continue;
        const normalized = normalizeSearchText(value);
        if (normalized.startsWith(q)) candidates.set(value, Math.max(candidates.get(value) ?? 0, 2));
        else if (normalized.includes(q)) candidates.set(value, Math.max(candidates.get(value) ?? 0, 1));
      }
    }
    return [...candidates.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "el"))
      .slice(0, Math.min(20, Math.max(1, input.limit ?? 8)))
      .map(([value]) => value);
  }
}
