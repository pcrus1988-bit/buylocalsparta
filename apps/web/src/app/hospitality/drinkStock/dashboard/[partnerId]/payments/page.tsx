import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {hospitalityIdentity} from "../../../../../../lib/hospitality-partner-access";
import {merchantConnectionsStatus,MerchantConnectionError} from "../../../../../../lib/drinkstock-merchant-connections";
import {DrinkStockAadeConnectForm} from "../../../../../../components/DrinkStockAadeConnectForm";
import styles from "../../../../hospitality.module.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DrinkStock · Mollie & AADE",robots:{index:false,follow:false}};
export default async function MerchantPaymentSettings({params}:{params:Promise<{partnerId:string}>}){
 const principal=await hospitalityIdentity();if(!principal)redirect("/drinkStock/login");
 const {partnerId}=await params;
 let info;
 try{info=await merchantConnectionsStatus(principal.userId,partnerId);}
 catch(e){if(e instanceof MerchantConnectionError&&[403,404].includes(e.status))notFound();
  return <main className={styles.main}><h1>Merchant connections unavailable</h1><p>No checkout payments have been enabled.</p></main>;}
 return <main className={styles.main}><section className={styles.authPane} style={{maxWidth:900}}>
  <p><Link href={`/drinkStock/dashboard/${partnerId}`}>← Partner dashboard</Link></p>
  <span className={styles.eyebrow}>DRINKSTOCK / MERCHANT PROVIDERS</span>
  <h1>Mollie payments & AADE myDATA</h1>
  <p>Merchant-of-record payments and Greek fiscal reporting must belong to this hospitality business.
   KONTA MOY's marketplace PSP and AADE identity are not reused.</p>
  <div role="status" style={{padding:17,border:"1px solid #d9aa72",borderRadius:12,marginBottom:18}}>
   <strong>Guest payments are not active.</strong>
   <p>Connecting a provider is one stage of activation. Certified retail receipt issuance, refunds and
     atomically verified checkout must still be approved and tested.</p>
  </div>
  <h2>Mollie Connect · merchant settlement</h2>
  <p>Connected: {info.mollie.connected?"Yes":"No"}.
   Payments capability: {info.mollie.paymentsCapability}.
   Settlements capability: {info.mollie.settlementsCapability}.
   Profile selected: {info.mollie.profileSelected?"Yes":"No"}.</p>
  {info.mollie.organizationId&&<p>Verified Mollie organization: {info.mollie.organizationId}</p>}
  {info.mollie.appConfigured?
   <p><Link href={`/api/hospitality/partners/${partnerId}/mollie/connect`}
    style={{display:"inline-block",borderRadius:10,background:"#d9ff57",color:"#152026",padding:"12px 18px",fontWeight:850,textDecoration:"none"}}>
     {info.mollie.connected?"Reconnect merchant Mollie account":"Connect with Mollie"} ↗
   </Link></p>:
   <p role="status">Mollie Connect app credentials have not yet been configured on this deployment.
    The platform's shared Mollie API key is not automatically a hospitality merchant connection.</p>}
  <p style={{fontSize:13}}>Mollie authorization uses a time-limited, one-use state; refresh credentials are
    kept in encrypted Supabase Vault. The merchant must pass payment and settlement capability checks.</p>
  <h2 style={{marginTop:30}}>AADE myDATA · merchant reporting</h2>
  <p>Configured: {info.aade.connected?"Yes":"No"}.
   Connectivity: {info.aade.connectivityState}.
   Environment: {info.aade.environment??"—"}.</p>
  {info.aade.issuerVatNumber&&<p>Merchant AFM: {info.aade.issuerVatNumber}</p>}
  <p>Statutory receipt route: {info.aade.fiscalIssuanceRoute.replaceAll("_"," ")}.
   Certified receipt issuer verified: {info.aade.receiptIssuanceVerified?"Yes":"No"}.</p>
  <DrinkStockAadeConnectForm partnerId={partnerId} csrfToken={principal.csrfToken}/>
  <p style={{fontSize:12,opacity:.8}}>MyDATA transmission and FHM/eSEND or licensed-provider receipt issuance are
   separate obligations. These connections cannot override DrinkStock's financial safety gates.</p>
 </section></main>;
}