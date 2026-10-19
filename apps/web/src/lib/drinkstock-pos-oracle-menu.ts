/**
 * Read-only Oracle Simphony Transaction Services Gen2 menu adapter.
 * Oracle officially documents GET /api/v1/menus/summary and its required
 * Simphony-LocRef, Simphony-OrgShortName, Simphony-RvcRef headers.
 *
 * The trusted backend must provision OAuth/PKCE id_token, scope/location
 * entitlement and a server-controlled endpoint. This module NEVER signs in
 * with customer credentials and never creates orders/charges/receipts.
 * https://docs.oracle.com/en/industries/food-beverage/simphony/omsstsg2api/
 */
export class OraclePosAdapterError extends Error{
 readonly code:string;
 readonly status:number;
 constructor(code:string,status:number){super(code);this.code=code;this.status=status;}
}
export type OracleSimphonyMenuConfig={
 baseUrl:string;orgShortName:string;locationRef:string;
 revenueCenterRef:number;idToken:string;
};
const safeRef=(v:string)=>/^[a-zA-Z0-9._-]{1,128}$/.test(v);
const MAX_RESPONSE_BYTES=1024*1024*2;
function validateOracleConfig(c:OracleSimphonyMenuConfig){
 let u:URL;
 try{u=new URL(c.baseUrl);}catch{throw new OraclePosAdapterError("BAD_ORACLE_ENDPOINT",400);}
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
  u.pathname!=="/"||u.hostname.length>253||
  !(u.hostname.includes(".")||u.hostname==="localhost")||
  u.hostname==="localhost"||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(u.hostname))
  throw new OraclePosAdapterError("BAD_ORACLE_ENDPOINT",400);
 if(!safeRef(c.orgShortName)||!safeRef(c.locationRef)||
  !Number.isInteger(c.revenueCenterRef)||c.revenueCenterRef<1||
  c.revenueCenterRef>2147483647||!c.idToken||c.idToken.length>8192||
  /[\r\n]/.test(c.idToken))
  throw new OraclePosAdapterError("BAD_ORACLE_CONFIGURATION",400);
 return u.origin;
}
export async function oracleReadMenuSummary(
 config:OracleSimphonyMenuConfig,
 fetcher:typeof fetch=fetch
):Promise<unknown>{
 const origin=validateOracleConfig(config);
 let response:Response;
 try{
  response=await fetcher(origin+"/api/v1/menus/summary",{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{
    authorization:"Bearer "+config.idToken,
    accept:"application/json",
    "Simphony-OrgShortName":config.orgShortName,
    "Simphony-LocRef":config.locationRef,
    "Simphony-RvcRef":String(config.revenueCenterRef)
   },
   signal:AbortSignal.timeout(8000)
  });
 }catch{throw new OraclePosAdapterError("ORACLE_UNAVAILABLE",503);}
 if(response.status===401||response.status===403)
  throw new OraclePosAdapterError("ORACLE_NOT_AUTHORIZED",403);
 if(!response.ok)throw new OraclePosAdapterError("ORACLE_HTTP_ERROR",502);
 if(!response.headers.get("content-type")?.toLowerCase().includes("application/json"))
  throw new OraclePosAdapterError("ORACLE_NON_JSON_RESPONSE",502);
 const length=Number(response.headers.get("content-length")??0);
 if(!Number.isFinite(length)||length>MAX_RESPONSE_BYTES)
  throw new OraclePosAdapterError("ORACLE_RESPONSE_TOO_LARGE",502);
 const body=await response.text();
 if(body.length>MAX_RESPONSE_BYTES)throw new OraclePosAdapterError("ORACLE_RESPONSE_TOO_LARGE",502);
 try{return JSON.parse(body) as unknown;}
 catch{throw new OraclePosAdapterError("ORACLE_INVALID_JSON",502);}
}
