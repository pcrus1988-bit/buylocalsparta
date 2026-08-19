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

const PRODUCTION_BASE_URL = "https://mydatapi.aade.gr/myDATA";
const TEST_BASE_URL = "https://mydataapidev.aade.gr";
const CURRENT_SPEC_VERSION = "2.0.2";

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
  const specVersion = env.AADE_MYDATA_SPEC_VERSION?.trim() || CURRENT_SPEC_VERSION;
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
  constructor(config: MyDataConfig, fetchFn: MyDataFetch = fetch) { this.#config = config; this.#fetch = fetchFn; }
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
      if (!response.ok) throw new Error(`AADE myDATA HTTP ${response.status}: ${compactXml(body).slice(0, 500) || response.statusText}`);
      if (!body.trim()) throw new Error("AADE myDATA returned an empty response");
      return body;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("AADE myDATA request timed out");
      throw error;
    } finally { clearTimeout(timer); }
  }
}

export function parseTransmissionResponse(xml: string): MyDataTransmissionResult {
  const blocks = [...xml.matchAll(/<(?:\w+:)?response\b[^>]*>([\s\S]*?)<\/(?:\w+:)?response>/gi)].map(m => m[1]);
  const candidates = blocks.length ? blocks : [xml];
  const items = candidates.map((block): MyDataResponseItem => {
    const errors = [...block.matchAll(/<(?:\w+:)?error\b[^>]*>([\s\S]*?)<\/(?:\w+:)?error>/gi)].map(match => ({
      code: tag(match[1], "code"),
      message: tag(match[1], "message") ?? (compactXml(match[1]) || "Unknown AADE error")
    }));
    const statusCode = tag(block, "statusCode") ?? (errors.length ? "Error" : "Success");
    return {
      index: numberOrUndefined(tag(block, "index")),
      statusCode,
      invoiceMark: tag(block, "invoiceMark"),
      invoiceUid: tag(block, "invoiceUid"),
      authenticationCode: tag(block, "authenticationCode"),
      cancellationMark: tag(block, "cancellationMark"),
      qrUrl: tag(block, "qrUrl") ?? tag(block, "qrCodeUrl"),
      errors
    };
  });
  return { ok: items.length > 0 && items.every(item => /^success$/i.test(item.statusCode) && item.errors.length === 0), items, rawXml: xml };
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function required(env: NodeJS.ProcessEnv, name: string): string { const value = env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; }
function positiveInt(raw: string | undefined, fallback: number, name: string): number { if (!raw?.trim()) return fallback; const n = Number(raw); if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`); return n; }
function assertXml(xml: string, expectedHint: string): void { if (!xml.trim().startsWith("<")) throw new Error(`myDATA ${expectedHint} payload must be XML`); if (/<!DOCTYPE/i.test(xml)) throw new Error("DOCTYPE is not allowed in myDATA XML payloads"); }
function assertNumericId(value: string, label: string): void { if (!/^\d{1,40}$/.test(value)) throw new Error(`${label} must be numeric`); }
function validateDocumentQuery(input: MyDataDocumentQuery): void {
  assertNumericId(input.mark, "AADE MARK cursor");
  if (input.maxMark?.trim()) assertNumericId(input.maxMark.trim(), "AADE maxMark");
  if (input.dateFrom?.trim()) assertMyDataDate(input.dateFrom.trim(), "dateFrom");
  if (input.dateTo?.trim()) assertMyDataDate(input.dateTo.trim(), "dateTo");
}
function assertMyDataDate(value: string, label: string): void { if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) throw new Error(`${label} must use AADE format dd/MM/yyyy`); }
function tag(xml: string, name: string): string | undefined { const m = xml.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, "i")); return m ? decodeXml(m[1].trim()) : undefined; }
function decodeXml(value: string): string { return value.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'\"').replace(/&apos;/g,"'").replace(/&amp;/g,"&"); }
function compactXml(value: string): string { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function numberOrUndefined(value: string | undefined): number | undefined { if (value == null || value === "") return undefined; const n = Number(value); return Number.isSafeInteger(n) ? n : undefined; }
function query(input: Record<string, string | undefined>): string { const q = new URLSearchParams(); for (const [k,v] of Object.entries(input)) if (v?.trim()) q.set(k,v.trim()); return q.toString(); }
