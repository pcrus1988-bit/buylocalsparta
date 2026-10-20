import {hospitalityIdentity} from "../../../../../../../../../lib/hospitality-partner-access";
import {assertCustomerCsrf} from "../../../../../../../../../lib/customer-state-runtime";
import {CatalogueImportError,importDrinkStockStarterCatalogue,validateCatalogueImportCommand} from "../../../../../../../../../lib/drinkstock-catalogue-import-service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};
const fail=(error:string,status:number)=>Response.json({error},{status,headers});
export async function POST(request:Request,{params}:{params:Promise<{partnerId:string;venueId:string}>}){
 if(request.headers.get("origin")!==new URL(request.url).origin)return fail("INVALID_ORIGIN",403);
 if(request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/json")
  return fail("BAD_CONTENT_TYPE",415);
 const size=Number(request.headers.get("content-length")??0);
 if(!Number.isFinite(size)||size>8000)return fail("IMPORT_TOO_LARGE",413);
 try{
  const principal=await hospitalityIdentity();
  if(!principal)return fail("AUTH_REQUIRED",401);
  assertCustomerCsrf(principal,request.headers.get("x-csrf-token")??undefined);
  const raw=await request.text();
  if(raw.length>8000)return fail("IMPORT_TOO_LARGE",413);
  const command=validateCatalogueImportCommand(JSON.parse(raw) as unknown);
  const {partnerId,venueId}=await params;
  return Response.json(await importDrinkStockStarterCatalogue(principal.userId,partnerId,venueId,command),{headers});
 }catch(e){
  if(e instanceof CatalogueImportError)return fail(e.code,e.status);
  if(e instanceof SyntaxError)return fail("INVALID_JSON",400);
  if(e instanceof Error&&e.message.includes("CSRF validation failed"))return fail("INVALID_CSRF",403);
  return fail("CATALOGUE_UNAVAILABLE",503);
 }
}
