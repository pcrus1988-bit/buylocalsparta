import {fiscalDatabaseConfigured,fiscalPool} from "./fiscal-runtime";
import type {PoolClient} from "pg";

/** M48: authenticated-admin read-only metadata, not backup or issuance certification. */
const MARKERS=[
 "0014_fk_lookup_indexes.sql",
 "0018_governed_mfa_recovery.sql",
 "0019_security_alert_outbox.sql",
 "0020_security_alert_delivery_receipts.sql",
 "0021_security_alert_reconciliation.sql"
] as const;
const FK_INDEXES=[
 "fiscal_api_clients_created_by_idx","fiscal_counterparties_created_by_idx",
 "fiscal_marketplace_challenges_created_by_idx","fiscal_marketplace_links_authorized_by_idx",
 "fiscal_organizations_reviewed_by_idx","fiscal_sandbox_journals_created_by_idx",
 "fiscal_tax_rule_candidates_source_code_idx"
] as const;
type ProbeRow=Readonly<{
 total_migrations:number;present_markers:string[]|null;existing_fk_indexes:string[]|null;
 active_superadmin_factors:number;fiscal_tables:number;unprotected_tables:number;
}>;
export type FiscalLiveReadiness=Readonly<{
 verified:boolean;migrationCount:number|null;missingKnownMigrations:readonly string[];
 fkIndexDrift:boolean;fkInstalledIndexes:number|null;activeSuperAdminFactors:number|null;
 fiscalTables:number|null;unprotectedTables:number|null;
 productionBackupRestoredAndVerified:false;issuanceAuthorized:false;
}>;
const UNKNOWN: FiscalLiveReadiness=Object.freeze({
 verified:false,migrationCount:null,missingKnownMigrations:Object.freeze([...MARKERS]),
 fkIndexDrift:true,fkInstalledIndexes:null,activeSuperAdminFactors:null,
 fiscalTables:null,unprotectedTables:null,
 productionBackupRestoredAndVerified:false,issuanceAuthorized:false
});

export function classifyFiscalLiveReadiness(raw:ProbeRow|null):FiscalLiveReadiness{
 if(!raw || !Number.isSafeInteger(raw.total_migrations) || raw.total_migrations<0 ||
    !Number.isSafeInteger(raw.active_superadmin_factors) || raw.active_superadmin_factors<0 ||
    !Number.isSafeInteger(raw.fiscal_tables) || raw.fiscal_tables<0 ||
    !Number.isSafeInteger(raw.unprotected_tables) || raw.unprotected_tables<0 ||
    raw.unprotected_tables>raw.fiscal_tables ||
    !(raw.present_markers===null||Array.isArray(raw.present_markers)) ||
    !(raw.existing_fk_indexes===null||Array.isArray(raw.existing_fk_indexes)) ||
    (raw.present_markers??[]).some(x=>!MARKERS.includes(x as typeof MARKERS[number])) ||
    (raw.existing_fk_indexes??[]).some(x=>!FK_INDEXES.includes(x as typeof FK_INDEXES[number])))return UNKNOWN;
 const applied=new Set(raw.present_markers??[]),indexes=new Set(raw.existing_fk_indexes??[]);
 const missing=MARKERS.filter(n=>!applied.has(n));
 // Physical names cannot attest to exact definitions: the M48 write
 // preflight separately validates the precise PostgreSQL index definitions.
 return Object.freeze({
  verified:true,migrationCount:raw.total_migrations,
  missingKnownMigrations:Object.freeze([...missing]),
  fkIndexDrift:!applied.has("0014_fk_lookup_indexes.sql")&&indexes.size>0,
  fkInstalledIndexes:indexes.size,activeSuperAdminFactors:raw.active_superadmin_factors,
  fiscalTables:raw.fiscal_tables,unprotectedTables:raw.unprotected_tables,
  productionBackupRestoredAndVerified:false,issuanceAuthorized:false
 });
}

const SQL=`SELECT
 (SELECT count(*)::int FROM public.fiscal_schema_migrations) AS total_migrations,
 (SELECT COALESCE(jsonb_agg(name ORDER BY name),'[]'::jsonb) FROM public.fiscal_schema_migrations WHERE name=ANY($1::text[])) AS present_markers,
 (SELECT COALESCE(jsonb_agg(indexname ORDER BY indexname),'[]'::jsonb) FROM pg_catalog.pg_indexes WHERE schemaname='public' AND indexname=ANY($2::text[])) AS existing_fk_indexes,
 (SELECT count(*)::int FROM public.fiscal_operator_mfa_factors WHERE actor_kind='marketplace_super_admin' AND status='active') AS active_superadmin_factors,
 (SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'fiscal_%') AS fiscal_tables,
 (SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'fiscal_%' AND NOT c.relrowsecurity) AS unprotected_tables`;

export async function getFiscalLiveMigrationReadiness():Promise<FiscalLiveReadiness>{
 if(!fiscalDatabaseConfigured())return UNKNOWN;
 let client:PoolClient|undefined;let inTransaction=false;
 try{
  client=await fiscalPool().connect();
  await client.query("BEGIN TRANSACTION READ ONLY");inTransaction=true;
  await client.query("SET LOCAL statement_timeout = '5000ms'");
  const response=await client.query<ProbeRow>(SQL,[[...MARKERS],[...FK_INDEXES]]);
  await client.query("COMMIT");inTransaction=false;
  return classifyFiscalLiveReadiness(response.rows[0]??null);
 }catch{
  if(inTransaction&&client)await client.query("ROLLBACK").catch(()=>{});
  return UNKNOWN;
 }finally{client?.release();}
}