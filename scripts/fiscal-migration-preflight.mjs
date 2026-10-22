/** M48: fail closed on dual-migration-ledger drift before ANY schema write. */
import {classifyFiscalMigrations} from "./fiscal-migration-readiness.mjs";

export const FK_LOOKUP_MIGRATION="0014_fk_lookup_indexes.sql";
export const FK_INDEXES=Object.freeze([
 ["fiscal_api_clients_created_by_idx","fiscal_api_clients","created_by"],
 ["fiscal_counterparties_created_by_idx","fiscal_counterparties","created_by"],
 ["fiscal_marketplace_challenges_created_by_idx","fiscal_marketplace_link_challenges","created_by"],
 ["fiscal_marketplace_links_authorized_by_idx","fiscal_marketplace_links","authorized_by"],
 ["fiscal_organizations_reviewed_by_idx","fiscal_organizations","reviewed_by"],
 ["fiscal_sandbox_journals_created_by_idx","fiscal_sandbox_journals","created_by"],
 ["fiscal_tax_rule_candidates_source_code_idx","fiscal_tax_rule_candidates","source_code"]
].map(([name,table,column])=>Object.freeze({
 name,definition:`CREATE INDEX ${name} ON public.${table} USING btree (${column})`
})));
export const GUARDED_SECURITY_MIGRATIONS=Object.freeze([
 {name:"0018_governed_mfa_recovery.sql",table:"fiscal_mfa_recovery_cases"},
 {name:"0019_security_alert_outbox.sql",table:"fiscal_security_alert_outbox"},
 {name:"0020_security_alert_delivery_receipts.sql",table:"fiscal_security_alert_delivery_events"},
 {name:"0021_security_alert_reconciliation.sql",table:"fiscal_security_alert_reconciliation"}
].map(Object.freeze));

/** Pure, sanitized preflight policy; not evidence of certification or backup. */
export function evaluateFiscalMigrationPreflight({expected,recorded,indexes=[],objects=[]}){
 const plan=classifyFiscalMigrations(expected,recorded);
 if(plan.drift)throw new Error("FISCAL_M48_CHECKSUM_OR_UNKNOWN_MIGRATION");
 const observed=new Map();
 for(const row of indexes){
  if(typeof row.indexname!=="string"||typeof row.indexdef!=="string"||observed.has(row.indexname))
   throw new Error("FISCAL_M48_INVALID_CATALOG");
  observed.set(row.indexname,row.indexdef.replace(/\s+/g," ").trim());
 }
 const tracked=new Set(recorded.map(row=>row.name));
 const matching=FK_INDEXES.filter(x=>observed.get(x.name)===x.definition).length;
 const present=FK_INDEXES.filter(x=>observed.has(x.name)).length;
 if(matching!==present)throw new Error("FISCAL_M48_INDEX_DEFINITION_DRIFT");
 if(present&&!tracked.has(FK_LOOKUP_MIGRATION))
  throw new Error("FISCAL_M48_EXTERNALLY_APPLIED_FK_MIGRATION");
 if(tracked.has(FK_LOOKUP_MIGRATION)&&present!==FK_INDEXES.length)
  throw new Error("FISCAL_M48_TRACKED_INDEXES_MISSING");
 const materialized=new Set(objects);
 for(const {name,table} of GUARDED_SECURITY_MIGRATIONS){
  const ledgerHas=tracked.has(name),schemaHas=materialized.has(table);
  if(schemaHas&&!ledgerHas)throw new Error("FISCAL_M48_EXTERNALLY_APPLIED_SECURITY_SCHEMA");
  if(ledgerHas&&!schemaHas)throw new Error("FISCAL_M48_TRACKED_SECURITY_SCHEMA_MISSING");
 }
 return Object.freeze({kind:"fiscal_migration_write_preflight",safeToStart:true,
  pendingCount:plan.pending.length,checksumDrift:false});
}

/** Read catalog metadata only; caller holds exclusive migration advisory lock. */
export async function assertSafeFiscalMigrationPreflight(db,expected){
 const registry=await db.query("SELECT to_regclass('public.fiscal_schema_migrations') IS NOT NULL AS exists");
 const ledgerExists=registry.rows[0]?.exists===true;
 const recorded=ledgerExists
  ?(await db.query("SELECT name,sha256 FROM public.fiscal_schema_migrations ORDER BY name")).rows:[];
 if(!ledgerExists){
  const existing=await db.query("SELECT COUNT(*)::int AS n FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'fiscal_%'");
  if(existing.rows[0]?.n!==0)throw new Error("FISCAL_M48_UNTRACKED_EXISTING_SCHEMA");
 }
 const indexes=(await db.query(
  "SELECT indexname,indexdef FROM pg_catalog.pg_indexes WHERE schemaname=$1 AND indexname=ANY($2::text[])",
  ["public",FK_INDEXES.map(x=>x.name)])).rows;
 const present=(await db.query(
  "SELECT relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY($1::text[])",
  [GUARDED_SECURITY_MIGRATIONS.map(x=>x.table)])).rows.map(x=>x.relname);
 return evaluateFiscalMigrationPreflight({expected,recorded,indexes,objects:present});
}