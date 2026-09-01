import type { OpenIcecatClientConfig, OpenIcecatProductDraft } from "./types.ts";
import { OPEN_ICECAT_GREEK_LOCALE, type GreekProductLocalizer } from "./types.ts";
import { applyVerifiedGreekLocalization } from "./localization.ts";
import { normalizeOpenIcecatGreekProduct, normalizeOpenIcecatSourceProduct } from "./product.ts";
import { asRecord, firstText, isValidGtin, normalizeGtin } from "./utils.ts";

const ICECAT_JSON_ENDPOINT = "https://live.icecat.biz/api";

export type OpenIcecatErrorDisposition = "retry" | "skip" | "fatal";

export class OpenIcecatRequestError extends Error {
  readonly disposition: OpenIcecatErrorDisposition;
  readonly status: number | undefined;

  constructor(message: string, options: Readonly<{ disposition: OpenIcecatErrorDisposition; status?: number }>) {
    super(message);
    this.name = "OpenIcecatRequestError";
    this.disposition = options.disposition;
    this.status = options.status;
  }
}

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
    options: Readonly<{ localize?: GreekProductLocalizer; minimumGreekScore?: number; signal?: AbortSignal }> = {}
  ): Promise<OpenIcecatProductDraft> {
    const gtin = normalizeGtin(inputGtin);
    if (!isValidGtin(gtin)) throw new Error("GTIN checksum is invalid");

    const greekPayload = await this.#request(gtin, OPEN_ICECAT_GREEK_LOCALE, options.signal);
    let draft = normalizeOpenIcecatGreekProduct(greekPayload, gtin, options.minimumGreekScore);
    if (draft.greekQuality.status === "READY" || !options.localize) return draft;

    const englishPayload = await this.#request(gtin, "EN", options.signal);
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

  async #request(gtin: string, locale: string, externalSignal?: AbortSignal): Promise<Record<string, unknown>> {
    const url = new URL(this.#endpoint);
    url.searchParams.set("lang", locale);
    url.searchParams.set("shopname", this.#username);
    url.searchParams.set("GTIN", gtin);
    url.searchParams.set("content", "");
    const headers: Record<string, string> = { accept: "application/json", "api-token": this.#apiToken };
    if (this.#contentToken) headers["content-token"] = this.#contentToken;
    const timeoutSignal = AbortSignal.timeout(this.#requestTimeoutMs);
    const signal = externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal;

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "GET",
        redirect: "error",
        headers,
        signal
      });
    } catch (error) {
      if (externalSignal?.aborted) throw error;
      throw new OpenIcecatRequestError(
        `Icecat request failed before a response was received: ${errorMessage(error)}`,
        { disposition: "retry" }
      );
    }

    let bodyText: string;
    try {
      bodyText = await response.text();
    } catch (error) {
      if (externalSignal?.aborted) throw error;
      throw new OpenIcecatRequestError(
        `Icecat response body could not be read: ${errorMessage(error)}`,
        { disposition: "retry", status: response.status }
      );
    }

    let payload: unknown;
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      throw new OpenIcecatRequestError(`Icecat returned non-JSON content (${response.status})`, {
        disposition: response.ok ? "retry" : dispositionForHttpStatus(response.status),
        status: response.status
      });
    }

    if (!response.ok) {
      throw new OpenIcecatRequestError(icecatErrorMessage(payload, response.status), {
        disposition: dispositionForHttpStatus(response.status),
        status: response.status
      });
    }

    const record = asRecord(payload);
    const contentError = firstContentError(record);
    if (contentError) {
      throw new OpenIcecatRequestError(contentError, { disposition: dispositionForContentError(contentError), status: response.status });
    }
    return record;
  }
}

function dispositionForHttpStatus(status: number): OpenIcecatErrorDisposition {
  if (status === 401 || status === 403) return "fatal";
  if (status === 408 || status === 425 || status === 429 || status >= 500) return "retry";
  return "skip";
}

function dispositionForContentError(message: string): OpenIcecatErrorDisposition {
  const normalized = message.toLowerCase();
  const fatalSignals = [
    "unauthorized",
    "forbidden",
    "access denied",
    "api token",
    "api-token",
    "content token",
    "content-token",
    "credential"
  ];
  if (fatalSignals.some((signal) => normalized.includes(signal))) return "fatal";

  const permanentProductSignals = [
    "not found",
    "does not exist",
    "no product",
    "invalid gtin",
    "invalid ean",
    "unknown gtin",
    "unknown ean"
  ];
  if (permanentProductSignals.some((signal) => normalized.includes(signal))) return "skip";

  // Unknown 2xx content errors are kept retryable. This is intentionally conservative:
  // only explicit product-missing/invalid signals may permanently skip a source revision.
  return "retry";
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requiredSecret(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
