/** FISCAL M51 — compare only metadata of live FISCAL and an isolated restored project.
 * Never claims recovery certification or authorizes fiscal issuance / migrations.
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {FK_INDEXES,FK_LOOKUP_MIGRATION} from "./fiscal-migration-preflight.mjs";

export const FISCAL_PROJECT_REF="kcpwxplxqtqdsfwlfsaa";
export const ORIGINAL_INDEX_HISTORY={version:"20261011145704",name:"fiscal_fk_lookup_indexes_0014"};
const REF=/^[a-z0-9]{20}$/;
const SHA=/^[a-f0-9]{64}$/;
const SQL_NAME=/^fiscal_[a-z0-9_]+$/;
const MIGRATION_NAME=/^[0-9]{4}_[a-z0-9_]+\.sql$/;
const DENIED=Object.freeze({
 restoredProductionBackupVerified:false,restoredDataIntegrityVerified:false,
 restoredProductionBackupId:null,backupProvenanceVerified:false,
 productionMigrationWritesAuthorized:false,statutoryIssuanceAuthorized:false
});
function fail(code){throw new Error("FISCAL_M51_"+code);}

function parseProjectConnection(connection){
 if(typeof connection!=="string"||connection!==connection.trim()||/[\r\n]/.test(connection))
  fail("INVALID_CONNECTION");
 let url;
 try{url=new URL(connection);}catch{fail("INVALID_CONNECTION");}
 if(!["postgres:","postgresql:"].includes(url.protocol)||!url.hostname||
    !url.username||!url.pathname||url.pathname==="/"||url.hash)
  fail("INVALID_CONNECTION");
 const direct=/^db\.([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname.toLowerCase());
 const pooledHost=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname.toLowerCase());
 const pooled=pooledHost?/^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(url.username).toLowerCase()):null;
 if(url.searchParams.get("sslmode")?.toLowerCase()==="disable")fail("INSECURE_CONNECTION");
 if(direct&&pooled&&direct[1]!==pooled[1])fail("CONFLICTING_PROJECT_IDENTITIES");
 const ref=direct?.[1]??pooled?.[1];
 if(!ref||!REF.test(ref))fail("UNVERIFIABLE_PROJECT_IDENTITY");
 const database=decodeURIComponent(url.pathname.slice(1)).replace(/\/+$/g,"");
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(database))fail("INVALID_DATABASE_NAME");
 return {ref,host:url.hostname.toLowerCase(),port:url.port||"5432",database};
}

export function validateRestoreParityContext({sourceUrl,targetUrl,targetProjectRef,mode,marketplaceUrls=[]}){
 if(mode!=="metadata-read-only")fail("EXPLICIT_READ_ONLY_MODE_REQUIRED");
 if(!REF.test(targetProjectRef??""))fail("TARGET_REF_REQUIRED");
 const source=parseProjectConnection(sourceUrl),target=parseProjectConnection(targetUrl);
 if(source.ref!==FISCAL_PROJECT_REF)fail("SOURCE_NOT_DEDICATED_FISCAL");
 if(target.ref!==targetProjectRef||target.ref===source.ref)fail("TARGET_NOT_INDEPENDENT");
 if(!Array.isArray(marketplaceUrls))fail("INVALID_MARKETPLACE_SCOPE");
 for(const raw of marketplaceUrls){
  if(!raw)continue;
  const market=parseProjectConnection(raw);
  if([source.ref,target.ref].includes(market.ref))fail("MARKETPLACE_IDENTITY_COLLISION");
 }
 return Object.freeze({sourceProjectRef:source.ref,restoreTargetProjectRef:target.ref,mode});
}

function normalizedLedger(rows){
 if(!Array.isArray(rows)||rows.length===0||rows.length>100)fail("INVALID_LEDGER");
 const seen=new Map();
 for(const row of rows){
  if(!row||!MIGRATION_NAME.test(row.name??"")||!SHA.test(row.sha256??"")||seen.has(row.name))
   fail("INVALID_LEDGER");
  seen.set(row.name,row.sha256);
 }
 return seen;
}
function normalizedTables(rows){
 if(!Array.isArray(rows)||rows.length<20||rows.length>200)fail("INVALID_TABLE_CATALOG");
 const seen=new Map();
 for(const row of rows){
  if(!row||!SQL_NAME.test(row.name??"")||typeof row.rls!=="boolean"||seen.has(row.name))
   fail("INVALID_TABLE_CATALOG");
  seen.set(row.name,row.rls);
 }
 return seen;
}
function normalizedIndexes(rows){
 if(!Array.isArray(rows)||rows.length!==FK_INDEXES.length)fail("INVALID_INDEX_CATALOG");
 const seen=new Map();
 for(const row of rows){
  if(!row||typeof row.indexname!=="string"||typeof row.indexdef!=="string"||seen.has(row.indexname))
   fail("INVALID_INDEX_CATALOG");
  seen.set(row.indexname,row.indexdef.replace(/\s+/g," ").trim());
 }
 for(const index of FK_INDEXES)
  if(seen.get(index.name)!==index.definition)fail("INDEX_DEFINITION_DRIFT");
 return seen;
}
function normalizedHistory(rows){
 if(!Array.isArray(rows)||rows.length!==1||rows[0]?.version!==ORIGINAL_INDEX_HISTORY.version||
  rows[0]?.name!==ORIGINAL_INDEX_HISTORY.name)fail("MISSING_ORIGINAL_INDEX_HISTORY");
 return rows[0].version;
}
function equalMap(a,b){return a.size===b.size&&[...a].every(([name,v])=>b.get(name)===v);}

/** Only structural parity; it cannot verify restored business data or backup origin. */
export function compareFiscalRestoreMetadata(source,restored){
 if(!source||!restored)fail("MISSING_METADATA");
 const sm=normalizedLedger(source.ledger),tm=normalizedLedger(restored.ledger);
 const st=normalizedTables(source.tables),tt=normalizedTables(restored.tables);
 normalizedIndexes(source.indexes);normalizedIndexes(restored.indexes);
 normalizedHistory(source.history);normalizedHistory(restored.history);
 if([...st.values()].some(x=>!x)||[...tt.values()].some(x=>!x))fail("RLS_NOT_ENFORCED");
 if(!equalMap(sm,tm))fail("MIGRATION_LEDGER_PARITY_FAILED");
 if(!equalMap(st,tt))fail("TABLE_CATALOG_PARITY_FAILED");
 return Object.freeze({
  kind:"fiscal_restored_target_structural_parity",mode:"metadata_read_only",
  migrationEntriesCompared:sm.size,rlsProtectedTablesCompared:st.size,
  originalFkIndexesVerified:FK_INDEXES.length,originalSupabaseHistoryPresent:true,
  independentRestoreTargetStructuralParity:true,
  originalIndexLedgerReconciliationPending:!sm.has(FK_LOOKUP_MIGRATION),
  ...DENIED
 });
}
const QUERIES=Object.freeze([
 "SELECT name,sha256 FROM public.fiscal_schema_migrations ORDER BY name",
 "SELECT c.relname AS name,c.relrowsecurity AS rls FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'fiscal_%' ORDER BY c.relname",
 "SELECT indexname,indexdef FROM pg_catalog.pg_indexes WHERE schemaname='public' AND indexname=ANY($1::text[]) ORDER BY indexname",
 "SELECT version,name FROM supabase_migrations.schema_migrations WHERE version=$1"
]);

