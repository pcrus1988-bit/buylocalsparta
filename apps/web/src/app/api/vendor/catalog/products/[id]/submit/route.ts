import { requireVendorSession } from "../../../../../../../lib/vendor-session";
import { submitVendorProduct, vendorCatalogWorkspace } from "../../../../../../../lib/vendor-backoffice-service";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{const p=await requireVendorSession(request,true);const {id}=await context.params;await submitVendorProduct(p,id);return Response.json(await vendorCatalogWorkspace(p));}catch(e){return Response.json({error:e instanceof Error?e.message:"catalog_submit_failed"},{status:400})}}
