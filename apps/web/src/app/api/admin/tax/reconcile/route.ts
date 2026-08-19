import { adminRecordTimologioDocument } from "../../../../../lib/admin-tax-runtime";
import { requireAdminSession } from "../../../../../lib/admin-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true });
    const body = await request.json() as Record<string, unknown>;
    const documentId = required(body.documentId, "documentId", 128);
    const documentNumber = required(body.documentNumber, "documentNumber", 120);
    const aadeMark = required(body.aadeMark, "aadeMark", 40);
    const issueDate = required(body.issueDate, "issueDate", 10);
    const aadeUid = optional(body.aadeUid, 160);
    const qrUrl = optional(body.qrUrl, 2000);
    const result = await adminRecordTimologioDocument(principal, { documentId, documentNumber, aadeMark, issueDate, aadeUid, qrUrl });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "timologio_reconciliation_failed" }, { status: 400 });
  }
}

function required(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${label} is required`);
  return value.trim();
}
function optional(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = value.trim();
  if (parsed.length > max) throw new Error("Field exceeds maximum length");
  return parsed;
}