/** All queries run inside a bounded read-only repeatable-read transaction. */
export async function readFiscalRestoreMetadata(client){
 let started=false;
 try{
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");started=true;
  await client.query("SET LOCAL statement_timeout = '5000ms'");
  const ledger=(await client.query(QUERIES[0])).rows;
  const tables=(await client.query(QUERIES[1])).rows;
  const indexes=(await client.query(QUERIES[2],[FK_INDEXES.map(x=>x.name)])).rows;
  const history=(await client.query(QUERIES[3],[ORIGINAL_INDEX_HISTORY.version])).rows;
  await client.query("COMMIT");started=false;
  return {ledger,tables,indexes,history};
 }finally{
  if(started)await client.query("ROLLBACK").catch(()=>{});
 }
}
async function main(){
 if(process.argv.length!==2)fail("NO_CLI_ARGUMENTS");
 const config=validateRestoreParityContext({
  sourceUrl:process.env.FISCAL_DATABASE_URL,
  targetUrl:process.env.FISCAL_RESTORE_TARGET_URL,
  targetProjectRef:process.env.FISCAL_RESTORE_TARGET_PROJECT_REF,
  mode:process.env.FISCAL_RESTORE_INSPECTION_MODE,
  marketplaceUrls:[process.env.DATABASE_URL,process.env.POSTGRES_URL]
 });
 const {default:pg}=await import("pg");
 const source=new pg.Client({connectionString:process.env.FISCAL_DATABASE_URL,connectionTimeoutMillis:5000,application_name:"fiscal-m51-source-readonly"});
 const restored=new pg.Client({connectionString:process.env.FISCAL_RESTORE_TARGET_URL,connectionTimeoutMillis:5000,application_name:"fiscal-m51-restore-readonly"});
 try{
  await source.connect();await restored.connect();
  const [live,clone]=[await readFiscalRestoreMetadata(source),await readFiscalRestoreMetadata(restored)];
  console.log(JSON.stringify({...config,...compareFiscalRestoreMetadata(live,clone)}));
 }finally{await source.end().catch(()=>{});await restored.end().catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(e=>{
  const code=e instanceof Error&&/^FISCAL_M51_[A-Z_]+$/.test(e.message)?e.message:"FISCAL_M51_INSPECTION_FAILED";
  console.error(code);process.exitCode=1;
 });
