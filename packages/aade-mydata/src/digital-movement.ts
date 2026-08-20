import {
  childText,
  descendants,
  parseTransmissionResponse,
  parseXmlDocument,
  serializeXmlElement,
  type MyDataTransmissionResult,
  type XmlElement
} from "./index.ts";

export type ConfirmDeliveryReturnInput = Readonly<{
  qrUrl: string;
}>;

export type ConfirmDeliveryReturnResult = Readonly<{
  ok: boolean;
  deliveryReturnMark?: string;
  transmission: MyDataTransmissionResult;
  rawXml: string;
}>;

export type DeliveryNoteStatusQuery =
  | Readonly<{ mark: string; qrUrl?: never; issuerVatNumber?: string }>
  | Readonly<{ qrUrl: string; mark?: never; issuerVatNumber?: never }>;

export type DeliveryNoteLifecycleEvent = Readonly<{
  eventType?: string;
  eventTimestamp?: string;
  actorVat?: string;
  mark?: string;
  outcome?: string;
  deliveredWithoutRecipient?: boolean;
  rejectionReason?: string;
}>;

export type DeliveryNoteStatusResponse = Readonly<{
  invoiceMark?: string;
  status?: string;
  dispatchTimestamp?: string;
  lifecycleHistory: readonly DeliveryNoteLifecycleEvent[];
  rawXml: string;
}>;

export function buildConfirmDeliveryReturnXml(input: ConfirmDeliveryReturnInput): string {
  const qrUrl = validateDeliveryQrUrl(input.qrUrl);
  return `<?xml version="1.0" encoding="UTF-8"?>${serializeXmlElement({
    name: "ConfirmDeliveryReturnRequest",
    children: [{ name: "qrUrl", text: qrUrl }]
  })}`;
}

export function parseConfirmDeliveryReturnResponse(xml: string): ConfirmDeliveryReturnResult {
  const transmission = parseTransmissionResponse(xml);
  const document = parseXmlDocument(xml);
  const marks = descendants(document, "deliveryReturnMark")
    .map(node => node.text.trim())
    .filter(Boolean);
  const deliveryReturnMark = marks[0];
  if (deliveryReturnMark && !/^\d{1,40}$/.test(deliveryReturnMark)) {
    throw new Error("AADE ConfirmDeliveryReturn returned an invalid deliveryReturnMark");
  }
  if (marks.length > 1 && new Set(marks).size > 1) {
    throw new Error("AADE ConfirmDeliveryReturn returned conflicting deliveryReturnMark values");
  }
  return {
    ok: transmission.ok,
    deliveryReturnMark,
    transmission,
    rawXml: xml
  };
}

export function deliveryNoteStatusQuery(input: DeliveryNoteStatusQuery): string {
  const mark = typeof input.mark === "string" ? input.mark.trim() : "";
  const qrUrl = typeof input.qrUrl === "string" ? input.qrUrl.trim() : "";
  if (Boolean(mark) === Boolean(qrUrl)) throw new Error("Provide exactly one of delivery-note mark or qrUrl");

  const query = new URLSearchParams();
  if (mark) {
    if (!/^\d{1,40}$/.test(mark)) throw new Error("Delivery-note MARK must be numeric");
    query.set("mark", mark);
    const issuerVatNumber = input.issuerVatNumber?.trim();
    if (issuerVatNumber) {
      if (!/^\d{9}$/.test(issuerVatNumber)) throw new Error("Issuer VAT number must contain 9 digits");
      query.set("issuerVatNumber", issuerVatNumber);
    }
  } else {
    query.set("qrUrl", validateDeliveryQrUrl(qrUrl));
  }
  return query.toString();
}

export function parseDeliveryNoteStatusResponse(xml: string): DeliveryNoteStatusResponse {
  const document = parseXmlDocument(xml);
  const lifecycleHistory = descendants(document, "lifecycleHistory").map(parseLifecycleEvent);
  const invoiceMark = descendantOrRootChild(document, "invoiceMark");
  if (invoiceMark && !/^\d{1,40}$/.test(invoiceMark)) throw new Error("AADE delivery-note status returned an invalid invoiceMark");
  return {
    invoiceMark,
    status: descendantOrRootChild(document, "status"),
    dispatchTimestamp: descendantOrRootChild(document, "dispatchTimestamp"),
    lifecycleHistory,
    rawXml: xml
  };
}

export function validateDeliveryQrUrl(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error("Delivery QR URL is required");
  if (raw.length > 4096) throw new Error("Delivery QR URL is too long");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Delivery QR URL must be an absolute URL");
  }
  if (url.protocol !== "https:") throw new Error("Delivery QR URL must use HTTPS");
  if (url.username || url.password) throw new Error("Delivery QR URL must not contain embedded credentials");
  if (!url.hostname) throw new Error("Delivery QR URL must include a host");
  return url.toString();
}

export function assertMyDataSpecSupportsDeliveryReturn(specVersion: string): void {
  assertMyDataSpecAtLeast(specVersion, [2, 0, 2], "ConfirmDeliveryReturn requires AADE myDATA spec 2.0.2 or newer");
}

export function assertMyDataSpecSupportsQrDeliveryStatus(specVersion: string): void {
  assertMyDataSpecAtLeast(specVersion, [2, 0, 2], "GetDeliveryNoteStatus by qrUrl requires AADE myDATA spec 2.0.2 or newer");
}

function parseLifecycleEvent(node: XmlElement): DeliveryNoteLifecycleEvent {
  const outcomeDetails = node.children.find(child => child.localName === "outcomeDetails");
  const rejectionDetails = node.children.find(child => child.localName === "rejectionDetails");
  const deliveredWithoutRecipient = parseOptionalBoolean(outcomeDetails ? childText(outcomeDetails, "deliveredWithoutRecipient") : undefined);
  return {
    eventType: childText(node, "eventType"),
    eventTimestamp: childText(node, "eventTimestamp"),
    actorVat: childText(node, "actorVat"),
    mark: childText(node, "mark"),
    outcome: outcomeDetails ? childText(outcomeDetails, "outcome") : undefined,
    deliveredWithoutRecipient,
    rejectionReason: rejectionDetails ? childText(rejectionDetails, "reason") : undefined
  };
}

function descendantOrRootChild(document: XmlElement, name: string): string | undefined {
  return childText(document, name) ?? descendants(document, name)[0]?.text.trim() || undefined;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (/^(true|1)$/i.test(value)) return true;
  if (/^(false|0)$/i.test(value)) return false;
  return undefined;
}

function assertMyDataSpecAtLeast(specVersion: string, minimum: readonly [number, number, number], message: string): void {
  const parsed = parseVersion(specVersion);
  if (!parsed || compareVersion(parsed, minimum) < 0) throw new Error(message);
}

function parseVersion(value: string): readonly [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersion(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}
