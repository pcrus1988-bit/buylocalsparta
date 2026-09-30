import { requireAdminSession } from "../../../../lib/admin-session";
import { adminProductCategoriesWorkspace, adminProductsWorkspace, type AdminProductStateFilter } from "../../../../lib/admin-products-runtime";

const STATES=new Set<AdminProductStateFilter>(["all","live","draft","suppressed","recalled","uncategorized","missing_media","no_offer"]);

export async function GET(request:Request){
  try{
    const principal=await requireAdminSession(request,{permission:"catalog.read"});
    const url=new URL(request.url);
    if(url.searchParams.get("view")==="categories"){
      return Response.json(await adminProductCategoriesWorkspace(principal,{
        q:url.searchParams.get("q")?.trim()||undefined,
        offset:Number(url.searchParams.get("offset")??0),
        limit:Number(url.searchParams.get("limit")??60)
      }),{headers:{"cache-control":"private, no-store"}});
    }
    const rawState=url.searchParams.get("state")?.trim() as AdminProductStateFilter|undefined;
    const rawChannel=url.searchParams.get("channel")?.trim();
    return Response.json(await adminProductsWorkspace(principal,{
      q:url.searchParams.get("q")?.trim()||undefined,
      category:url.searchParams.get("category")?.trim()||undefined,
      state:rawState&&STATES.has(rawState)?rawState:"all",
      channel:rawChannel==="normal"||rawChannel==="bazaar"?rawChannel:"all",
      cursor:url.searchParams.get("cursor")?.trim()||undefined,
      limit:Number(url.searchParams.get("limit")??48)
    }),{headers:{"cache-control":"private, no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"admin_products_read_failed"},{status:400});
  }
}
