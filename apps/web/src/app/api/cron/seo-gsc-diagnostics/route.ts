import { syncSeoGscDiagnostics } from "../../../../lib/seo-gsc-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const diagnostics = await syncSeoGscDiagnostics();
    const hasErrors = diagnostics.errors.length > 0;
    const payload = {
      event: "seo.gsc_diagnostics_run",
      inspected: diagnostics.inspected,
      pass: diagnostics.pass,
      neutral: diagnostics.neutral,
      fail: diagnostics.fail,
      unknown: diagnostics.unknown,
      blockedByMetaTag: diagnostics.blockedByMetaTag,
      canonicalMismatch: diagnostics.canonicalMismatch,
      history: diagnostics.history,
      errors: diagnostics.errors
    };
    if (hasErrors) console.error(JSON.stringify({ level: "error", ...payload }));
    else console.info(JSON.stringify({ level: "info", ...payload }));

    return Response.json(
      { ok: !hasErrors, diagnostics },
      { status: hasErrors ? 207 : 200, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "seo_gsc_diagnostics_failed";
    console.error(JSON.stringify({ level: "error", event: "seo.gsc_diagnostics_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
