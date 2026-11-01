import { MICROBUSINESS_PRESS_FILES, readMicrobusinessPressPdf } from "../../../../../lib/research-press-kit-microbusinesses";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
/** Public download of the unchanged owner-supplied document. */
export async function GET() {
  try {
    const bytes = await readMicrobusinessPressPdf("el");
    return new Response(bytes, { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="' + MICROBUSINESS_PRESS_FILES.el.filename + '"',
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff"
    }});
  } catch (error) {
    console.error("research_microbusiness_press_pdf_unavailable", error instanceof Error ? error.name : "UnknownError");
    return new Response("Unavailable", {status:503, headers:{"Cache-Control":"no-store"}});
  }
}
