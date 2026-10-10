import {fiscalDatabaseConfigured,fiscalPool} from "../../../../../../../apps/web/src/lib/fiscal-runtime";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
  const headers={"cache-control":"no-store"};
  if(process.env.FISCAL_STANDALONE_MODE!=="true")
    return Response.json({service:"konta-moy-fiscal",state:"not_standalone"},{status:503,headers});
  if(!fiscalDatabaseConfigured())
    return Response.json({service:"konta-moy-fiscal",state:"database_not_provisioned",issuanceEnabled:false},{status:503,headers});
  try{
    // A reachable PostgreSQL server is NOT sufficient for safe operation.
    // Verify the independently applied baseline AND super-admin SSO schema.
    const verified=await fiscalPool().query<{ready:boolean}>(
      "SELECT EXISTS(SELECT 1 FROM fiscal_schema_migrations WHERE name='0011_regulatory_source_atlas.sql') "+
      "AND to_regclass('public.fiscal_document_intakes') IS NOT NULL " +
      "AND to_regclass('public.fiscal_document_intake_lines') IS NOT NULL "+
      "AND to_regclass('public.fiscal_counterparties') IS NOT NULL "+
      "AND to_regclass('public.fiscal_regulatory_sources') IS NOT NULL "+
      "AND to_regclass('public.fiscal_tax_rule_candidates') IS NOT NULL "+
      "AND to_regclass('public.fiscal_marketplace_links') IS NOT NULL "+
      "AND to_regclass('public.fiscal_superadmin_sessions') IS NOT NULL AS ready"
    );
    if(verified.rows[0]?.ready!==true)
      return Response.json({service:"konta-moy-fiscal",state:"schema_not_ready",issuanceEnabled:false},{status:503,headers});
    return Response.json({service:"konta-moy-fiscal",state:"operational_foundation",issuanceEnabled:false},{headers});
  }catch{
    return Response.json({service:"konta-moy-fiscal",state:"database_unreachable",issuanceEnabled:false},{status:503,headers});
  }
}
