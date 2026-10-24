import {getPublishedGreekRetailResults} from "../../../../lib/research-survey-release";
import {publicVoiceDataFromRelease} from "../../../../lib/research-public-voices-data";
import {renderResearchVoicesPdf} from "../../../../lib/research-voice-pdf";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

/** Public PDF contains only separately privacy-reviewed and approved release quotes. */
export async function GET(){
  try {
    const release=await getPublishedGreekRetailResults("greek-retail-2026");
    const data=release?publicVoiceDataFromRelease(release.methodology.q18PublicVoices):undefined;
    if(!data || !data.quotes.length)return new Response("Not available",{status:404,
      headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex"}});
    const pdf=await renderResearchVoicesPdf({
      answers:data.quotes.map(item=>({text:item.text,categories:[item.category]})),
      categories:data.categories,internal:false,taxonomyVersion:"editorially-approved-release"
    });
    return new Response(new Uint8Array(pdf),{headers:{
      "Content-Type":"application/pdf",
      "Content-Disposition":'attachment; filename="KONTA-MOY-Research-Voices-2026.pdf"',
      "Cache-Control":"public, no-store, max-age=0",
      "X-Content-Type-Options":"nosniff"
    }});
  }catch(error){
    console.error("research_public_voices_pdf_failed",error instanceof Error?error.name:"UnknownError");
    return new Response("PDF unavailable",{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
