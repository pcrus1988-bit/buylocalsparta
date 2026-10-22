import {fiscalDatabaseConfigured,fiscalPool} from "./fiscal-runtime";
import type {PoolClient} from "pg";
import {MARKERS,FK_INDEXES,UNKNOWN,classifyFiscalLiveReadiness} from "./fiscal-live-migration-policy";
import type {FiscalLiveReadiness} from "./fiscal-live-migration-policy";
export type {FiscalLiveReadiness} from "./fiscal-live-migration-policy";
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