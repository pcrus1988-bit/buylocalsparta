import { readFile } from "node:fs/promises";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION, type ActivationEvidenceInput, type ActivationProvider, type ActivationStatus } from "@buy-local-sparta/postgres-runtime";
import { VivaPaymentsClient, vivaConfigFromEnv } from "@buy-local-sparta/viva-payments";
import { AadeMyDataClient, myDataConfigFromEnv } from "@buy-local-sparta/aade-mydata";
import { ResendEmailProvider, resendConfigFromEnv } from "@buy-local-sparta/resend-notifications";
import { S3ObjectStorage, objectStorageConfigFromEnv } from "@buy-local-sparta/object-storage";
import { ClamAvScanner, clamAvConfigFromEnv } from "@buy-local-sparta/media-processing";

const args = process.argv.slice(2);
const record = args.includes("--record");
const webArg = args.find((arg) => arg.startsWith("--web-url="));
const webUrl = (webArg?.slice("--web-url=".length) || process.env.BLS_ACTIVATION_WEB_URL || "").replace(/\/$/, "");
const deploymentEnvironment = process.env.BLS_DEPLOYMENT_ENVIRONMENT?.trim() || "local";
const required = new Set((process.env.BLS_ACTIVATION_REQUIRED_PROVIDERS || "database").split(",").map((value) => value.trim()).filter(Boolean));
const ttlHours = positive(process.env.BLS_ACTIVATION_EVIDENCE_TTL_HOURS, 72);
const buildVersion = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))?.version as string;
if (!/^\d+\.\d+\.\d+$/.test(buildVersion)) throw new Error("Root package version is invalid");

export type PreflightCheck = Readonly<{ provider:ActivationProvider; environment:string; enabled:boolean; required:boolean; status:ActivationStatus; checkName:string; checkKind:"connectivity"|"deployment"; message:string; details:Readonly<Record<string,string|number|boolean|null>>; elapsedMs:number }>;
const checks:PreflightCheck[]=[];

async function run(provider:ActivationProvider, enabled:boolean, environment:string, checkName:string, work:()=>Promise<{ok:boolean;message:string;details?:Record<string,string|number|boolean|null>}>,checkKind:"connectivity"|"deployment"="connectivity"):Promise<void>{
  const isRequired=required.has(provider); const started=Date.now();
  if(!enabled){checks.push({provider,environment,enabled:false,required:isRequired,status:isRequired?"blocked":"skipped",checkName,checkKind,message:isRequired?`${provider} is required but not enabled/configured`:`${provider} is disabled`,details:{},elapsedMs:Date.now()-started});return;}
  try{const result=await work();checks.push({provider,environment,enabled:true,required:isRequired,status:result.ok?"passed":"failed",checkName,checkKind,message:result.message,details:result.details??{},elapsedMs:Date.now()-started});}
  catch(error){checks.push({provider,environment,enabled:true,required:isRequired,status:"failed",checkName,checkKind,message:error instanceof Error?error.message:String(error),details:{},elapsedMs:Date.now()-started});}
}

let runtime:ReturnType<typeof createPostgresRuntimeFromEnv>|undefined;
await run("database",Boolean(process.env.DATABASE_URL?.trim()),deploymentEnvironment,"postgres-readiness",async()=>{
  runtime=createPostgresRuntimeFromEnv({applicationName:"buy-local-sparta-staging-preflight"});
  const state=await runtime.readiness(EXPECTED_SCHEMA_VERSION);
  return{ok:state.ok,message:state.message,details:{schemaVersion:state.appliedSchemaVersion??0,expectedSchemaVersion:state.expectedSchemaVersion,serverVersion:state.serverVersion??"unknown",postgisVersion:state.postgisVersion??"missing"}};
});

await run("viva",process.env.VIVA_PAYMENTS_ENABLED==="true",process.env.VIVA_ENVIRONMENT||"disabled","viva-readonly-connectivity",async()=>{
  if(deploymentEnvironment==="staging"&&process.env.VIVA_ENVIRONMENT==="live")throw new Error("Staging preflight refuses Viva live credentials");
  const result=await new VivaPaymentsClient(vivaConfigFromEnv(process.env)).readiness();
  return{ok:result.ok&&result.webhookKeyAvailable,message:"Viva OAuth Smart Checkout scope and webhook credentials are reachable",details:{environment:result.environment,webhookKeyAvailable:result.webhookKeyAvailable}};
});

const myDataConfigured=Boolean(process.env.AADE_MYDATA_USER_ID?.trim()&&process.env.AADE_MYDATA_SUBSCRIPTION_KEY?.trim());
await run("mydata",myDataConfigured,process.env.AADE_MYDATA_ENVIRONMENT||"disabled","mydata-readonly-connectivity",async()=>{
  if(deploymentEnvironment==="staging"&&process.env.AADE_MYDATA_ENVIRONMENT==="production")throw new Error("Staging preflight refuses AADE production credentials");
  const client=new AadeMyDataClient(myDataConfigFromEnv(process.env));const date=athensDate();const xml=await client.requestTransmittedDocs({mark:"0",dateFrom:date,dateTo:date});
  return{ok:Boolean(xml.trim()),message:"AADE myDATA read-only transmitted-documents request succeeded",details:{environment:client.environment,specVersion:client.specVersion,responseBytes:Buffer.byteLength(xml,"utf8")}};
});

await run("search",process.env.BLS_SEARCH_ENABLED==="true",deploymentEnvironment,"meilisearch-health",async()=>{
  if(!process.env.MEILISEARCH_ADMIN_KEY?.trim())throw new Error("MEILISEARCH_ADMIN_KEY is required to prove the indexing worker, not only customer query access");
  if(!runtime)throw new Error("Database runtime is unavailable");const result=await runtime.search?.readiness();if(!result)throw new Error("Meilisearch runtime is not configured");
  return{ok:result.ok,message:`Meilisearch health is ${result.status??"unknown"}`,details:{status:result.status??"unknown",index:process.env.MEILISEARCH_INDEX_UID||"bls_products_v1"}};
});

