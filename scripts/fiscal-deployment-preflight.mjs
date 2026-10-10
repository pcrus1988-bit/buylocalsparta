// Safe infrastructure preflight; deliberately prints no environment secrets.
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
const mode=process.argv.includes("--activation")?"activation":"staging";
const errors=[],notes=[];
const env=process.env;
const validOrigin=(value)=>{
 if(!value)return false;
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==="/";}
 catch{return false;}
};
const bad=(reason)=>errors.push(reason);
if(env.FISCAL_STANDALONE_MODE!=="true")bad("FISCAL_STANDALONE_MODE must be true");
if(env.FISCAL_REGISTRATION_ENABLED==="true")bad("Public registration is not approved");
if(env.FISCAL_MARKETPLACE_DRAFT_SYNC_ENABLED==="true")bad("Live marketplace draft sync must remain disabled");
if(env.FISCAL_ISSUANCE_ENABLED==="true")bad("Legal fiscal issuance is NOT certified");
if(env.DATABASE_URL||env.POSTGRES_URL)bad("Standalone Fiscal must not receive marketplace database variables");
const cfg=JSON.parse(await readFile(resolve("fiscal/service/vercel.json"),"utf8"));
if(cfg.crons||cfg.env)bad("Fiscal Vercel config cannot contain cron jobs or embedded env credentials");
if(env.FISCAL_DATABASE_URL){
 try{
  const db=new URL(env.FISCAL_DATABASE_URL);
  if(!["postgresql:","postgres:"].includes(db.protocol)||!db.hostname||!db.pathname||db.pathname==="/")
   bad("Dedicated Fiscal database DSN malformed");
  if(mode==="activation"&&db.hostname==="localhost")bad("Activated service cannot use local Fiscal DB");
 }catch{bad("Dedicated Fiscal database DSN malformed");}
}else if(mode==="activation")bad("FISCAL_DATABASE_URL missing");
else notes.push("Independent Fiscal database not yet provisioned");
if(mode==="activation"){
 if(!validOrigin(env.FISCAL_SERVICE_BASE_URL))bad("FISCAL_SERVICE_BASE_URL must be one HTTPS origin");
 if(!validOrigin(env.FISCAL_MARKETPLACE_BASE_URL))bad("FISCAL_MARKETPLACE_BASE_URL must be one HTTPS origin");
 if(env.FISCAL_SERVICE_BASE_URL&&env.FISCAL_MARKETPLACE_BASE_URL&&
  new URL(env.FISCAL_SERVICE_BASE_URL).origin===new URL(env.FISCAL_MARKETPLACE_BASE_URL).origin)
  bad("Fiscal and marketplace HTTPS origins must be different");
 const sso=env.FISCAL_SUPERADMIN_SSO_SECRET??"",link=env.FISCAL_MARKETPLACE_LINK_SECRET??"";
 if(sso.length<48)bad("Independent SSO signing secret is not configured");
 if(link.length<32)bad("Independent marketplace-link signing secret is not configured");
 if(sso&&link&&sso===link)bad("SSO and marketplace-link secrets must be distinct");
 notes.push("Migrations, verified KYB, runtime tests, SSL and legal certification still require external sign-off");
}
console.log(JSON.stringify({service:"konta-moy-fiscal",mode,preflight:errors.length?"FAILED":"PASSED",blockers:errors,notes},null,2));
if(errors.length)process.exitCode=1;
