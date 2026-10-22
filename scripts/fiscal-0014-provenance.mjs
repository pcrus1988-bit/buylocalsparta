/**
 * FISCAL M49 — read-only historical provenance of 0014 FK indexes.
 * Compare exact stored Supabase migration SQL, checked-in SQL and physical
 * PostgreSQL catalog definitions. No ledger repair, backup, or issuance writes.
 */
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {FK_INDEXES,FK_LOOKUP_MIGRATION} from "./fiscal-migration-preflight.mjs";
import {refuseSharedFiscalDatabase} from "./fiscal-migration-readiness.mjs";

export const HISTORY_VERSION="20261011145704";
export const HISTORY_NAME="fiscal_fk_lookup_indexes_0014";
const HASH=/^[a-f0-9]{64}$/;

/** Only seven fixed-schema, additive single-column indexes can be trusted. */
export function canonicalIndexStatements(raw){
 if(typeof raw!=="string")throw new Error("FISCAL_M49_INVALID_SQL");
 const withoutComments=raw.replace(/--[^\r\n]*/g,"")
   .replace(/\/\*[\s\S]*?\*\//g,"");
 const statements=withoutComments.split(";").map(x=>x.trim()).filter(Boolean)
   .filter(x=>!["BEGIN","COMMIT"].includes(x.toUpperCase()));
 if(statements.length!==FK_INDEXES.length)
  throw new Error("FISCAL_M49_WRONG_STATEMENT_COUNT");
 const seen=new Set();
 const normalized=[];
 for(const s of statements){
  const m=/^CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)\s+ON\s+public\.([a-z0-9_]+)\s*\(\s*([a-z0-9_]+)\s*\)$/i.exec(s.replace(/\s+/g," ").trim());
  if(!m)throw new Error("FISCAL_M49_UNEXPECTED_DDL");
  const [_,name,table,column]=m.map(x=>x?.toLowerCase());
  const identifier=FK_INDEXES.find(x=>x.name===name);
  if(!identifier||seen.has(name))throw new Error("FISCAL_M49_DUPLICATE_OR_UNKNOWN_INDEX");
  const expected=identifier.definition.toLowerCase().replace("create index ","create index if not exists ").replace(" using btree "," ");
  const actual="create index if not exists "+name+" on public."+table+" ("+column+")";
  if(actual!==expected)throw new Error("FISCAL_M49_INDEX_TARGET_MISMATCH");
  seen.add(name);normalized.push(actual);
 }
 return Object.freeze(normalized.sort());
}
const fingerprint=(s)=>createHash("sha256").update(s).digest("hex");

