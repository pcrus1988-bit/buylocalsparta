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
      "SELECT EXISTS(SELECT 1 FROM fiscal_schema_migrations WHERE name='0012_secure_trigger_function_paths.sql') "+
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
  }catch(error){
    // Log only a whitelisted error category. Never log DSNs, usernames,
    // database hostnames, credentials, query arguments or raw error messages.
    const code=error&&typeof error==="object"&&"code" in error
      &&typeof error.code==="string"?error.code:"";
    const categories:Record<string,string>={
      "28P01":"authentication_rejected",
      "3D000":"database_missing",
      "42501":"database_privilege_denied",
      "42P01":"schema_missing",
      "ECONNREFUSED":"network_refused",
      "ETIMEDOUT":"network_timeout",
      "ENOTFOUND":"dns_resolution",
      "EAI_AGAIN":"dns_resolution",
      "08P01":"pooler_protocol_error",
      "57P03":"database_unavailable",
      "ERR_TLS_CERT_ALTNAME_INVALID":"tls_certificate_mismatch",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE":"tls_validation_failed",
      "SELF_SIGNED_CERT_IN_CHAIN":"tls_validation_failed"
    };
    console.error("FISCAL_HEALTH_POSTGRES_FAILURE",categories[code]??"unclassified");
    return Response.json({service:"konta-moy-fiscal",state:"database_unreachable",issuanceEnabled:false},{status:503,headers});
  }
}
