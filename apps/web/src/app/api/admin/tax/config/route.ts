import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminUpdateMyDataCredentials, adminUpdateMyDataRuntimeConfig } from "../../../../../lib/admin-tax-policy-runtime";

export const runtime="nodejs";
type Body=Record<string,unknown>;
const required=(body:Body,key:string)=>{const value=body[key];if(typeof value!=="string"||!value.trim())throw new Error(`${key} is required`);return value.trim();};
const optional=(body:Body,key:string)=>typeof body[key]==="string"?(body[key] as string).trim()||undefined:undefined;
const bool=(body:Body,key:string)=>{const value=body[key];if(typeof value!=="boolean")throw new Error(`${key} must be boolean`);return value;};
const integer=(body:Body,key:string)=>{const value=Number(body[key]);if(!Number.isSafeInteger(value))throw new Error(`${key} must be an integer`);return value;};

export async function POST(request:Request){
  try{
    const principal=await requireAdminSession(request,{csrf:true});
    const body=await request.json() as Body;
    const action=required(body,"action");
    if(action==="save_runtime"){
      const environment=required(body,"environment");if(environment!=="test"&&environment!=="production")throw new Error("Unsupported AADE environment");
      return Response.json(await adminUpdateMyDataRuntimeConfig(principal,{environment,specVersion:required(body,"specVersion"),requestTimeoutMs:integer(body,"requestTimeoutMs"),issuanceEnabled:bool(body,"issuanceEnabled"),ecrTokenEnabled:bool(body,"ecrTokenEnabled"),vivaFiscalEnabled:bool(body,"vivaFiscalEnabled"),mappingVersionPin:optional(body,"mappingVersionPin"),capturePaidOrders:bool(body,"capturePaidOrders"),emailAcceptedDocuments:bool(body,"emailAcceptedDocuments"),confirmation:optional(body,"confirmation"),reason:required(body,"reason")}));
    }
    if(action==="save_credentials")return Response.json(await adminUpdateMyDataCredentials(principal,{userId:optional(body,"userId"),subscriptionKey:optional(body,"subscriptionKey"),reason:required(body,"reason")}));
    throw new Error("Unsupported myDATA configuration action");
  }catch(error){return Response.json({error:error instanceof Error?error.message:"mydata_config_action_failed"},{status:400});}
}
