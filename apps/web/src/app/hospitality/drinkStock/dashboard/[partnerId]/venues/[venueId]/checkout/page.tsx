import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {hospitalityIdentity} from "../../../../../../../../lib/hospitality-partner-access";
import {drinkStockVenueCheckoutReadiness} from "../../../../../../../../lib/drinkstock-checkout-readiness-service";
import {SessionError} from "../../../../../../../../lib/drinkstock-session-service";
import styles from "../../../../../../hospitality.module.css";
import {DrinkStockStandardTaxReview} from "../../../../../../../../components/DrinkStockStandardTaxReview";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DrinkStock · Checkout activation",robots:{index:false,follow:false}};

export default async function VenueCheckoutReadinessPage({params}:{
 params:Promise<{partnerId:string;venueId:string}>
}){
 const principal=await hospitalityIdentity();
 if(!principal)redirect("/drinkStock/login");
 const {partnerId,venueId}=await params;
 let status;
 try{status=await drinkStockVenueCheckoutReadiness(principal.userId,partnerId,venueId);}
 catch(error){
  if(error instanceof SessionError&&[403,404].includes(error.status))notFound();
  return <main className={styles.main}><section className={styles.authPane}>
   <h1>Checkout readiness unavailable</h1><p>Activation information could not be verified. Payments remain disabled.</p>
  </section></main>;
 }
 const good=status.checks.filter(c=>c.ready),pending=status.checks.filter(c=>!c.ready);
 return <main className={styles.main}>
  <section className={styles.authPane} style={{maxWidth:1000}}>
   <p><Link href={`/drinkStock/dashboard/${partnerId}/venues/${venueId}`}>← Trading Floor</Link></p>
   <span className={styles.eyebrow}>DRINKSTOCK / CHECKOUT</span>
   <h1>Payment activation · {status.venueName}</h1>
   <p>This POS-unavailable fallback uses KONTA MOY's existing Mollie and AADE infrastructure. The correct legal seller, venue settlement arrangement and certified Greek retail-receipt issuer still require verification. The administrator's entitlement alone cannot authorize a charge.</p>
   <div role="status" style={{padding:18,margin:"20px 0",borderRadius:15,border:"1px solid #ffba83",background:"#2b1d20"}}>
    <strong style={{color:"#ffdc93"}}>Guest checkout is not activated</strong>
    <p style={{marginBottom:0}}>Readiness: {status.readyCount} of {status.totalCount} checks satisfied.
     Customers can view a temporary price estimate but cannot submit a paid order.</p>
   </div>
   {status.canReviewVat&&<DrinkStockStandardTaxReview
    partnerId={partnerId} venueId={venueId} csrfToken={principal.csrfToken}
    alreadyConfirmed={status.standardVatJurisdictionReviewed}/>}
   {status.paidOrdersAwaitingFiscalResolution>0&&<div role="alert" style={{padding:18,border:"2px solid #f29973",borderRadius:15,background:"#4b2724",margin:"20px 0"}}>
    <strong>Fiscal exception: {status.paidOrdersAwaitingFiscalResolution} verified paid orders awaiting a legal receipt</strong>
    <p>These orders have not been released to bar preparation. Inspect the merchant's fiscal issuer and resolve the receipt or refund through an authorized workflow. Do not mark them served manually.</p>
   </div>}
   <h2>Shared KONTA MOY provider connections</h2>
   <p>The existing KONTA MOY Mollie collection and AADE/myDATA infrastructure serves the fallback.
    Venue owners do not create independent provider accounts or submit tax credentials.
    Receipt issuer liability and settlement remain separately subject to verified legal authorization.</p>
   <p><Link href={`/drinkStock/dashboard/${partnerId}/payments`}>View shared Mollie &amp; AADE status ↗</Link></p>
   <h2>Verified readiness</h2>
   <div style={{display:"grid",gap:10}}>
    {good.map(check=><div key={check.code} style={{border:"1px solid #355d53",borderRadius:12,padding:14}}>
     <strong>✓ {check.label}</strong></div>)}
   </div>
   <h2 style={{marginTop:28}}>Remaining activation requirements</h2>
   <div style={{display:"grid",gap:10}}>
    {pending.map(check=><div key={check.code} style={{border:"1px solid #b17368",borderRadius:12,padding:14}}>
     <strong>○ {check.label}</strong><p style={{margin:"6px 0 0",fontSize:13,opacity:.85}}>{check.code}</p></div>)}
   </div>
   <p style={{marginTop:24}}>Active catalogue drinks: {status.activeProductCount}.
    Drinks still needing VAT review: {status.productsNeedingVatReview}.
    Market session: {status.sessionTrading?"trading":"not trading"}.</p>
   {status.canReviewVat&&<p><Link href={`/drinkStock/dashboard/${partnerId}/venues/${venueId}/checkout/vat-review`}
     style={{display:"inline-block",padding:"12px 16px",borderRadius:11,background:"#d9ff57",color:"#142132",fontWeight:800,textDecoration:"none"}}>
     Review drink VAT classifications ↗
   </Link></p>}
   {status.canReviewVat&&<p><Link href={`/drinkStock/dashboard/${partnerId}/payments`}
    style={{display:"inline-block",padding:"12px 16px",borderRadius:11,background:"#b9e9ff",color:"#142132",fontWeight:800,textDecoration:"none"}}>
    KONTA MOY fallback Mollie & AADE status ↗
   </Link></p>}
   <p><Link href={`/drinkStock/dashboard/${partnerId}/venues/${venueId}/integrations`}>View POS integration options ↗</Link></p>
   <p style={{fontSize:13,opacity:.8}}>No payment credentials, bank payout details or fiscal provider secrets are displayed here. Operational adapter checks cannot be approved by the venue or switched on through this page.</p>
  </section>
 </main>;
}
