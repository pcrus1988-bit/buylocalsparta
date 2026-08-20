import {
  childText,
  descendants,
  escapeXml,
  parseXmlDocument,
  textContent
} from "./xml.ts";

export {
  childElements,
  childText,
  decodeXml,
  descendantText,
  descendants,
  escapeXml,
  parseXmlDocument,
  serializeXmlElement,
  textContent,
  type XmlElement,
  type XmlElementSpec
} from "./xml.ts";

export type MyDataEnvironment = "test" | "production";
export type MyDataFetch = typeof fetch;

export type MyDataConfig = Readonly<{
  environment: MyDataEnvironment;
  baseUrl: string;
  userId: string;
  subscriptionKey: string;
  requestTimeoutMs: number;
  specVersion: string;
}>;

export type MyDataError = Readonly<{ code?: string; message: string }>;
export type MyDataResponseItem = Readonly<{
  index?: number;
  statusCode: string;
  invoiceMark?: string;
  invoiceUid?: string;
  authenticationCode?: string;
  cancellationMark?: string;
  qrUrl?: string;
  errors: readonly MyDataError[];
}>;

export type MyDataTransmissionResult = Readonly<{
  ok: boolean;
  items: readonly MyDataResponseItem[];
  rawXml: string;
}>;

export type MyDataDocumentQuery = Readonly<{
  mark: string;
  dateFrom?: string;
  dateTo?: string;
  entityVatNumber?: string;
  counterVatNumber?: string;
  invType?: string;
  maxMark?: string;
  nextPartitionKey?: string;
  nextRowKey?: string;
}>;

export type MyDataBookQuery = Readonly<{
  dateFrom: string;
  dateTo: string;
  counterVatNumber?: string;
  entityVatNumber?: string;
  invType?: string;
  nextPartitionKey?: string;
  nextRowKey?: string;
}>;

export type MyDataResponseKind =
  | "success"
  | "validation_error"
  | "technical_error"
  | "xml_error"
  | "authentication_error"
  | "unknown_error";

export type MyDataTransportErrorKind = "http" | "timeout" | "network";

export class MyDataTransportError extends Error {
  readonly kind: MyDataTransportErrorKind;
  readonly retryable: boolean;
  readonly httpStatus?: number;

  constructor(kind: MyDataTransportErrorKind, message: string, options?: { retryable?: boolean; httpStatus?: number; cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "MyDataTransportError";
    this.kind = kind;
    this.retryable = options?.retryable ?? false;
    this.httpStatus = options?.httpStatus;
  }
}

const PRODUCTION_BASE_URL = "https://mydatapi.aade.gr/myDATA";
const TEST_BASE_URL = "https://mydataapidev.aade.gr";
export const CURRENT_MYDATA_SPEC_VERSION = "2.0.2";

export function myDataConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.AADE_MYDATA_USER_ID?.trim() && env.AADE_MYDATA_SUBSCRIPTION_KEY?.trim());
}

export function myDataIssuanceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BLS_MYDATA_ISSUANCE_ENABLED === "true";
}

export function myDataConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MyDataConfig {
  const environment: MyDataEnvironment = env.AADE_MYDATA_ENVIRONMENT === "production"
    ? "production"
    : env.AADE_MYDATA_ENVIRONMENT === "test"
      ? "test"
      : (() => { throw new Error("AADE_MYDATA_ENVIRONMENT must be test or production"); })();
  const userId = required(env, "AADE_MYDATA_USER_ID");
  const subscriptionKey = required(env, "AADE_MYDATA_SUBSCRIPTION_KEY");
  const explicitBase = env.AADE_MYDATA_BASE_URL?.trim();
  const baseUrl = explicitBase || (environment === "production" ? PRODUCTION_BASE_URL : TEST_BASE_URL);
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("AADE_MYDATA_BASE_URL must be HTTPS");
  const specVersion = env.AADE_MYDATA_SPEC_VERSION?.trim() || CURRENT_MYDATA_SPEC_VERSION;
  return {
    environment,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    userId,
    subscriptionKey,
    requestTimeoutMs: positiveInt(env.AADE_MYDATA_REQUEST_TIMEOUT_MS, 15_000, "AADE_MYDATA_REQUEST_TIMEOUT_MS"),
    specVersion
  };
}

