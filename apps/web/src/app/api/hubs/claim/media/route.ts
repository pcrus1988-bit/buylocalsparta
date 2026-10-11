import { getAccountSession } from "../../../../../lib/account-session";
import { assertCustomerCsrf } from "../../../../../lib/customer-state-runtime";
import { uploadOwnedHubClaimImage } from "../../../../../lib/hub-claim-media";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:Request){
  try {
    const principal=await getAccountSession();
    if (!principal) return Response.json({error:"UNAUTHORIZED"},{status:401});
    assertCustomerCsrf(principal,request.headers.get("x-csrf-token")??"");
    const form=await request.formData();
    const file=form.get("file");
    if (!(file instanceof File)||file.size<=0||file.size>4*1024*1024) throw new Error("Επίλεξε εικόνα έως 4 MB.");
    const id=await uploadOwnedHubClaimImage(principal,{
      claimId:String(form.get("claimId")??""),role:String(form.get("role")??""),
      filename:file.name,contentType:file.type,bytes:new Uint8Array(await file.arrayBuffer()),
      altText:String(form.get("altText")??""),rightsOwner:String(form.get("rightsOwner")??"")
    });
    return Response.json({ok:true,id,status:"pending"},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"UPLOAD_FAILED"},{status:400,headers:{"Cache-Control":"no-store"}});}
}
