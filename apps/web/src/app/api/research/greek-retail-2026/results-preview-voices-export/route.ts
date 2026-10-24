import {getAdminSession} from "../../../../lib/admin-session";
import {hasAdminPermission} from "../../../../lib/admin-runtime";
import {rawResearchAnswerAccess} from "../../../../lib/research-survey-response-admin";
import {createInternalResearchVoicesPdf} from "../../../../lib/research-voices-private-export";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

/** Confidential bulk Q18 export: identical authorization boundary as raw-answer admin explorer. */
export async function GET(){
  const principal=await getAdminSession();
  if(!principal||!hasAdminPermission(principal,"research.read")
      ||!rawResearchAnswerAccess(principal)){
    return new Response("Not found",{status:404,
      headers:{"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"}});
  }
  try{
    const pdf=await createInternalResearchVoicesPdf(principal);
    return new Response(new Uint8Array(pdf),{headers:{
      "Content-Type":"application/pdf",
      "Content-Disposition":'attachment; filename="KONTA-MOY-Research-Q18-INTERNAL.pdf"',
      "Cache-Control":"private, no-store, max-age=0",
      "X-Robots-Tag":"noindex, nofollow, noarchive",
      "X-Content-Type-Options":"nosniff"
    }});
  }catch(error){
    console.error("research_internal_voices_pdf_failed",error instanceof Error?error.name:"UnknownError");
    const code=error instanceof Error?error.message:"";
    return new Response("Confidential PDF unavailable",{status:code==="RESEARCH_VOICES_EXPORT_TOO_LARGE"?413:503,
      headers:{"Cache-Control":"private, no-store"}});
  }
}
