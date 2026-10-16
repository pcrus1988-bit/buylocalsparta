import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/admin-session";
import { optimizeReferenceBasket, type BasketLine } from "../../../../../../../scripts/posokanei/basket-optimizer.mjs";
import { DEMO_GROUPS, DEMO_PRICES, DEMO_PRODUCTS, DEMO_SNAPSHOT_DATE } from "../../../../lib/posokanei-preview-fixture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet"
};
function error(status: number, message: string) {
  return NextResponse.json({error:message}, {status,headers:privateHeaders});
}

/**
 * Private, CSRF-guarded calculation endpoint; input never defines price/product data.
 * All values in this release are explicitly synthetic fixtures, never PosoKanei records.
 */
export async function POST(request: Request) {
  try {
    await requireAdminSession(request,{permission:"catalog.read",csrf:true});
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : "";
    return error(message==="ADMIN_AUTH_REQUIRED" ? 401 : 403,"Δεν επιτρέπεται η ιδιωτική προεπισκόπηση.");
  }
  try {
    if(Number(request.headers.get("content-length")||"0")>20000) return error(413,"Υπερβολικά μεγάλο αίτημα.");
    const raw=await request.text();
    if(raw.length>20000) return error(413,"Υπερβολικά μεγάλο αίτημα.");
    const payload:unknown=JSON.parse(raw);
    if(!payload || typeof payload!=="object" || Array.isArray(payload)) return error(400,"Μη έγκυρη λίστα.");
    const params=payload as {lines?:unknown;storeLimit?:unknown};
    if(!Array.isArray(params.lines) || params.lines.length>20 || params.lines.length<1) {
      return error(400,"Η λίστα πρέπει να περιέχει 1–20 προϊόντα.");
    }
    if(!Number.isSafeInteger(params.storeLimit) || Number(params.storeLimit)<1 || Number(params.storeLimit)>3) {
      return error(400,"Επιτρέπονται έως 3 αλυσίδες στην προεπισκόπηση.");
    }
    // The common engine rejects invalid IDs, unapproved substitutions and quantities.
    const result=optimizeReferenceBasket({
      lines:params.lines as BasketLine[],
      products:DEMO_PRODUCTS,
      observations:DEMO_PRICES,
      approvedGroups:DEMO_GROUPS,
      snapshotDate:DEMO_SNAPSHOT_DATE,
      country:"GR",
      storeLimit:Number(params.storeLimit)
    });
    return NextResponse.json({mode:"SYNTHETIC_ADMIN_PREVIEW",result},{headers:privateHeaders});
  } catch (failure) {
    const message=failure instanceof Error ? failure.message : "Unknown error";
    return error(400,message.slice(0,240));
  }
}