/** Inputs contain only schema metadata, never tenant or financial records. */
export function evaluateFiscal0014Evidence({
 localSource, historyRows, indexRows, internalLedgerRows
}){
 const sourceStatements=canonicalIndexStatements(localSource);
 if(!Array.isArray(historyRows)||historyRows.length!==1||
   historyRows[0]?.version!==HISTORY_VERSION||
   historyRows[0]?.name!==HISTORY_NAME||
   !Array.isArray(historyRows[0]?.statements)||
   historyRows[0].statements.length!==1)
  throw new Error("FISCAL_M49_HISTORICAL_RECORD_MISSING");
 const historical=canonicalIndexStatements(historyRows[0].statements[0]);
 if(JSON.stringify(historical)!==JSON.stringify(sourceStatements))
  throw new Error("FISCAL_M49_HISTORICAL_DDL_DIFFERS");
 if(!Array.isArray(indexRows)||indexRows.length!==FK_INDEXES.length)
  throw new Error("FISCAL_M49_INDEX_CATALOG_INCOMPLETE");
 const byName=new Map();
 for(const row of indexRows){
  if(typeof row?.indexname!=="string"||typeof row.indexdef!=="string"||byName.has(row.indexname))
   throw new Error("FISCAL_M49_INVALID_INDEX_CATALOG");
  byName.set(row.indexname,row.indexdef.replace(/\s+/g," ").trim());
 }
 for(const item of FK_INDEXES)
  if(byName.get(item.name)!==item.definition)
   throw new Error("FISCAL_M49_PHYSICAL_INDEX_DIFFERS");
 if(!Array.isArray(internalLedgerRows)||internalLedgerRows.length>1)
  throw new Error("FISCAL_M49_INVALID_INTERNAL_LEDGER");
 const sourceSha=fingerprint(localSource);
 if(internalLedgerRows.length===1){
  if(internalLedgerRows[0]?.name!==FK_LOOKUP_MIGRATION||
     !HASH.test(internalLedgerRows[0]?.sha256)||internalLedgerRows[0].sha256!==sourceSha)
    throw new Error("FISCAL_M49_CHECKSUM_DRIFT");
 }
 const markerPresent=internalLedgerRows.length===1;
 return Object.freeze({
  kind:"fiscal_0014_immutable_provenance",mode:"read_only",
  supabaseMigrationVersion:HISTORY_VERSION,
  checkedInSourceSha256:sourceSha,
  normalizedDdlSha256:fingerprint(historical.join("\n")),
  indexedOperationsVerified:FK_INDEXES.length,
  supabaseHistoryMatchesSource:true,physicalIndexesMatch:true,
  internalLedgerMarkerPresent:markerPresent,
  reconciliationRequired:!markerPresent,
  verifiedProductionBackupRestore:false,
  authorizedToChangeDatabase:false,
  authorizedToIssueFiscalDocuments:false
 });
}

export async function inspectFiscal0014Evidence(db,localSource){
 const history=await db.query(
  "SELECT version,name,statements FROM supabase_migrations.schema_migrations WHERE version=$1",
  [HISTORY_VERSION]);
 const index=await db.query(
  "SELECT indexname,indexdef FROM pg_catalog.pg_indexes WHERE schemaname='public' AND indexname=ANY($1::text[])",
  [FK_INDEXES.map(x=>x.name)]);
 const marker=await db.query(
  "SELECT name,sha256 FROM public.fiscal_schema_migrations WHERE name=$1",
  [FK_LOOKUP_MIGRATION]);
 return evaluateFiscal0014Evidence({
  localSource,historyRows:history.rows,indexRows:index.rows,internalLedgerRows:marker.rows
 });
}

async function main(){
 const args=process.argv.slice(2);
 if(args.length>1 || (args.length===1 && args[0]!=="--require-reconciled"))
  throw new Error("FISCAL_M49_INVALID_ARGUMENTS");
 const url=process.env.FISCAL_DATABASE_URL?.trim();
 if(!url)throw new Error("FISCAL_M49_DATABASE_NOT_CONFIGURED");
 refuseSharedFiscalDatabase(url,[process.env.DATABASE_URL,process.env.POSTGRES_URL]);
 const source=await readFile(resolve("fiscal/migrations",FK_LOOKUP_MIGRATION),"utf8");
 const {default:pg}=await import("pg");
 const db=new pg.Client({connectionString:url,connectionTimeoutMillis:5000,
  application_name:"fiscal-0014-m49-readonly-evidence"});
 let inTx=false;
 try{
  await db.connect();await db.query("BEGIN TRANSACTION READ ONLY");inTx=true;
  await db.query("SET LOCAL statement_timeout = '5000ms'");
  const output=await inspectFiscal0014Evidence(db,source);
  await db.query("COMMIT");inTx=false;
  console.log(JSON.stringify(output));
  if(args[0]==="--require-reconciled"&&output.reconciliationRequired)process.exitCode=2;
 }finally{
  if(inTx)await db.query("ROLLBACK").catch(()=>{});
  await db.end().catch(()=>{});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(e=>{
  const safe=e instanceof Error&&/^FISCAL_[A-Z0-9_]+$/.test(e.message)
    ?e.message:"FISCAL_M49_READONLY_INSPECTION_FAILED";
  console.error(safe);process.exitCode=1;
 });
}