await run("email",process.env.BLS_EMAIL_DELIVERY_ENABLED==="true",deploymentEnvironment,"resend-domain-readiness",async()=>{
  if(!process.env.RESEND_WEBHOOK_SECRET?.startsWith("whsec_"))throw new Error("RESEND_WEBHOOK_SECRET is required for staging activation");
  if((process.env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim().length??0)<32)throw new Error("BLS_NOTIFICATION_SUPPRESSION_SECRET must be at least 32 characters");
  const result=await new ResendEmailProvider(resendConfigFromEnv(process.env)).readiness();
  return{ok:result.ok,message:result.message,details:{fromDomain:result.fromDomain,domainStatus:result.domainStatus??"unknown",sending:result.sending??"unknown"}};
});

await run("object_storage",process.env.BLS_MEDIA_PIPELINE_ENABLED==="true",deploymentEnvironment,"object-storage-head-bucket",async()=>{
  const uploadOrigin=process.env.BLS_MEDIA_UPLOAD_ORIGIN?.trim();if(!uploadOrigin||new URL(uploadOrigin).protocol!=="https:")throw new Error("BLS_MEDIA_UPLOAD_ORIGIN must be an HTTPS origin for staging activation");
  const result=await new S3ObjectStorage(objectStorageConfigFromEnv(process.env)).readiness();return{ok:result.ok,message:result.message,details:{bucket:process.env.BLS_OBJECT_STORAGE_BUCKET||process.env.OBJECT_STORAGE_BUCKET||"unknown",region:process.env.BLS_OBJECT_STORAGE_REGION||process.env.AWS_REGION||"unknown"}};
});
await run("clamav",process.env.BLS_MEDIA_PIPELINE_ENABLED==="true",deploymentEnvironment,"clamav-ping",async()=>{
  const config=clamAvConfigFromEnv(process.env);const ok=await new ClamAvScanner({...config,timeoutMs:Math.min(config.timeoutMs,5000)}).ping();return{ok,message:ok?"ClamAV PING succeeded":"ClamAV PING failed",details:{hostConfigured:true,port:config.port}};
});

await run("boxnow",process.env.BLS_BOXNOW_ENABLED==="true",process.env.BOXNOW_ENVIRONMENT||"disabled","boxnow-readonly-connectivity",async()=>{
  if(deploymentEnvironment==="staging"&&process.env.BOXNOW_ENVIRONMENT==="production")throw new Error("Staging preflight refuses BOX NOW production credentials");
  if(process.env.NEXT_PUBLIC_BOXNOW_WIDGET_ENABLED!=="true"||!process.env.NEXT_PUBLIC_BOXNOW_PARTNER_ID?.trim())throw new Error("BOX NOW staging activation requires the customer locker widget and public partner id");
  if(!runtime)throw new Error("Database runtime is unavailable");const result=await runtime.boxNowShipping?.readiness();if(!result)throw new Error("BOX NOW runtime is not configured");return{ok:result.ok,message:result.message,details:{environment:process.env.BOXNOW_ENVIRONMENT||"stage"}};
});

await run("web",Boolean(webUrl),deploymentEnvironment,"deployed-readiness-endpoint",async()=>{
  const target=new URL(webUrl);if(deploymentEnvironment!=="local"&&target.protocol!=="https:")throw new Error("Deployed activation URL must use HTTPS");
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10_000);try{const response=await fetch(`${webUrl}/api/health/ready`,{headers:{accept:"application/json"},signal:controller.signal});const body=await response.json().catch(()=>({})) as {ok?:unknown;build?:unknown};const version=typeof body.build==="string"?body.build:"unknown";const ok=response.ok&&body.ok===true&&version===buildVersion;return{ok,message:ok?"Deployed readiness endpoint matches this build":`Web readiness failed or build mismatch (HTTP ${response.status}, build ${version})`,details:{httpStatus:response.status,reportedBuild:version,targetBuild:buildVersion}};}finally{clearTimeout(timer);}
},"deployment");

if(record&&runtime&&checks.find((check)=>check.provider==="database")?.status==="passed"){
  const expiresAt=Date.now()+ttlHours*60*60*1000;
  for(const check of checks){const input:ActivationEvidenceInput={provider:check.provider,environment:check.environment,buildVersion,checkName:check.checkName,checkKind:check.checkKind,status:check.status,details:{...check.details,message:check.message,required:check.required,elapsedMs:check.elapsedMs},observedAt:Date.now(),expiresAt};await runtime.activationEvidence.record(input);}
}

const requiredFailures=checks.filter((check)=>check.required&&check.status!=="passed");
const output={ok:requiredFailures.length===0,build:buildVersion,deploymentEnvironment,recorded:record&&Boolean(runtime),requiredProviders:[...required],checks};
console.log(JSON.stringify(output,null,2));
await runtime?.close();
if(requiredFailures.length)process.exitCode=2;

function positive(raw:string|undefined,fallback:number):number{const value=Number(raw);return Number.isFinite(value)&&value>0?value:fallback;}
function athensDate():string{const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Athens",day:"2-digit",month:"2-digit",year:"numeric"}).formatToParts(new Date());const day=parts.find((part)=>part.type==="day")?.value??"01";const month=parts.find((part)=>part.type==="month")?.value??"01";const year=parts.find((part)=>part.type==="year")?.value??"1970";return `${day}/${month}/${year}`;}
