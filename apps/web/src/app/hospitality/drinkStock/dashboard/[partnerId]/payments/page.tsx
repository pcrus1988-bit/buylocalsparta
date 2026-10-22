import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {hospitalityIdentity} from "../../../../../../lib/hospitality-partner-access";
import {PlatformFallbackError,platformFallbackDiagnostics} from "../../../../../../lib/drinkstock-platform-fallback-provider";
import styles from "../../../../hospitality.module.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DrinkStock · KONTA MOY Checkout Fallback",robots:{index:false,follow:false}};

export default async function SharedFallbackPaymentsPage({params}:{params:Promise<{partnerId:string}>}){
 const principal=await hospitalityIdentity();
 if(!principal)redirect("/drinkStock/login");
 const {partnerId}=await params;
 let info;
 try{info=await platformFallbackDiagnostics(principal.userId,partnerId);}
 catch(e){
  if(e instanceof PlatformFallbackError&&[403,404].includes(e.status))notFound();
  return <main className={styles.main}><section className={styles.authPane}>
   <h1>Checkout status unavailable</h1><p>Guest payments remain disabled. No funds were collected.</p>
  </section></main>;
 }
 return <main className={styles.main}>
  <section className={styles.authPane} style={{maxWidth:920}}>
   <p><Link href={`/drinkStock/dashboard/${partnerId}`}>← Partner dashboard</Link></p>
   <span className={styles.eyebrow}>DRINKSTOCK / POS FALLBACK</span>
   <h1>KONTA MOY Checkout · {info.partnerName}</h1>
   <p>No separate Mollie account or AADE credentials are required from this hospitality partner.
    DrinkStock's POS fallback is designed to use KONTA MOY's existing payment and AADE connectivity.</p>
   <div role="status" style={{borderRadius:14,border:"1px solid #f8bd8a",background:"#2f222b",padding:18,margin:"18px 0"}}>
    <strong>Guest payment collection not yet enabled</strong>
    <p>Administrative fallback approval: {info.adminApproved?"Granted":"Not granted"}.
     The platform must verify the legal seller, settlement model and certified receipt issuer
     before charging a table guest.</p>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:14}}>
    <section style={{border:"1px solid #667f92",borderRadius:13,padding:16}}>
     <h2>💳 Mollie</h2>
     <p>Account: <strong>{info.mollie.account}</strong></p>
     <p>Existing integration: {info.mollie.configured?"Configured":"Unavailable"}.</p>
     <p>Live provider connectivity: {info.mollie.liveReady?"Verified":"Not verified"}.</p>
     <small>No partner Mollie Connect authorization needed for this fallback.</small>
    </section>
    <section style={{border:"1px solid #667f92",borderRadius:13,padding:16}}>
     <h2>🧾 AADE / myDATA</h2>
     <p>Integration: <strong>{info.aade.account}</strong></p>
     <p>Existing credentials: {info.aade.configured?"Configured":"Unavailable"}.</p>
     <p>Direct ERP readiness: {info.aade.directErpReady?"Ready":"Not verified"}.</p>
     <p>Certified retail receipts: {info.aade.retailReceiptIssuerVerified?"Verified":"Pending"}.</p>
    </section>
   </div>
   <h2 style={{marginTop:28}}>Remaining operational checks</h2>
   <ul>{info.remaining.map(item=><li key={item} style={{marginBottom:12}}>{item}</li>)}</ul>
   <p style={{fontSize:13,opacity:.8}}>KONTA MOY's AADE tax identity may issue only transactions for which it is the authorized legal issuer.
    Technical access alone does not make it the seller of the bar's drinks. No owner-issued
    certificate or unverified market simulation may bypass this rule.</p>
  </section>
 </main>;
}
