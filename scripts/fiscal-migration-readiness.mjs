/**
 * FISCAL M46 — non-mutating drift and pending-migration inspector.
 *
 * Read-only catalog access, no financial/identity data access and no backups,
 * migrations or feature flags are changed by this command.
 */
import {createHash} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const MIGRATION_FILE=/^[0-9]{4}_[a-z0-9_]+\.sql$/;
const HASH=/^[a-f0-9]{64}$/;

export function fiscalDatabaseIdentity(raw){
 const parsed=new URL(raw);
 if(!["postgresql:","postgres:"].includes(parsed.protocol) || !parsed.hostname ||
    !parsed.pathname || parsed.pathname==="/") throw new Error("FISCAL_INVALID_DATABASE_TARGET");
 return [parsed.hostname.toLowerCase(),parsed.port||"5432",decodeURIComponent(parsed.pathname).replace(/\/+$/g,"")].join("|");
}

export function refuseSharedFiscalDatabase(fiscal,otherUrls){
 const target=fiscalDatabaseIdentity(fiscal);
 for(const url of otherUrls){
  if(url?.trim() && fiscalDatabaseIdentity(url.trim())===target)
   throw new Error("FISCAL_DATABASE_MUST_BE_INDEPENDENT");
 }
}

/** Compare by filename + checksum: never infer 'applied' from Supabase migration versions. */
export function classifyFiscalMigrations(expected,recorded){
 const intended=new Map();
 for(const entry of expected){
  if(!MIGRATION_FILE.test(entry.name)||!HASH.test(entry.sha256)||intended.has(entry.name))
   throw new Error("FISCAL_INVALID_LOCAL_MIGRATION");
  intended.set(entry.name,entry.sha256);
 }
 const actual=new Map();
 for(const entry of recorded){
  if(typeof entry.name!=="string"||typeof entry.sha256!=="string"||actual.has(entry.name))
   throw new Error("FISCAL_INVALID_MIGRATION_LEDGER");
  actual.set(entry.name,entry.sha256);
 }
 const pending=[],mismatched=[],unexpected=[];
 for(const [name,sha256] of intended){
  if(!actual.has(name))pending.push(name);
  else if(actual.get(name)!==sha256)mismatched.push(name);
 }
 for(const name of actual.keys())if(!intended.has(name))unexpected.push(name);
 return Object.freeze({
  expected:intended.size,applied:intended.size-pending.length-mismatched.length,
  pending:Object.freeze(pending),mismatched:Object.freeze(mismatched),
  unexpected:Object.freeze(unexpected),
  drift:mismatched.length>0||unexpected.length>0,
  current:pending.length===0&&mismatched.length===0&&unexpected.length===0
 });
}

export async function inspectFiscalMigrationFiles(folder){
 const expected=[];
 for(const name of (await readdir(folder)).filter(x=>MIGRATION_FILE.test(x)).sort()){
  const source=await readFile(resolve(folder,name),"utf8");
  if(!/(?:^|\n)BEGIN;\s*[\s\S]*?\s*COMMIT;\s*$/i.test(source))
   throw new Error("FISCAL_INVALID_MIGRATION_ENVELOPE");
  expected.push({name,sha256:createHash("sha256").update(source).digest("hex")});
 }
 if(!expected.length)throw new Error("FISCAL_MIGRATION_FILES_MISSING");
 return expected;
}

async function main(){
 const args=process.argv.slice(2);
 if(args.some(x=>x!=="--require-current")||new Set(args).size!==args.length)
  throw new Error("FISCAL_USAGE: node scripts/fiscal-migration-readiness.mjs [--require-current]");
 const address=process.env.FISCAL_DATABASE_URL?.trim();
 if(!address)throw new Error("FISCAL_DATABASE_URL_NOT_CONFIGURED");
 refuseSharedFiscalDatabase(address,[process.env.DATABASE_URL,process.env.POSTGRES_URL]);
 const expected=await inspectFiscalMigrationFiles(resolve("fiscal/migrations"));
 const {default:pg}=await import("pg");
 const client=new pg.Client({connectionString:address,connectionTimeoutMillis:5000,
  application_name:"konta-moy-fiscal-migration-read-only"});
 let inTransaction=false;
 try{
  await client.connect();
  await client.query("BEGIN TRANSACTION READ ONLY");
  inTransaction=true;
  await client.query("SET LOCAL statement_timeout = '5000ms'");
  const result=await client.query("SELECT name,sha256 FROM public.fiscal_schema_migrations ORDER BY name");
  await client.query("COMMIT");inTransaction=false;
  const plan=classifyFiscalMigrations(expected,result.rows);
  console.log(JSON.stringify({kind:"fiscal_migration_readiness",mode:"read_only",...plan}));
  if(plan.drift || (args.includes("--require-current")&&!plan.current))process.exitCode=2;
 }finally{
  if(inTransaction)await client.query("ROLLBACK").catch(()=>{});
  await client.end().catch(()=>{});
 }
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(error=>{
  // Never print a PostgreSQL error or connection string: the raw message can
  // contain hostnames, usernames and connection parameters.
  const safe=error instanceof Error && /^FISCAL_[A-Z_]+(?::.*)?$/.test(error.message)
   ?error.message.split(":")[0]:"FISCAL_MIGRATION_AUDIT_FAILED";
  console.error(safe);
  process.exitCode=1;
 });
}