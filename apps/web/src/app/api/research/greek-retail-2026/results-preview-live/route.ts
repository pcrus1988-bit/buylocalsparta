import { getAdminSession } from "../../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../../lib/admin-runtime";
import { getLiveGreekRetailPreview } from "../../../../../lib/research-live-preview-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Restricted to research administrators. Public results remain embargoed. */
export async function GET() {
  const principal = await getAdminSession();
  if (!principal || !hasAdminPermission(principal,"research.read")) {
    return Response.json({error:"NOT_FOUND"},{status:404,headers:{"Cache-Control":"private, no-store"}});
  }
  try {
    const snapshot=await getLiveGreekRetailPreview();
    return Response.json({schema:"kontamou.research.live-preview.v1",...snapshot},{
      headers:{"Cache-Control":"private, no-store, max-age=0","X-Robots-Tag":"noindex, nofollow"}
    });
  } catch (error) {
    console.error("research_live_preview_failed",error instanceof Error?error.name:"UnknownError");
    return Response.json({error:"RESEARCH_LIVE_PREVIEW_UNAVAILABLE"},{
      status:503,headers:{"Cache-Control":"private, no-store"}
    });
  }
}
