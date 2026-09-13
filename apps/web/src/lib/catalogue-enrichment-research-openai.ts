import type { VerifiedProductFacts } from "./catalogue-enrichment";
import type { CatalogueProductIdentifiers,CatalogueResearchEligibility } from "./catalogue-enrichment-identifiers";

const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 35_000;
const RESEARCH_VERSION = "catalogue-public-research-v4";

export type CatalogueResearchSource = Readonly<{
  url: string;
  title: string | null;
  domain: string | null;
}>;

export type CatalogueResearchFact = Readonly<{
  category: string;
  value: string;
  sourceUrl: string;
}>;

export type CatalogueResearchIdentity = Readonly<{
  match: "exact" | "strong" | "weak" | "none" | "conflict";
  basis: string;
  matchedIdentifiers: readonly string[];
}>;

export type CataloguePublicResearchResult = Readonly<{
  status: "researched" | "insufficient" | "conflict";
  identity: CatalogueResearchIdentity;
  facts: readonly CatalogueResearchFact[];
  sources: readonly CatalogueResearchSource[];
  telemetry: Readonly<{
    provider: "openai_web_search";
    model: string;
    requestId: string | null;
    researchVersion: string;
  }>;
}>;

export type CatalogueResearchInput = Readonly<{
  eligibility: CatalogueResearchEligibility;
  identifiers: CatalogueProductIdentifiers;
  facts: VerifiedProductFacts;
  sourceTitle: string | null;
  sourceDescription: string | null;
}>;

export type OpenAiCatalogueResearchConfig = Readonly<{
  apiKey: string;
  model: string;
  baseUrl: string;
  requestTimeoutMs: number;
}>;

type FetchLike = typeof fetch;

const ALLOWED_FACT_CATEGORIES = new Set([
  "model","line","product_type","material","composition","color","dimensions","season","collection",
  "fit","cut","silhouette","closure","pockets","collar","neckline","sleeves","straps","handles",
  "print","motif","eyewear_spec","footwear_detail","bag_detail","design_detail","included_accessory"
]);

const RESEARCH_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    identity_match: { type: "string",enum: ["exact","strong","weak","none","conflict"] },
    identity_basis: { type: "string",maxLength: 300 },
    matched_identifiers: { type: "array",items: { type: "string",maxLength: 180 },maxItems: 12 },
    facts: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string",maxLength: 40 },
          value: { type: "string",maxLength: 500 },
          source_url: { type: "string",maxLength: 1500 }
        },
        required: ["category","value","source_url"]
      }
    }
  },
  required: ["identity_match","identity_basis","matched_identifiers","facts"]
});

const RESEARCH_INSTRUCTIONS = `You research product identity and factual merchandising evidence for KONTA MOY.

IDENTITY SAFETY
- Search the public web using the supplied exact query and identifiers.
- Prefer the brand/manufacturer product page. Reputable retailers or product databases may corroborate it.
- Never assume two products are the same because they look similar or share a generic title.
- exact: the same GTIN/EAN/UPC or exact manufacturer code is confirmed.
- strong: the same verified brand + model/style code is confirmed with no conflicting product attributes.
- weak/none: identity is not strong enough. Return no facts.
- conflict: sources disagree with the supplier identity or identifier. Return no facts.
- Never invent an identifier or source URL.

ALLOWED FACTS
Only return product-specific non-sensitive facts useful to a customer: official model/line, product type, material/composition, colour, dimensions, season/collection, fit/cut/silhouette, closure, pockets, collar/neckline, sleeves, straps/handles, print/motif, eyewear specifications, footwear details, bag construction details, design details, and included physical accessories.

FORBIDDEN FACTS
Never return price, discount, stock, availability, shipping/delivery claims, seller claims, authenticity/certification claims, warranty, reviews, rankings, or promotional language.
Every fact must name one source_url that you actually used during web search.
Return only the requested structured object.`;

export class OpenAiCatalogueResearcher {
  readonly #config: OpenAiCatalogueResearchConfig;
  readonly #fetch: FetchLike;

  constructor(config: OpenAiCatalogueResearchConfig,fetchImpl: FetchLike = fetch) {
    this.#config = config;
    this.#fetch = fetchImpl;
  }

