import { descendantText, descendants, parseXmlDocument } from "./index.ts";
import { validateDeliveryQrUrl } from "./digital-movement.ts";

export type GroupQrDetailsResponse = Readonly<{
  groupId?: string;
  qrUrls: readonly string[];
  qrUrlsCount: number;
  groupQrCreatorVatNumber?: string;
  createdAt?: string;
  expiresAt?: string;
  statusCode?: string;
  message?: string;
  rawXml: string;
}>;

export function groupQrDetailsQuery(groupId: string): string {
  const value = groupId.trim();
  if (!value) throw new Error("Group QR ID is required");
  if (value.length > 1024) throw new Error("Group QR ID is too long");
  return new URLSearchParams({ groupId: value }).toString();
}

export function parseGroupQrDetailsResponse(xml: string): GroupQrDetailsResponse {
  const document = parseXmlDocument(xml);
  const qrUrls = descendants(document, "qrUrl").map(node => validateDeliveryQrUrl(node.text.trim()));
  const declaredCount = integerOrUndefined(descendantText(document, "qrUrlsCount"));
  if (declaredCount !== undefined && declaredCount !== qrUrls.length) {
    throw new Error(`AADE group QR response count mismatch: declared ${declaredCount}, received ${qrUrls.length}`);
  }
  return {
    groupId: descendantText(document, "groupId"),
    qrUrls,
    qrUrlsCount: declaredCount ?? qrUrls.length,
    groupQrCreatorVatNumber: descendantText(document, "groupQrCreatorVatNumber"),
    createdAt: descendantText(document, "createdAt"),
    expiresAt: descendantText(document, "expiresAt"),
    statusCode: descendantText(document, "statusCode"),
    message: descendantText(document, "message"),
    rawXml: xml
  };
}

function integerOrUndefined(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("AADE group QR response contains an invalid qrUrlsCount");
  return parsed;
}
