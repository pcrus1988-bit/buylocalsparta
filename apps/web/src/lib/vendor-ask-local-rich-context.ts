import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { vendorScope } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";

export type VendorAskLocalRichContext = Readonly<{
  id: string;
  referenceNumber: string;
  status: string;
  need: string;
  quantity: number;
  postcode?: string;
  messages: ReadonlyArray<Readonly<{ id: string; senderType: string; body: string; imageDataUrl?: string; createdAt: number }>>;
  voiceTranscript?: string;
  barcode?: string;
  referenceImageDataUrl?: string;
  captureSource?: string;
  createdAt: number;
}>;

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requestMessages(source: Record<string, unknown>) {
  const raw = Array.isArray(source.clarificationMessages) ? source.clarificationMessages : [];
  return raw.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const id = optionalText(item.id);
    const senderType = optionalText(item.senderType);
    const body = optionalText(item.body);
    const createdAt = Number(item.createdAt);
    if (!id || !senderType || !body || !Number.isFinite(createdAt)) return [];
    return [{
      id,
      senderType,
      body,
      imageDataUrl: optionalText(item.imageDataUrl),
      createdAt
    }];
  }).slice(-40);
}

function metadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
  }
  return {};
}

export async function vendorAskLocalRichContext(principal: SessionPrincipal): Promise<readonly VendorAskLocalRichContext[]> {
  if (!postgresVendorRuntimeEnabled() || !principal.vendorId) return [];
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 3_000 });
  return uow.withTransaction(vendorScope(principal.userId, principal.vendorId), async (tx) => {
    const result = await tx.query<SqlRow>(`SELECT cr.public_id,cr.reference_number,cr.status::text,cr.source_metadata,cr.requested_quantity,cr.postcode,cr.created_at
      FROM counteroffer_requests cr
      JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
      WHERE v.public_id=$1
        AND cr.status::text IN ('assigned','awaiting_vendor','needs_info','offered')
      ORDER BY cr.created_at DESC
      LIMIT 100`, [principal.vendorId]);
    return result.rows.map((row) => {
      const source = metadata(row.source_metadata);
      return {
        id: String(row.public_id),
        referenceNumber: optionalText(row.reference_number) ?? String(row.public_id),
        status: String(row.status),
        need: optionalText(source.need) ?? "Local request",
        quantity: Number(row.requested_quantity ?? 1),
        postcode: optionalText(row.postcode),
        messages: requestMessages(source),
        voiceTranscript: optionalText(source.voiceTranscript),
        barcode: optionalText(source.barcode),
        referenceImageDataUrl: optionalText(source.referenceImageDataUrl),
        captureSource: optionalText(source.captureSource),
        createdAt: new Date(String(row.created_at)).getTime()
      };
    });
  }, { readOnly: true });
}
