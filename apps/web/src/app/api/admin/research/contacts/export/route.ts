import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { researchMarketingContactDirectory } from "../../../../../../lib/research-survey-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export async function GET(request: Request) {
  const principal = await getAdminSession();
  if (!principal) return new Response("Unauthorized", { status: 401 });
  if (!hasAdminPermission(principal, "research.privacy.manage")) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const studySlug = url.searchParams.get("study")?.trim() ?? "";
  if (!studySlug) return new Response("Study is required", { status: 400 });

  try {
    const directory = await researchMarketingContactDirectory(principal, {
      studySlug,
      status: "opted_in",
      limit: 50000
    });
    const header = ["Company","Email","Marketing status","Consent recorded","Consent version","Consent source"];
    const lines = [
      header.map(csvCell).join(","),
      ...directory.contacts.map((contact) => [
        contact.companyName,
        contact.email,
        "opted_in",
        contact.consentRecordedAt ?? "",
        contact.consentVersion ?? "",
        contact.consentSource ?? ""
      ].map(csvCell).join(","))
    ];
    const date = new Date().toISOString().slice(0, 10);
    return new Response("\uFEFF" + lines.join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="research-marketing-opt-ins-' + studySlug.replace(/[^a-z0-9_-]+/gi, "-") + "-" + date + '.csv"',
        "Cache-Control": "private, no-store, max-age=0"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_MARKETING_EXPORT_FAILED";
    return Response.json({ error: message }, {
      status: message.includes("NOT_FOUND") ? 404 : 500,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
