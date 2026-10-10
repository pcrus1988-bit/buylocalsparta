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
    await fiscalPool().query("SELECT 1 AS healthy");
    return Response.json({service:"konta-moy-fiscal",state:"operational_foundation",issuanceEnabled:false},{headers});
  }catch{
    return Response.json({service:"konta-moy-fiscal",state:"database_unreachable",issuanceEnabled:false},{status:503,headers});
  }
}