export class AadeMyDataClient {
  readonly #config: MyDataConfig;
  readonly #fetch: MyDataFetch;

  constructor(config: MyDataConfig, fetchFn: MyDataFetch = fetch) {
    this.#config = config;
    this.#fetch = fetchFn;
  }

  get environment(): MyDataEnvironment { return this.#config.environment; }
  get specVersion(): string { return this.#config.specVersion; }

  async sendInvoices(xml: string): Promise<MyDataTransmissionResult> {
    assertXml(xml, "InvoicesDoc");
    return parseTransmissionResponse(await this.#request("SendInvoices", { method: "POST", body: xml }));
  }

  async sendIncomeClassification(xml: string): Promise<MyDataTransmissionResult> {
    assertXml(xml, "InvoiceIncomeClassification");
    return parseTransmissionResponse(await this.#request("SendIncomeClassification", { method: "POST", body: xml }));
  }

  async sendExpensesClassification(xml: string): Promise<MyDataTransmissionResult> {
    assertXml(xml, "InvoiceExpensesClassification");
    return parseTransmissionResponse(await this.#request("SendExpensesClassification", { method: "POST", body: xml }));
  }

  async cancelInvoice(mark: string, entityVatNumber?: string): Promise<MyDataTransmissionResult> {
    assertNumericId(mark, "AADE MARK");
    const q = new URLSearchParams({ mark });
    if (entityVatNumber?.trim()) q.set("entityVatNumber", entityVatNumber.trim());
    return parseTransmissionResponse(await this.#request(`CancelInvoice?${q}`, { method: "POST" }));
  }

  async requestTransmittedDocs(input: MyDataDocumentQuery): Promise<string> {
    validateDocumentQuery(input);
    return this.#request(`RequestTransmittedDocs?${query(input)}`, { method: "GET" });
  }

  async requestDocs(input: MyDataDocumentQuery): Promise<string> {
    validateDocumentQuery(input);
    return this.#request(`RequestDocs?${query(input)}`, { method: "GET" });
  }

  async requestMyIncome(input: MyDataBookQuery): Promise<string> {
    validateBookQuery(input);
    return this.#request(`RequestMyIncome?${query(input)}`, { method: "GET" });
  }

  async requestMyExpenses(input: MyDataBookQuery): Promise<string> {
    validateBookQuery(input);
    return this.#request(`RequestMyExpenses?${query(input)}`, { method: "GET" });
  }

  async #request(path: string, init: RequestInit): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs);
    try {
      const response = await this.#fetch(`${this.#config.baseUrl}/${path}`, {
        ...init,
        headers: {
          "aade-user-id": this.#config.userId,
          "Ocp-Apim-Subscription-Key": this.#config.subscriptionKey,
          accept: "application/xml, text/xml",
          ...(init.body ? { "content-type": "application/xml; charset=utf-8" } : {}),
          ...(init.headers ?? {})
        },
        signal: controller.signal
      });
      const body = await response.text();
      if (!response.ok) {
        const detail = redactSecrets(compactXml(body).slice(0, 500) || response.statusText, this.#config);
        throw new MyDataTransportError("http", `AADE myDATA HTTP ${response.status}: ${detail}`, {
          httpStatus: response.status,
          retryable: isRetryableHttpStatus(response.status)
        });
      }
      if (!body.trim()) throw new MyDataTransportError("network", "AADE myDATA returned an empty response", { retryable: true });
      return body;
    } catch (error) {
      if (error instanceof MyDataTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new MyDataTransportError("timeout", "AADE myDATA request timed out", { retryable: true, cause: error });
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new MyDataTransportError("network", `AADE myDATA network error: ${redactSecrets(message, this.#config)}`, {
        retryable: true,
        cause: error
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

export function parseTransmissionResponse(xml: string): MyDataTransmissionResult {
  const document = parseXmlDocument(xml);
  const responseNodes = document.localName === "response" ? [document] : [...descendants(document, "response")];
  const candidates = responseNodes.length ? responseNodes : [document];
  const items = candidates.map((response): MyDataResponseItem => {
    const errors = descendants(response, "error").map(error => ({
      code: childText(error, "code"),
      message: childText(error, "message") ?? (textContent(error).trim() || "Unknown AADE error")
    }));
    const statusCode = childText(response, "statusCode") ?? (errors.length ? "Error" : "Success");
    return {
      index: numberOrUndefined(childText(response, "index")),
      statusCode,
      invoiceMark: childText(response, "invoiceMark"),
      invoiceUid: childText(response, "invoiceUid"),
      authenticationCode: childText(response, "authenticationCode"),
      cancellationMark: childText(response, "cancellationMark"),
      qrUrl: childText(response, "qrUrl") ?? childText(response, "qrCodeUrl"),
      errors
    };
  });
  return {
    ok: items.length > 0 && items.every(item => classifyMyDataResponse(item) === "success"),
    items,
    rawXml: xml
  };
}

export function classifyMyDataResponse(item: MyDataResponseItem): MyDataResponseKind {
  const status = item.statusCode.trim().toLowerCase();
  if (status === "success" && item.errors.length === 0) return "success";
  if (status.includes("validation")) return "validation_error";
  if (status.includes("xml")) return "xml_error";
  if (status.includes("technical")) return "technical_error";
  if (looksLikeAuthenticationError(item)) return "authentication_error";
  return "unknown_error";
}

export function isRetryableMyDataResponse(item: MyDataResponseItem): boolean {
  return classifyMyDataResponse(item) === "technical_error";
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

function assertXml(xml: string, expectedHint: string): void {
  try {
    parseXmlDocument(xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`myDATA ${expectedHint} payload must be well-formed XML: ${message}`);
  }
}

function assertNumericId(value: string, label: string): void {
  if (!/^\d{1,40}$/.test(value)) throw new Error(`${label} must be numeric`);
}

function validateDocumentQuery(input: MyDataDocumentQuery): void {
  assertNumericId(input.mark, "AADE MARK cursor");
  if (input.maxMark?.trim()) assertNumericId(input.maxMark.trim(), "AADE maxMark");
  if (input.dateFrom?.trim()) assertMyDataDate(input.dateFrom.trim(), "dateFrom");
  if (input.dateTo?.trim()) assertMyDataDate(input.dateTo.trim(), "dateTo");
  validateDateOrder(input.dateFrom, input.dateTo);
}

function validateBookQuery(input: MyDataBookQuery): void {
  assertMyDataDate(input.dateFrom.trim(), "dateFrom");
  assertMyDataDate(input.dateTo.trim(), "dateTo");
  validateDateOrder(input.dateFrom, input.dateTo);
}

function assertMyDataDate(value: string, label: string): void {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) throw new Error(`${label} must use AADE format dd/MM/yyyy`);
  const [dayRaw, monthRaw, yearRaw] = value.split("/");
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${label} must be a real calendar date in AADE format dd/MM/yyyy`);
  }
}

function validateDateOrder(dateFrom?: string, dateTo?: string): void {
  if (!dateFrom?.trim() || !dateTo?.trim()) return;
  if (myDataDateKey(dateFrom) > myDataDateKey(dateTo)) throw new Error("dateFrom must not be after dateTo");
}

function myDataDateKey(value: string): number {
  const [day, month, year] = value.split("/").map(Number);
  return (year ?? 0) * 10_000 + (month ?? 0) * 100 + (day ?? 0);
}

function numberOrUndefined(value: string | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : undefined;
}

function query(input: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value?.trim()) q.set(key, value.trim());
  return q.toString();
}

function compactXml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function looksLikeAuthenticationError(item: MyDataResponseItem): boolean {
  const combined = [item.statusCode, ...item.errors.flatMap(error => [error.code ?? "", error.message])].join(" ").toLowerCase();
  return /auth|credential|subscription|unauthor|forbidden|access denied|user.?id/.test(combined);
}

function redactSecrets(value: string, config: MyDataConfig): string {
  let redacted = value;
  for (const secret of [config.userId, config.subscriptionKey]) {
    if (secret) redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted
    .replace(/(ocp-apim-subscription-key|aade-user-id)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/subscription\s*key\s*[:=]\s*[^\s,;]+/gi, "subscription key=[REDACTED]");
}
