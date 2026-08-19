import { myDataConfigured, myDataConfigFromEnv, myDataIssuanceEnabled } from "@buy-local-sparta/aade-mydata";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export function myDataReadiness(){
  const enabled=myDataIssuanceEnabled(process.env);
  const configured=myDataConfigured(process.env);
  if(!configured)return{enabled,configured:false,ready:!enabled,message:enabled?"AADE myDATA credentials are missing":"AADE myDATA issuance is gated and API credentials are not configured"};
  try{
    const config=myDataConfigFromEnv(process.env);
    if(!enabled)return{enabled:false,configured:true,ready:true,environment:config.environment,specVersion:config.specVersion,message:"AADE myDATA API credentials are configured; invoice issuance remains gated"};
    if(!process.env.BLS_MYDATA_MAPPING_VERSION?.trim())return{enabled:true,configured:true,ready:false,environment:config.environment,specVersion:config.specVersion,message:"BLS_MYDATA_MAPPING_VERSION is required"};
    if(!process.env.DATABASE_URL?.trim())return{enabled:true,configured:true,ready:false,environment:config.environment,specVersion:config.specVersion,message:"AADE myDATA issuance requires PostgreSQL"};
    if(!getProductionPostgresRuntime().myData)return{enabled:true,configured:true,ready:false,environment:config.environment,specVersion:config.specVersion,message:"AADE myDATA runtime is not initialized"};
    return{enabled:true,configured:true,ready:true,environment:config.environment,specVersion:config.specVersion,message:"AADE myDATA ERP transport is configured; accounting mapping is deployment-controlled"};
  }catch(error){return{enabled,configured:true,ready:false,message:error instanceof Error?error.message:String(error)}}
}
