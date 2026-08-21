import { submitAccessibilityReport } from "../../../../lib/accessibility-governance";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (String(body.website ?? "").trim()) return Response.json({ ok: true }, { status: 201 });
    const result = await submitAccessibilityReport({
      pagePath: body.pagePath,
      barrier: body.barrier,
      expected: body.expected,
      assistiveTechnology: body.assistiveTechnology,
      browserContext: body.browserContext,
      contactEmail: body.contactEmail,
      consentToContact: body.consentToContact
    });
    return Response.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "accessibility_report_failed" }, { status: 400 });
  }
}