  async research(input: CatalogueResearchInput): Promise<CataloguePublicResearchResult> {
    if (!input.eligibility.eligible || !input.eligibility.query) {
      return emptyResult("insufficient",input.eligibility.reason,this.#config.model);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),this.#config.requestTimeoutMs);
    try {
      const response = await this.#fetch(`${this.#config.baseUrl.replace(/\/$/,"")}/responses`,{
        method: "POST",
        headers: { Authorization: `Bearer ${this.#config.apiKey}`,"Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.#config.model,
          store: false,
          reasoning: { effort: "low" },
          max_output_tokens: 1400,
          tools: [{ type: "web_search" }],
          include: ["web_search_call.action.sources"],
          instructions: RESEARCH_INSTRUCTIONS,
          input: JSON.stringify({
            SEARCH_QUERY: input.eligibility.query,
            MATCH_STRENGTH_REQUIRED: input.eligibility.strength,
            IDENTIFIERS: input.identifiers,
            VERIFIED_FACTS: input.facts,
            SUPPLIER_TITLE: input.sourceTitle,
            SUPPLIER_DESCRIPTION: input.sourceDescription
          }),
          text: {
            format: {
              type: "json_schema",
              name: "konta_mou_catalogue_public_research",
              description: "Identity-verified public product evidence for catalogue enrichment.",
              strict: true,
              schema: RESEARCH_SCHEMA
            }
          }
        })
      });
      const rawText = await response.text();
      if (!response.ok) throw new Error(`OpenAI catalogue research failed (${response.status}): ${safeRemoteError(rawText)}`);
      const payload = parseJsonObject(rawText,"OpenAI research response");
      const generated = parseJsonObject(responseOutputText(payload),"OpenAI research structured output");
      const sources = responseWebSources(payload);
      return sanitizeResearchResult(generated,sources,input,payload,this.#config.model);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function openAiCatalogueResearchConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OpenAiCatalogueResearchConfig {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required when V4 catalogue research is enabled");
  return {
    apiKey,
    model: env.BLS_CATALOGUE_RESEARCH_MODEL?.trim() || env.BLS_CATALOGUE_AI_MODEL?.trim() || DEFAULT_MODEL,
    baseUrl: env.OPENAI_API_BASE_URL?.trim() || DEFAULT_BASE_URL,
    requestTimeoutMs: positiveInteger(env.BLS_CATALOGUE_RESEARCH_TIMEOUT_MS,DEFAULT_TIMEOUT_MS,"BLS_CATALOGUE_RESEARCH_TIMEOUT_MS")
  };
}

export const CATALOGUE_RESEARCH_VERSION = RESEARCH_VERSION;

function sanitizeResearchResult(
  generated: Record<string,unknown>,
  sources: readonly CatalogueResearchSource[],
  input: CatalogueResearchInput,
  payload: Record<string,unknown>,
  fallbackModel: string
): CataloguePublicResearchResult {
  const match = researchMatch(generated.identity_match);
  const basis = text(generated.identity_basis) ?? "unspecified";
  const matchedIdentifiers = stringArray(generated.matched_identifiers);
  const sourceUrls = new Set(sources.map((source) => canonicalUrl(source.url)));
  const identitySupported = match === "exact" || match === "strong"
    ? identityMatchesEligibility(input,matchedIdentifiers)
    : false;
  const acceptedMatch = identitySupported ? match : (match === "conflict" ? "conflict" : "weak");
  const facts = identitySupported ? researchFacts(generated.facts,sourceUrls) : [];
  const status = acceptedMatch === "conflict" ? "conflict" : (identitySupported && facts.length ? "researched" : "insufficient");
  return {
    status,
    identity: { match: acceptedMatch,basis,matchedIdentifiers },
    facts,
    sources: facts.length ? sources.filter((source) => facts.some((fact) => canonicalUrl(fact.sourceUrl) === canonicalUrl(source.url))) : [],
    telemetry: {
      provider: "openai_web_search",
      model: text(payload.model) ?? fallbackModel,
      requestId: text(payload.id),
      researchVersion: RESEARCH_VERSION
    }
  };
}

function identityMatchesEligibility(input: CatalogueResearchInput,matched: readonly string[]): boolean {
  const haystack = normalize(matched.join(" "));
  if (input.eligibility.strength === "gtin") return input.identifiers.gtins.some((gtin) => haystack.includes(normalize(gtin)));
  if (input.eligibility.strength === "mpn") {
    return [input.identifiers.mpn,input.identifiers.styleCode].filter(Boolean).some((value) => haystack.includes(normalize(String(value))));
  }
  if (input.eligibility.strength === "model") return Boolean(input.facts.model && haystack.includes(normalize(input.facts.model)));
  return false;
}

function researchFacts(value: unknown,sourceUrls: ReadonlySet<string>): CatalogueResearchFact[] {
  if (!Array.isArray(value)) return [];
  const output: CatalogueResearchFact[] = [];
  for (const item of value) {
    const row = record(item);
    const category = text(row.category)?.toLowerCase();
    const factValue = text(row.value);
    const sourceUrl = text(row.source_url);
    if (!category || !ALLOWED_FACT_CATEGORIES.has(category) || !factValue || !sourceUrl) continue;
    if (!sourceUrls.has(canonicalUrl(sourceUrl))) continue;
    if (containsForbiddenResearchClaim(factValue)) continue;
    output.push({ category,value: factValue,sourceUrl });
  }
  return output;
}

function containsForbiddenResearchClaim(value: string): boolean {
  const normalized = normalize(value);
  return ["price","discount","in stock","out of stock","shipping","delivery","authentic","certified","warranty","review","rating",
    "τιμή","έκπτωση","διαθέσιμο","αποστολή","παράδοση","αυθεντικ","πιστοποιημ","εγγύηση"].some((term) => normalized.includes(normalize(term)));
}

function responseWebSources(payload: Record<string,unknown>): CatalogueResearchSource[] {
  const output = Array.isArray(payload.output) ? payload.output : [];
  const sources: CatalogueResearchSource[] = [];
  for (const item of output) {
    const row = record(item);
    if (row.type !== "web_search_call") continue;
    const action = record(row.action);
    const rawSources = Array.isArray(action.sources) ? action.sources : [];
    for (const source of rawSources) {
      const sourceRow = record(source);
      const url = text(sourceRow.url);
      if (!url || !/^https?:\/\//i.test(url)) continue;
      const title = text(sourceRow.title);
      let domain: string | null = null;
      try { domain = new URL(url).hostname.replace(/^www\./,""); } catch { domain = null; }
      if (!sources.some((existing) => canonicalUrl(existing.url) === canonicalUrl(url))) sources.push({ url,title,domain });
    }
  }
  return sources;
}

function emptyResult(status: "insufficient" | "conflict",basis: string,model: string): CataloguePublicResearchResult {
  return {
    status,
    identity: { match: status === "conflict" ? "conflict" : "none",basis,matchedIdentifiers: [] },
    facts: [],sources: [],
    telemetry: { provider: "openai_web_search",model,requestId: null,researchVersion: RESEARCH_VERSION }
  };
}

function responseOutputText(payload: Record<string,unknown>): string {
  const direct = text(payload.output_text);
  if (direct) return direct;
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    const message = record(item);
    for (const part of Array.isArray(message.content) ? message.content : []) {
      const row = record(part);
      if (row.type === "output_text" && text(row.text)) return text(row.text)!;
    }
  }
  throw new Error("OpenAI catalogue research returned no structured text");
}

function parseJsonObject(value: string,label: string): Record<string,unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error(`${label} is not valid JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed as Record<string,unknown>;
}

function safeRemoteError(value: string): string {
  try {
    const payload = parseJsonObject(value,"remote error");
    return (text(record(payload.error).message) ?? text(payload.message) ?? "remote_error").slice(0,500);
  } catch { return value.replace(/\s+/g," ").slice(0,500); }
}

function researchMatch(value: unknown): CatalogueResearchIdentity["match"] {
  return ["exact","strong","weak","none","conflict"].includes(String(value)) ? String(value) as CatalogueResearchIdentity["match"] : "none";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((item): item is string => Boolean(item)).slice(0,12) : [];
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/,"");
  } catch { return value.trim(); }
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string,unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
}

function positiveInteger(raw: string | undefined,fallback: number,name: string): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
