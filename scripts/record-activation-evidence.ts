import { readFile } from "node:fs/promises";
import { createPostgresRuntimeFromEnv, type ActivationCheckKind, type ActivationProvider, type ActivationStatus } from "@buy-local-sparta/postgres-runtime";

const args=Object.fromEntries(process.argv.slice(2).filter((value)=>value.startsWith("--")&&value.includes("=")).map((value)=>{const [key,...rest]=value.slice(2).split("=");return[key,rest.join("=")];}));
const provider=args.provider as ActivationProvider|undefined,checkName=args.check,status=args.status as ActivationStatus|undefined,kind=(args.kind??"scenario") as ActivationCheckKind;
const providers=new Set(["database","viva","mydata","search","email","object_storage","clamav","boxnow","web"]);
if(!provider||!providers.has(provider)||!checkName||!status)throw new Error("Usage: npm run stage:evidence -- --provider=viva --check=demo-payment-refund --status=passed [--evidence=reference] [--note=text]");
if(!["passed","failed","blocked","skipped"].includes(status))throw new Error("Invalid activation status");if(!["configuration","connectivity","scenario","deployment"].includes(kind))throw new Error("Invalid activation check kind");
const buildVersion=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"))?.version as string;const environment=process.env.BLS_DEPLOYMENT_ENVIRONMENT?.trim()||"staging";const ttlHours=Number(process.env.BLS_ACTIVATION_EVIDENCE_TTL_HOURS||72);
const runtime=createPostgresRuntimeFromEnv({applicationName:"buy-local-sparta-activation-evidence"});
try{const ready=await runtime.readiness();if(!ready.ok)throw new Error(ready.message);const row=await runtime.activationEvidence.record({provider,environment,buildVersion,checkName,checkKind:kind,status,evidence:args.evidence,details:{note:(args.note??"").slice(0,500),operatorRecorded:true},observedAt:Date.now(),expiresAt:Date.now()+Math.max(1,ttlHours)*60*60*1000});console.log(JSON.stringify({ok:true,evidence:{id:row.id,provider:row.provider,environment:row.environment,buildVersion:row.buildVersion,checkName:row.checkName,status:row.status,evidenceDigest:row.evidenceDigest,observedAt:row.observedAt,expiresAt:row.expiresAt}},null,2));}finally{await runtime.close();}
