import {
  AadeMyDataClient as BaseAadeMyDataClient,
  decodeAadeXmlEnvelope,
  MyDataTransportError,
  parseTransmissionResponse,
  retryAfterDelayMs,
  type MyDataConfig,
  type MyDataFetch,
  type MyDataTransmissionResult
} from "./index.ts";
import { assertClassificationXmlPreflight } from "./classification-preflight.ts";
import {
  reconcileDeliveryReturnFromStatus,
  type DeliveryReturnReconciliation
} from "./delivery-return-reconciliation.ts";
import {
  assertMyDataSpecSupportsDeliveryReturn,
  assertMyDataSpecSupportsQrDeliveryStatus,
  buildConfirmDeliveryReturnXml,
  deliveryNoteStatusQuery,
  parseConfirmDeliveryReturnResponse,
  parseDeliveryNoteStatusResponse,
  type ConfirmDeliveryReturnInput,
  type ConfirmDeliveryReturnResult,
  type DeliveryNoteStatusQuery,
  type DeliveryNoteStatusResponse
} from "./digital-movement.ts";
import { groupQrDetailsQuery, parseGroupQrDetailsResponse, type GroupQrDetailsResponse } from "./group-qr.ts";
import { assertInvoiceElementOrder } from "./order-preflight.ts";
import { assertPaymentMethodsXmlPreflight } from "./payment-method-preflight.ts";
import { assertInvoiceXmlPreflight } from "./preflight.ts";
import {
  parseE3InfoResponse,
  parseVatInfoResponse,
  type MyDataE3InfoRecord,
  type MyDataE3InfoResponse,
  type MyDataReportingCollection,
  type MyDataVatInfoRecord,
  type MyDataVatInfoResponse
} from "./reporting.ts";

export type MyDataReportingQuery = Readonly<{
  dateFrom: string;
  dateTo: string;
  entityVatNumber?: string;
  groupedPerDay?: boolean;
  nextPartitionKey?: string;
  nextRowKey?: string;
}>;

export type MyDataReportingCollectionOptions = Readonly<{
  maxPages?: number;
}>;

export class HardenedAadeMyDataClient extends BaseAadeMyDataClient {
  readonly #extendedConfig: MyDataConfig;
  readonly #extendedFetch: MyDataFetch;

  constructor(config: MyDataConfig, fetchFn: MyDataFetch = fetch) {
    super(config, fetchFn);
    this.#extendedConfig = config;
    this.#extendedFetch = fetchFn;
  }

  override async sendInvoices(xml: string): Promise<MyDataTransmissionResult> {
    assertInvoiceXmlPreflight(xml);
    assertInvoiceElementOrder(xml);
    assertClassificationXmlPreflight(xml);
    return super.sendInvoices(xml);
  }

