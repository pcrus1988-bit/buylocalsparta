import { getAdminSession } from "../../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../../lib/admin-runtime";
import { rawResearchAnswerAccess } from "../../../../../lib/research-survey-response-admin";
import { getLiveGreekRetailVoices } from "../../../../../lib/research-live-voices-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const principal = await getAdminSession();
  if (!principal || !hasAdminPermission(principal,"research.read")
      || !rawResearchAnswerAccess(principal)) {
    return Response.json({error:"NOT_FOUND"},{
      status:404,headers:{"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"}
    });
  }
  try {
    const snapshot = await getLiveGreekRetailVoices(principal);
    return Response.json({schema:"kontamou.research.q18-internal-live-preview.v1",...snapshot},{
      headers:{"Cache-Control":"private, no-store, max-age=0",
        "X-Robots-Tag":"noindex, nofollow"}
    });
  } catch(error) {
    console.error("research_q18_live_preview_failed",error instanceof Error?error.name:"UnknownError");
    return Response.json({error:"RESEARCH_Q18_PREVIEW_UNAVAILABLE"},{
      status:503,headers:{"Cache-Control":"private, no-store"}
    });
  }
}
