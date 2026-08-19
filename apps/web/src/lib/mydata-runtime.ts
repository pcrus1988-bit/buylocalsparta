import { myDataConfigured, myDataConfigFromEnv, myDataIssuanceEnabled } from "@buy-local-sparta/aade-mydata";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export function myDataReadiness(){
  const erpIssuanceEnabled=myDataIssuanceEnabled(process.env);
  if(!myDataConfigured(process.env))return{enabled:false,ready:true,message:"AADE myDATA read/reconciliation is not configured; timologio remains the fiscal issuance channel"};
  try{
    const config=myDataConfigFromEnv(process.env);
    if(!process.env.DATABASE_URL?.trim())return{enabled:erpIssuanceEnabled,ready:false,message:"AADE myDATA reconciliation requires PostgreSQL"};
    if(!getProductionPostgresRuntime().myData)return{enabled:erpIssuanceEnabled,ready:false,message:"AADE myDATA runtime is not initialized"};
    if(erpIssuanceEnabled&&!process.env.BLS_MYDATA_MAPPING_VERSION?.trim())return{enabled:true,ready:false,message:"BLS_MYDATA_MAPPING_VERSION is required before direct ERP issuance can be enabled"};
    return{enabled:erpIssuanceEnabled,ready:true,environment:config.environment,specVersion:config.specVersion,message:erpIssuanceEnabled?"AADE ERP transmission is explicitly enabled with deployment-controlled mapping":"AADE read/reconciliation is configured; issuance channel is timologio and direct ERP SendInvoices is gated"};
  }catch(error){return{enabled:erpIssuanceEnabled,ready:false,message:error instanceof Error?error.message:String(error)}}
}
