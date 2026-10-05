import { getPublishedGreekRetailReleaseArtifact } from "../../../../../lib/research-survey-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await context.params;
  const slug = decodeURIComponent(rawSlug);
  if (slug !== "greek-retail-2026") {
    return Response.json({ error: "RESEARCH_STUDY_NOT_FOUND" }, { status: 404 });
  }

  const release = await getPublishedGreekRetailReleaseArtifact(slug);
  if (!release) {
    return Response.json({ error: "RESEARCH_RESULTS_NOT_PUBLISHED" }, {
      status: 404,
      headers: { "Cache-Control": "public, max-age=60" }
    });
  }
  if (!release.integrityOk) {
    return Response.json({ error: "RESEARCH_RELEASE_INTEGRITY_MISMATCH" }, {
      status: 500,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const filename = `kontamou-${slug}-${release.artifact.releaseVersion}.json`;
  return new Response(release.canonicalJson, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "ETag": `"${release.artifactSha256}"`,
      "X-Konta-Mou-Artifact-SHA256": release.artifactSha256
    }
  });
}
