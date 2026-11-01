import { getPublishedGreekRetailResults } from "../../../../../lib/research-survey-release";
import { publicResultPoints } from "../../../../../lib/research-public-results-data";
import { pressKitHighlights, pressKitFactsCsv } from "../../../../../lib/research-press-kit";
import { renderResearchPressReleasePdf } from "../../../../../lib/research-press-kit-pdf";
import { renderResearchDetailedPressReleasePdf } from "../../../../../lib/research-press-kit-editorial-pdf";
import { pressKitFigureSvg } from "../../../../../lib/research-press-kit-graphic";
import { zipMediaFiles } from "../../../../../lib/research-press-kit-zip";
import { readMicrobusinessPressPdf } from "../../../../../lib/research-press-kit-microbusinesses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const published = await getPublishedGreekRetailResults("greek-retail-2026");
    if (!published) return new Response("Not published", { status: 404, headers: { "Cache-Control": "no-store" } });
    const figures = pressKitHighlights(publicResultPoints(published.estimates));
    if (!figures.length) return new Response("No public figures", { status: 404, headers: { "Cache-Control": "no-store" } });
    const [summaryPdf, detailedPdf, microEl, microEn] = await Promise.all([
      renderResearchPressReleasePdf(figures, published.publishedAt),
      renderResearchDetailedPressReleasePdf(),
      readMicrobusinessPressPdf("el"),
      readMicrobusinessPressPdf("en")
    ]);
    const archive = zipMediaFiles([
      { name: "PRESS-RELEASE-DETAILED-GR.pdf", data: detailedPdf },
      { name: "PRESS-RELEASE-SUMMARY-GR.pdf", data: summaryPdf },
      { name: "PRESS-RELEASE-MICROBUSINESSES-GR-2026.pdf", data: microEl },
      { name: "PRESS-RELEASE-MICROBUSINESSES-EN-2026.pdf", data: microEn },
      { name: "KEY-FIGURES.csv", data: pressKitFactsCsv(figures, published.releaseVersion) },
      ...figures.slice(0, 6).map((figure, i) => ({
        name: "FIGURE-" + String(i + 1).padStart(2, "0") + ".svg",
        data: pressKitFigureSvg(figure)
      })),
      { name: "README.txt", data:
        "KONTA MOY Research | Ελληνικό Λιανεμπόριο 2026\n" +
        "Δελτία Τύπου: αναλυτική, συνοπτική και νέα έκδοση για μικροεπιχειρήσεις σε ελληνικά/αγγλικά.\n" +
        "Πηγή: https://kontamou.site/research/greek-retail-2026/results\n" +
        "Μεθοδολογία: https://kontamou.site/research/greek-retail-2026/methodology\n" +
        "Επίσημο λογότυπο: https://kontamou.site/brand/kontamou-logo.svg\n" +
        "Εγκεκριμένα αποσπάσματα: https://kontamou.site/api/research/greek-retail-2026/voices-export\n" +
        "Αναφορά πηγής υποχρεωτική. Τα ποσοστά αφορούν εθελοντικές απαντήσεις, όχι απογραφή.\n" +
        "Γραφείο Τύπου: research@kontamou.site\n"
      }
    ]);
    return new Response(new Uint8Array(archive), { headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="KONTA-MOY-Greek-Retail-2026-Press-Kit.zip"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    } });
  } catch (error) {
    console.error("research_press_kit_zip_unavailable", error instanceof Error ? error.name : "UnknownError");
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