  async sendPaymentsMethod(xml: string): Promise<MyDataTransmissionResult> {
    assertPaymentMethodsXmlPreflight(xml);
    return parseTransmissionResponse(await this.#extendedRequest("SendPaymentsMethod", { method: "POST", body: xml }));
  }

  async requestGroupQrDetails(groupId: string): Promise<GroupQrDetailsResponse> {
    const query = groupQrDetailsQuery(groupId);
    const responseXml = decodeAadeXmlEnvelope(await this.#extendedRequest(`RequestGroupQRDetails?${query}`, { method: "GET" })).xml;
    return parseGroupQrDetailsResponse(responseXml);
  }

  async getDeliveryNoteStatus(input: DeliveryNoteStatusQuery): Promise<DeliveryNoteStatusResponse> {
    if (typeof input.qrUrl === "string") assertMyDataSpecSupportsQrDeliveryStatus(this.#extendedConfig.specVersion);
    const query = deliveryNoteStatusQuery(input);
    const responseXml = decodeAadeXmlEnvelope(await this.#extendedRequest(`GetDeliveryNoteStatus?${query}`, { method: "GET" })).xml;
    return parseDeliveryNoteStatusResponse(responseXml);
  }

  async reconcileDeliveryReturn(qrUrl: string): Promise<DeliveryReturnReconciliation> {
    const status = await this.getDeliveryNoteStatus({ qrUrl });
    return reconcileDeliveryReturnFromStatus(status);
  }

  async confirmDeliveryReturn(input: ConfirmDeliveryReturnInput): Promise<ConfirmDeliveryReturnResult> {
    assertMyDataSpecSupportsDeliveryReturn(this.#extendedConfig.specVersion);
    const requestXml = buildConfirmDeliveryReturnXml(input);
    const responseXml = decodeAadeXmlEnvelope(await this.#extendedRequest("ConfirmDeliveryReturn", { method: "POST", body: requestXml })).xml;
    return parseConfirmDeliveryReturnResponse(responseXml);
  }

  async requestVatInfo(input: MyDataReportingQuery): Promise<string> {
    return decodeAadeXmlEnvelope(await this.#extendedRequest(`RequestVatInfo?${reportingQuery(input)}`, { method: "GET" })).xml;
  }

  async requestVatInfoParsed(input: MyDataReportingQuery): Promise<MyDataVatInfoResponse> {
    return parseVatInfoResponse(await this.requestVatInfo(input));
  }

  async requestVatInfoAll(input: MyDataReportingQuery, options: MyDataReportingCollectionOptions = {}): Promise<MyDataReportingCollection<MyDataVatInfoRecord>> {
    const maxPages = reportingPageLimit(options.maxPages);
    const records: MyDataVatInfoRecord[] = [];
    const seen = new Set<string>();
    let queryInput: MyDataReportingQuery = { ...input };
    let continuation: MyDataVatInfoResponse["continuation"];

    for (let page = 1; page <= maxPages; page += 1) {
      const response = await this.requestVatInfoParsed(queryInput);
      records.push(...response.records);
      continuation = response.continuation;
      if (!continuation) return { records, pages: page, complete: true };
      const token = continuationKey(continuation);
      if (seen.has(token)) throw new Error("AADE RequestVatInfo repeated a continuation token; reporting collection stopped to prevent an infinite loop");
      seen.add(token);
      if (page === maxPages) return { records, pages: page, complete: false, continuation };
      queryInput = { ...input, nextPartitionKey: continuation.nextPartitionKey, nextRowKey: continuation.nextRowKey };
    }

    return { records, pages: 0, complete: true };
  }

  async requestE3Info(input: MyDataReportingQuery): Promise<string> {
    return decodeAadeXmlEnvelope(await this.#extendedRequest(`RequestE3Info?${reportingQuery(input)}`, { method: "GET" })).xml;
  }

  async requestE3InfoParsed(input: MyDataReportingQuery): Promise<MyDataE3InfoResponse> {
    return parseE3InfoResponse(await this.requestE3Info(input));
  }

  async requestE3InfoAll(input: MyDataReportingQuery, options: MyDataReportingCollectionOptions = {}): Promise<MyDataReportingCollection<MyDataE3InfoRecord>> {
    const maxPages = reportingPageLimit(options.maxPages);
    const records: MyDataE3InfoRecord[] = [];
    const seen = new Set<string>();
    let queryInput: MyDataReportingQuery = { ...input };
    let continuation: MyDataE3InfoResponse["continuation"];

    for (let page = 1; page <= maxPages; page += 1) {
      const response = await this.requestE3InfoParsed(queryInput);
      records.push(...response.records);
      continuation = response.continuation;
      if (!continuation) return { records, pages: page, complete: true };
      const token = continuationKey(continuation);
      if (seen.has(token)) throw new Error("AADE RequestE3Info repeated a continuation token; reporting collection stopped to prevent an infinite loop");
      seen.add(token);
      if (page === maxPages) return { records, pages: page, complete: false, continuation };
      queryInput = { ...input, nextPartitionKey: continuation.nextPartitionKey, nextRowKey: continuation.nextRowKey };
    }

    return { records, pages: 0, complete: true };
  }

  async #extendedRequest(path: string, init: RequestInit): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#extendedConfig.requestTimeoutMs);
    try {
      const response = await this.#extendedFetch(`${this.#extendedConfig.baseUrl}/${path}`, {
        ...init,
        headers: {
          "aade-user-id": this.#extendedConfig.userId,
          "Ocp-Apim-Subscription-Key": this.#extendedConfig.subscriptionKey,
          accept: "application/xml, text/xml",
          ...(init.body ? { "content-type": "application/xml; charset=utf-8" } : {}),
          ...(init.headers ?? {})
        },
        signal: controller.signal
      });
      const body = await response.text();
      if (!response.ok) {
        const summary = redact(`${compact(body).slice(0, 500) || response.statusText}`, this.#extendedConfig);
        throw new MyDataTransportError("http", `AADE myDATA HTTP ${response.status}: ${summary}`, {
          retryable: retryableStatus(response.status),
          httpStatus: response.status,
          retryAfterMs: retryAfterDelayMs(response.headers.get("retry-after"))
        });
      }
      if (!body.trim()) throw new MyDataTransportError("http", "AADE myDATA returned an empty response", { retryable: true, httpStatus: response.status });
      return body;
    } catch (error) {
      if (error instanceof MyDataTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new MyDataTransportError("timeout", "AADE myDATA request timed out", { retryable: true, cause: error });
      }
      const message = redact(error instanceof Error ? error.message : String(error), this.#extendedConfig);
      throw new MyDataTransportError("network", `AADE myDATA network error: ${message}`, { retryable: true, cause: error });
    } finally {
      clearTimeout(timer);
    }
  }
}

function reportingQuery(input: MyDataReportingQuery): string {
  assertAadeDate(input.dateFrom, "dateFrom");
  assertAadeDate(input.dateTo, "dateTo");
  if (aadeDateValue(input.dateFrom) > aadeDateValue(input.dateTo)) throw new Error("dateFrom must be on or before dateTo");
  const q = new URLSearchParams({ dateFrom: input.dateFrom.trim(), dateTo: input.dateTo.trim() });
  if (input.entityVatNumber?.trim()) q.set("entityVatNumber", input.entityVatNumber.trim());
  if (input.groupedPerDay !== undefined) q.set("GroupedPerDay", input.groupedPerDay ? "true" : "false");
  if (input.nextPartitionKey?.trim()) q.set("nextPartitionKey", input.nextPartitionKey.trim());
  if (input.nextRowKey?.trim()) q.set("nextRowKey", input.nextRowKey.trim());
  return q.toString();
}

function reportingPageLimit(value: number | undefined): number {
  if (value === undefined) return 25;
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) throw new Error("myDATA reporting maxPages must be an integer between 1 and 100");
  return value;
}

function continuationKey(value: Readonly<{ nextPartitionKey?: string; nextRowKey?: string }>): string {
  const partition = value.nextPartitionKey?.trim() ?? "";
  const row = value.nextRowKey?.trim() ?? "";
  if (!partition && !row) throw new Error("AADE reporting continuation token is empty");
  return `${partition}\u0000${row}`;
}

function assertAadeDate(value: string, label: string): void {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) throw new Error(`${label} must use AADE format dd/MM/yyyy`);
  const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`${label} must be a real calendar date`);
}
function aadeDateValue(value: string): number { const [day,month,year]=value.trim().split("/").map(Number);return Date.UTC(year!,month!-1,day!); }
function retryableStatus(status: number): boolean { return status === 408 || status === 425 || status === 429 || status >= 500; }
function compact(value: string): string { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function redact(value: string, config: MyDataConfig): string {
  let output = value;
  for (const secret of [config.userId, config.subscriptionKey]) if (secret) output = output.split(secret).join("[REDACTED]");
  return output.replace(/(aade-user-id|ocp-apim-subscription-key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
}
