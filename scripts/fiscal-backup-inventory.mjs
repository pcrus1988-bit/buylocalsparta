/**
 * FISCAL M50 — query Supabase Management API backup inventory only (GET).
 * No database credentials, restore commands, writes or production flags.
 * A completed backup does NOT prove recovery; the output never authorizes
 * fiscal migrations or statutory invoice issuance.
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

export const FISCAL_PROJECT_REF="kcpwxplxqtqdsfwlfsaa";
export const FISCAL_BACKUP_LIST_URL="https://api.supabase.com/v1/projects/"+FISCAL_PROJECT_REF+"/database/backups";
const MAX_JSON_BYTES=65_536;
const MAX_BACKUP_AGE_MS=48*60*60*1000;
const MAX_CLOCK_SKEW_MS=5*60*1000;
const MAX_BACKUP_ROWS=1000;

function fail(code){throw new Error("FISCAL_M50_"+code);}

/** A backup inventory is evidence of scheduling, not a tested restoration. */
export function classifyFiscalBackups(payload,now=new Date()){
 const nowMs=now instanceof Date?now.getTime():Number.NaN;
 if(!Number.isFinite(nowMs))fail("INVALID_CLOCK");
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
   !Array.isArray(payload.backups)||payload.backups.length>MAX_BACKUP_ROWS||
   typeof payload.pitr_enabled!=="boolean"||
   typeof payload.walg_enabled!=="boolean")fail("INVALID_BACKUP_INVENTORY");
 const seen=new Set(),backups=[];
 for(const row of payload.backups){
  if(!row||typeof row!=="object"||Array.isArray(row)||
     !(typeof row.id==="string"||Number.isSafeInteger(row.id))||
     typeof row.status!=="string"||
     typeof row.inserted_at!=="string"||
     typeof row.is_physical_backup!=="boolean")fail("INVALID_BACKUP_RECORD");
  const id=String(row.id);
  if(!/^[0-9a-zA-Z_-]{1,90}$/.test(id)||seen.has(id))fail("INVALID_BACKUP_ID");
  seen.add(id);
  const time=Date.parse(row.inserted_at);
  if(!Number.isFinite(time)||time>nowMs+MAX_CLOCK_SKEW_MS||
     time<Date.UTC(2020,0,1))fail("INVALID_BACKUP_TIME");
  backups.push({id,status:row.status,time,isPhysical:row.is_physical_backup});
 }
 const completed=backups.filter(x=>x.status==="COMPLETED").sort((a,b)=>b.time-a.time);
 const latest=completed[0]??null;
 const age=latest?Math.max(0,nowMs-latest.time):null;
 const fresh=latest!==null&&age!==null&&age<=MAX_BACKUP_AGE_MS;
 return Object.freeze({
  kind:"fiscal_production_backup_inventory",mode:"read_only",
  projectRef:FISCAL_PROJECT_REF,
  inventoryEndpointVerified:true,
  totalBackupRecords:backups.length,
  completedBackupCount:completed.length,
  latestCompletedBackupId:latest?.id??null,
  latestCompletedBackupAt:latest?new Date(latest.time).toISOString():null,
  latestCompletedBackupType:latest?(latest.isPhysical?"physical":"logical"):null,
  latestCompletedBackupAgeHours:age===null?null:Math.round(age/3_600_000*100)/100,
  recentCompletedBackupPresent:fresh,
  pitrEnabled:payload.pitr_enabled,
  walGEnabled:payload.walg_enabled,
  backedUpDataRestoreVerified:false,
  restoredProductionBackupId:null,
  productionMigrationWritesAuthorized:false,
  statutoryIssuanceAuthorized:false
 });
}

export function validateFiscalBackupInventoryContext({token,args=[],projectRef=FISCAL_PROJECT_REF}){
 if(projectRef!==FISCAL_PROJECT_REF)fail("PROJECT_SCOPE_MISMATCH");
 if(!Array.isArray(args)||args.some(a=>a!=="--require-recent")||
   args.length>1)fail("INVALID_ARGUMENTS");
 if(typeof token!=="string"||token.length<15||
   !token.trim()||token!==token.trim()||/[\r\n]/.test(token))
  fail("MANAGEMENT_TOKEN_NOT_CONFIGURED");
 return {token,strict:args.includes("--require-recent")};
}

export async function fetchFiscalBackups({token,fetchImpl=fetch,timeoutMs=8000}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>15000)
  fail("INVALID_TIMEOUT");
 // A single hard-coded HTTPS endpoint, no query parameters and no redirects.
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(FISCAL_BACKUP_LIST_URL,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+token,Accept:"application/json"},
   signal:controller.signal
  });
  if(!response||response.status!==200||!response.ok)fail("BACKUP_API_UNAVAILABLE");
  if(!response.headers?.get("content-type")?.toLowerCase().includes("application/json"))
   fail("BACKUP_API_INVALID_CONTENT");
  const declared=Number(response.headers.get("content-length"));
  if(Number.isFinite(declared)&&declared>MAX_JSON_BYTES)fail("BACKUP_API_TOO_LARGE");
  if(!response.body||typeof response.body.getReader!=="function")
   fail("BACKUP_API_MISSING_BODY");
  const reader=response.body.getReader(),parts=[];
  let total=0;
  try{
   while(true){
    const chunk=await reader.read();
    if(chunk.done)break;
    if(!(chunk.value instanceof Uint8Array))fail("BACKUP_API_INVALID_BODY");
    total+=chunk.value.length;
    if(total>MAX_JSON_BYTES)fail("BACKUP_API_TOO_LARGE");
    parts.push(chunk.value);
   }
  }finally{reader.releaseLock();}
  const buffer=new Uint8Array(total);
  let offset=0;
  for(const chunk of parts){buffer.set(chunk,offset);offset+=chunk.length;}
  let payload;
  try{payload=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buffer));}
  catch{fail("BACKUP_API_INVALID_JSON");}
  return payload;
 }catch(error){
  if(error instanceof Error&&/^FISCAL_M50_[A-Z_]+$/.test(error.message))throw error;
  fail("BACKUP_API_UNAVAILABLE");
 }finally{clearTimeout(timer);}
}

async function main(){
 const config=validateFiscalBackupInventoryContext({
  token:process.env.SUPABASE_ACCESS_TOKEN,
  args:process.argv.slice(2)
 });
 const payload=await fetchFiscalBackups({token:config.token});
 const summary=classifyFiscalBackups(payload);
 console.log(JSON.stringify(summary));
 if(config.strict&&!summary.recentCompletedBackupPresent)process.exitCode=2;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{
  // Never reveal the token, API payload, URL, HTTP response or error stack.
  const code=error instanceof Error&&/^FISCAL_M50_[A-Z_]+$/.test(error.message)
   ?error.message:"FISCAL_M50_BACKUP_INSPECTION_FAILED";
  console.error(code);process.exitCode=1;
 });
