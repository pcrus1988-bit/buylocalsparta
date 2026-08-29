import type { OpenIcecatClientConfig, OpenIcecatProductDraft } from "./types.ts";
import { OPEN_ICECAT_GREEK_LOCALE, type GreekProductLocalizer } from "./types.ts";
import { applyVerifiedGreekLocalization } from "./localization.ts";
import { normalizeOpenIcecatGreekProduct, normalizeOpenIcecatSourceProduct } from "./product.ts";
import { asRecord, firstText, isValidGtin, normalizeGtin } from "./utils.ts";

const ICECAT_JSON_ENDPOINT = "https://live.icecat.biz/api";

export class OpenIcecatClient {
  readonly #username: string;
  readonly #apiToken: string;
  readonly #contentToken?: string;
  readonly #endpoint: string;
  readonly #fetch: NonNullable<OpenIcecatClientConfig["fetch"]>;
  readonly #requestTimeoutMs: number;

  constructor(config: OpenIcecatClientConfig) {
    this.#username = requiredSecret(config.username, "Icecat username");
    this.#apiToken = requiredSecret(config.apiToken, "Icecat API token");
    this.#contentToken = config.contentToken?.trim() || undefined;
    this.#endpoint = (config.endpoint?.trim() || ICECAT_JSON_ENDPOINT).replace(/\?+$/, "");
    this.#fetch = config.fetch ?? fetch;
    this.#requestTimeoutMs = config.requestTimeoutMs ?? 10_000;
    if (!Number.isSafeInteger(this.#requestTimeoutMs) || this.#requestTimeoutMs < 250 || this.#requestTimeoutMs > 60_000) {
      throw new Error("Icecat request timeout must be between 250 and 60000 ms");
    }
  }

  async lookupByGtin(
    inputGtin: string,
    options: Readonly<{ localize?: GreekProductLocalizer; minimumGreekScore?: number }> = {}
  ): Promise<OpenIcecatProductDraft> {
    const gtin = normalizeGtin(inputGtin);
    if (!isValidGtin(gtin)) throw new Error("GTIN checksum is invalid");

    const greekPayload = await this.#request(gtin, OPEN_ICECAT_GREEK_LOCALE);
    let draft = normalizeOpenIcecatGreekProduct(greekPayload, gtin, options.minimumGreekScore);
    if (draft.greekQuality.status === "READY" || !options.localize) return draft;

    const englishPayload = await this.#request(gtin, "EN");
    const source = normalizeOpenIcecatSourceProduct(englishPayload, gtin);
    const localized = await options.localize({
      gtin,
      brand: draft.brand ?? source.brand,
      brandPartCode: draft.brandPartCode ?? source.brandPartCode,
      sourceTitle: source.title,
      sourceDescription: source.description,
      sourceCategory: source.category,
      sourceSpecifications: source.specifications
    });
    draft = applyVerifiedGreekLocalization(draft, localized, options.minimumGreekScore, source.specifications);
    return draft;
  }

  async #request(gtin: string, locale: string): Promise<Record<string, unknown>> {
    const url = new URL(this.#endpoint);
    url.searchParams.set("lang", locale);
    url.searchParams.set("shopname", this.#username);
    url.searchParams.set("GTIN", gtin);
    url.searchParams.set("content", "");
    const headers: Record<string, string> = { accept: "application/json", "api-token": this.#apiToken };
    if (this.#contentToken) headers["content-token"] = this.#contentToken;

    const response = await this.#fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(this.#requestTimeoutMs)
    });
    const bodyText = await response.text();
    let payload: unknown;
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      throw new Error(`Icecat returned non-JSON content (${response.status})`);
    }
    if (!response.ok) throw new Error(icecatErrorMessage(payload, response.status));
    const record = asRecord(payload);
    const contentError = firstContentError(record);
    if (contentError) throw new Error(contentError);
    return record;
  }
}

function firstContentError(payload: Record<string, unknown>): string | undefined {
  const data = Object.keys(asRecord(payload.data)).length ? asRecord(payload.data) : payload;
  for (const candidate of [payload.ContentErrors, data.ContentErrors, payload.Errors, data.Errors]) {
    const text = firstText(candidate);
    if (text) return text;
    if (Array.isArray(candidate) && candidate.length) {
      const first = asRecord(candidate[0]);
      return firstText(first.Message, first.ErrorMessage, first.Description, candidate[0]) || "Icecat content error";
    }
    const record = asRecord(candidate);
    const nested = firstText(record.Message, record.ErrorMessage, record.Description, record.Error);
    if (nested) return nested;
  }
  return undefined;
}

function icecatErrorMessage(payload: unknown, status: number): string {
  return firstContentError(asRecord(payload)) ?? `Icecat request failed with HTTP ${status}`;
}

function requiredSecret(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
