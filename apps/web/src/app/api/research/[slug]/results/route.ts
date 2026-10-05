import { getPublishedGreekRetailResults } from "../../../../../lib/research-survey-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await context.params;
  const slug = decodeURIComponent(rawSlug);
  if (slug !== "greek-retail-2026") {
    return Response.json({ error: "RESEARCH_STUDY_NOT_FOUND" }, { status: 404 });
  }
  const release = await getPublishedGreekRetailResults(slug);
  if (!release) {
    return Response.json({ error: "RESEARCH_RESULTS_NOT_PUBLISHED" }, {
      status: 404,
      headers: { "Cache-Control": "public, max-age=60" }
    });
  }
  return Response.json({
    schema: "kontamou.research.public-results.v1",
    studySlug: slug,
    ...release
  }, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600"
    }
  });
}
