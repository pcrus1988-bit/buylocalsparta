/**
 * FISCAL M47 — disposable-only PostgreSQL backup -> restore acceptance.
 *
 * MUST NEVER be used with a real FISCAL database. It rejects non-CI/non-local
 * targets and uses synthetic data only. The image's PG17 clients are used so
 * pg_dump is not accidentally older than the CI PostgreSQL 17 server.
 */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {refuseSharedFiscalDatabase} from "./fiscal-migration-readiness.mjs";

export const SOURCE_DB="fiscal_ci";
export const RESTORE_DB="fiscal_restore_ci";
const HOSTS=new Set(["localhost","127.0.0.1","::1"]);

export function validateDisposableRestoreContext({ci,mode,sourceUrl,marketplaceUrls=[]}){
 if(ci!=="true" || mode!=="synthetic")throw new Error("FISCAL_M47_SYNTHETIC_CI_ONLY");
 if(typeof sourceUrl!=="string")throw new Error("FISCAL_M47_SOURCE_UNAVAILABLE");
 let db;
 try{db=new URL(sourceUrl);}catch{throw new Error("FISCAL_M47_INVALID_SOURCE");}
 if(!["postgresql:","postgres:"].includes(db.protocol) ||
    !HOSTS.has(db.hostname) || db.pathname!=="/"+SOURCE_DB ||
    db.username!=="fiscal_ci" || !db.password || db.search || db.hash)
  throw new Error("FISCAL_M47_LOCAL_DATABASE_REQUIRED");
 refuseSharedFiscalDatabase(sourceUrl,marketplaceUrls);
 const target=new URL(sourceUrl);
 target.pathname="/"+RESTORE_DB;
 return Object.freeze({source:db.toString(),target:target.toString()});
}

function connectionParams(connection){
 const parsed=new URL(connection);
 return {
  PGHOST:parsed.hostname,PGPORT:parsed.port||"5432",
  PGUSER:decodeURIComponent(parsed.username),
  PGPASSWORD:decodeURIComponent(parsed.password),
  PGDATABASE:decodeURIComponent(parsed.pathname.slice(1)),
  PGSSLMODE:"disable"
 };
}

function dockerPg(tool,options,connection,volume){
 const settings=connectionParams(connection);
 const commands=[
  "run","--rm","--network=host",
  "--user",String(process.getuid?.()??1000)+":"+String(process.getgid?.()??1000),
  "--env","PGHOST","--env","PGPORT","--env","PGUSER","--env","PGPASSWORD",
  "--env","PGDATABASE","--env","PGSSLMODE"
 ];
 if(volume)commands.push("--volume",volume+":/backup:rw");
 commands.push("postgres:17",tool,...options);
 const result=spawnSync("docker",commands,{
  env:{PATH:process.env.PATH,HOME:process.env.HOME,...settings},
  stdio:"ignore",timeout:120_000
 });
 if(result.error || result.status!==0)throw new Error("FISCAL_M47_"+tool.toUpperCase()+"_FAILED");
}

async function main(){
 if(process.argv.length!==2)throw new Error("FISCAL_M47_NO_ARGUMENTS");
 const {source,target}=validateDisposableRestoreContext({
  ci:process.env.CI,mode:process.env.FISCAL_RESTORE_DRILL_MODE,
  sourceUrl:process.env.FISCAL_DATABASE_URL,
  marketplaceUrls:[process.env.DATABASE_URL,process.env.POSTGRES_URL]
 });
 const {default:pg}=await import("pg");
 let tmp;
 const sourceDb=new pg.Client({connectionString:source,connectionTimeoutMillis:5000});
 let sourceConnected=false;
 try{
  await sourceDb.connect();sourceConnected=true;
  // Canary is nonidentifying, in the *disposable CI database only*.
  const canary="f".repeat(64);
  await sourceDb.query(
   "INSERT INTO public.fiscal_auth_limits(key_hash,window_start,attempts) VALUES($1,$2,$3)",
   [canary,"2026-10-22T00:00:00.000Z",7]
  );
  const expected=(await sourceDb.query(
   "SELECT name,sha256 FROM public.fiscal_schema_migrations ORDER BY name")).rows;
  assert.ok(expected.length>=20,"Synthetic source must have all migrations");
  tmp=await mkdtemp(join(tmpdir(),"fiscal-m47-"));
  dockerPg("pg_dump",["--format=custom","--no-owner","--no-acl",
   "--schema=public","--file=/backup/fiscal.dump"],source,tmp);
  // pg_restore must be able to open and parse the complete archive.
  dockerPg("pg_restore",["--list","/backup/fiscal.dump"],target,tmp);
  // A separate, empty DB is created only inside the disposable localhost PG17.
  dockerPg("createdb",[RESTORE_DB],new URL("/postgres",source).toString());
  dockerPg("pg_restore",["--exit-on-error","--no-owner","--no-acl",
   "--dbname="+RESTORE_DB,"/backup/fiscal.dump"],target,tmp);
  const restored=new pg.Client({connectionString:target,connectionTimeoutMillis:5000});
  try{
   await restored.connect();
   const actual=(await restored.query(
    "SELECT name,sha256 FROM public.fiscal_schema_migrations ORDER BY name")).rows;
   assert.deepEqual(actual,expected,"Restore must preserve exact FISCAL migration hashes");
   const restoredCanary=await restored.query(
    "SELECT attempts,window_start FROM public.fiscal_auth_limits WHERE key_hash=$1",[canary]);
   assert.equal(restoredCanary.rowCount,1);
   assert.equal(restoredCanary.rows[0].attempts,7);
   assert.equal(new Date(restoredCanary.rows[0].window_start).toISOString(),
    "2026-10-22T00:00:00.000Z");
   const rls=await restored.query(
    "SELECT count(*)::int AS total,count(*) FILTER (WHERE NOT relrowsecurity)::int AS unsafe "+
    "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'fiscal_%'");
   assert.ok(rls.rows[0].total>=20,"Expected restored private tables");
   assert.equal(rls.rows[0].unsafe,0,"Restored tables must retain row-level security");
   console.log(JSON.stringify({
    kind:"fiscal_m47_disposable_restore",source:"synthetic_local_ci",
    restored:"separate_empty_local_ci_database",archiveVerified:true,
    migrationHashesVerified:true,canaryVerified:true,rlsVerified:true,
    productionBackupVerified:false
   }));
  }finally{await restored.end().catch(()=>{});}
 }finally{
  if(sourceConnected)await sourceDb.end().catch(()=>{});
  if(tmp)await rm(tmp,{recursive:true,force:true}).catch(()=>{});
 }
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{
  const safe=error instanceof Error && /^FISCAL_[A-Z0-9_]+$/.test(error.message)
   ?error.message:"FISCAL_M47_RESTORE_DRILL_FAILED";
  console.error(safe);process.exitCode=1;
 });
