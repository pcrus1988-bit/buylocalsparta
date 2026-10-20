import type {Metadata} from "next";
import Link from "next/link";
import {hospitalityIdentity} from "../../../../../../lib/hospitality-partner-access";
import {DrinkStockStaffInviteClaim} from "../../../../../../components/DrinkStockStaffInviteClaim";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DrinkStock · Staff Invitation",robots:{index:false,follow:false}};
export default async function DrinkStockStaffInvitation({params}:{
 params:Promise<{token:string}>
}){
 const {token}=await params;
 const user=await hospitalityIdentity();
 const valid=/^[A-Za-z0-9_-]{43}$/.test(token);
 return <main style={{background:"#101323",color:"#fff",minHeight:"100vh",padding:"clamp(25px,5vw,60px)"}}>
  <meta name="referrer" content="no-referrer"/>
  <section style={{maxWidth:660,margin:"25px auto",padding:"clamp(22px,4vw,40px)",
   borderRadius:20,background:"#1c2840",border:"1px solid #63718b"}}>
   <p style={{letterSpacing:2.6,color:"#d9ff57",fontWeight:900,fontSize:11}}>DRINKSTOCK / PRIVATE STAFF ONBOARDING</p>
   <h1 style={{fontSize:"clamp(28px,4vw,40px)",margin:"10px 0"}}>🍸 Join your venue team</h1>
   <p style={{fontSize:15,lineHeight:1.7,color:"#e0e4ee"}}>
    You have been invited to work on a hospitality venue's bar or waiter station.
    Your invitation can be accepted only by the KONTA MOY account with the exact
    email chosen by the manager. It expires after seven days and can be revoked at any time.
   </p>
   {!valid?<p role="alert">Invalid invitation address.</p>:
    user?<DrinkStockStaffInviteClaim token={token} csrfToken={user.csrfToken}/>:
    <div style={{display:"grid",gap:12,marginTop:18}}>
     <strong>Step 1 · Sign in using the invited email address.</strong>
     <p style={{fontSize:13,color:"#c9d1df"}}>If you do not have a KONTA MOY customer account, register and verify your email first. Then open this invitation link again to accept.</p>
     <Link rel="noreferrer" href="/login" style={{background:"#d9ff57",color:"#142132",fontWeight:900,padding:13,borderRadius:11,textAlign:"center"}}>SIGN IN TO KONTA MOY ↗</Link>
     <Link rel="noreferrer" href="/register" style={{color:"#fff",border:"1px solid #afbdd3",padding:13,borderRadius:11,textAlign:"center"}}>CREATE A VERIFIED ACCOUNT ↗</Link>
    </div>}
   <p style={{color:"#a6afc4",fontSize:12,marginTop:30}}>
    This is a station access invitation, not a payment link. Never share this invitation publicly.
   </p>
  </section>
 </main>;
}
