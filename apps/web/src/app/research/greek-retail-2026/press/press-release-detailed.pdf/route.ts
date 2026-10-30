import { getPublishedGreekRetailResults } from "../../../../../lib/research-survey-release";
import { renderResearchDetailedPressReleasePdf } from "../../../../../lib/research-press-kit-editorial-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Public export is blocked unless the verified published study is accessible. */
export async function GET(){
  try{
    const published = await getPublishedGreekRetailResults("greek-retail-2026");
    if(!published) return new Response("Not published",{status:404,headers:{"Cache-Control":"no-store"}});
    const pdf=await renderResearchDetailedPressReleasePdf();
    return new Response(new Uint8Array(pdf),{headers:{
      "Content-Type":"application/pdf",
      "Content-Disposition":'attachment; filename="KONTA-MOY-Greek-Retail-2026-Detailed-Press-Release.pdf"',
      "Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff"
    }});
  }catch(error){
    console.error("research_detailed_press_pdf_unavailable",error instanceof Error?error.name:"UnknownError");
    return new Response("Unavailable",{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
