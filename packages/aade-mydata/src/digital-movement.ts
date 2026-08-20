import { descendants, parseTransmissionResponse, parseXmlDocument, serializeXmlElement, type MyDataTransmissionResult } from "./index.ts";

export type ConfirmDeliveryReturnInput = Readonly<{
  qrUrl: string;
}>;

export type ConfirmDeliveryReturnResult = Readonly<{
  ok: boolean;
  deliveryReturnMark?: string;
  transmission: MyDataTransmissionResult;
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
  const parsed = parseVersion(specVersion);
  const minimum = [2, 0, 2] as const;
  if (!parsed || compareVersion(parsed, minimum) < 0) {
    throw new Error("ConfirmDeliveryReturn requires AADE myDATA spec 2.0.2 or newer");
  }
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
