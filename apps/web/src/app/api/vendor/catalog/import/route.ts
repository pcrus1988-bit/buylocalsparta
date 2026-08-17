import { requireVendorSession } from "../../../../../lib/vendor-session";
import { previewOrCommitVendorCsv } from "../../../../../lib/vendor-backoffice-service";
export async function POST(request:Request){try{const p=await requireVendorSession(request,true);const b=await request.json() as {csv?:unknown;confirm?:unknown};if(typeof b.csv!=="string")throw new Error("CSV content is required");return Response.json(await previewOrCommitVendorCsv(p,b.csv,b.confirm===true));}catch(e){return Response.json({error:e instanceof Error?e.message:"csv_import_failed"},{status:400})}}
