"use client";
import {useCallback,useEffect,useState} from "react";
type Pending={id:string;email:string;bar:boolean;waiter:boolean;expiresAt:string;createdAt:string};
export function DrinkStockStaffInvitations({partnerId,venueId,csrfToken}:{
 partnerId:string;venueId:string;csrfToken:string;
}){
 const endpoint=`/api/hospitality/partners/${partnerId}/venues/${venueId}/staff-invites`;
 const [email,setEmail]=useState("");
 const [bar,setBar]=useState(true),[waiter,setWaiter]=useState(false);
 const [pending,setPending]=useState<Pending[]>([]);
 const [createdLink,setCreatedLink]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  const r=await fetch(endpoint,{cache:"no-store",credentials:"same-origin"});
  const j=await r.json() as {invitations?:Pending[];error?:string};
  if(!r.ok)throw new Error(j.error??"INVITES_UNAVAILABLE");
  setPending(j.invitations??[]);
 },[endpoint]);
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:"INVITES_UNAVAILABLE"));},[refresh]);
 async function create(){
  if(busy||!email.trim()||!(bar||waiter))return;
  setBusy(true);setCreatedLink("");setNotice("");setError("");
  try{
   const response=await fetch(endpoint,{method:"POST",cache:"no-store",credentials:"same-origin",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({operation:"create",email:email.trim(),bar,waiter,requestKey:crypto.randomUUID()})
   });
   const data=await response.json() as {error?:string;invitePath?:string|null;replayed?:boolean};
   if(!response.ok)throw new Error(data.error??"INVITE_CREATE_FAILED");
   if(data.invitePath)setCreatedLink(window.location.origin+data.invitePath);
   setNotice("Staff invitation generated. Share the private link with the invited person directly. No email was sent.");
   setEmail("");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"INVITE_CREATE_FAILED");}
  finally{setBusy(false);}
 }
 async function revoke(invitation:Pending){
  if(busy)return;
  if(!window.confirm(`Revoke the pending invitation for ${invitation.email}?`))return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch(endpoint,{method:"POST",cache:"no-store",credentials:"same-origin",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({operation:"revoke",invitationId:invitation.id})
   });
   const data=await response.json() as {error?:string};
   if(!response.ok)throw new Error(data.error??"INVITE_REVOKE_FAILED");
   setNotice("Invitation revoked. Its link can no longer be accepted.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"INVITE_REVOKE_FAILED");}
  finally{setBusy(false);}
 }
 const input={padding:"11px 13px",borderRadius:10,border:"1px solid #8c9aaf",color:"#131c30",background:"#fff"} as const;
 return <section aria-label="Venue staff invitations" style={{margin:"20px 0",padding:"18px clamp(12px,3vw,24px)",
  border:"1px solid #8a758a",borderRadius:16,background:"#1e243a"}}>
  <h3 style={{margin:"2px 0 8px",fontSize:22,color:"#d9ff57"}}>Invite bartender / waiter</h3>
  <p style={{fontSize:13,color:"#c4cada",lineHeight:1.65}}>
   No manual account setup. Create a seven-day invitation for a specific email; send the
   private link directly to your team member. They sign in or register, verify the email,
   and claim only this venue's selected stations. No automatic email is sent.
  </p>
  <div style={{display:"grid",gridTemplateColumns:"minmax(170px,1fr) auto",alignItems:"end",gap:10,margin:"17px 0 12px"}}>
   <label style={{fontSize:12,display:"grid",gap:7}}>STAFF EMAIL
    <input type="email" autoComplete="off" value={email} maxLength={254} disabled={busy}
     onChange={e=>setEmail(e.target.value)} placeholder="staff@example.gr" style={input}/>
   </label>
   <button type="button" disabled={busy||!email.trim()||!(bar||waiter)} onClick={()=>void create()}
    style={{padding:"12px 17px",borderRadius:10,background:"#d9ff57",color:"#132136",fontWeight:900,border:0}}>
    {busy?"Working…":"CREATE INVITE ↗"}
   </button>
  </div>
  <div style={{display:"flex",flexWrap:"wrap",gap:20,marginBottom:10}}>
   <label><input type="checkbox" checked={bar} disabled={busy} onChange={e=>setBar(e.target.checked)}/> 🍸 Bar</label>
   <label><input type="checkbox" checked={waiter} disabled={busy} onChange={e=>setWaiter(e.target.checked)}/> 🛎 Waiter</label>
  </div>
  {createdLink&&<div style={{padding:14,background:"#d9ff5717",border:"1px solid #d9ff57",borderRadius:12}}>
   <strong>Copy this one-time invitation link now:</strong>
   <p style={{overflowWrap:"anywhere",fontSize:12}}>{createdLink}</p>
   <button type="button" onClick={()=>void navigator.clipboard.writeText(createdLink)
    .then(()=>setNotice("Invitation link copied. Share it privately."))
    .catch(()=>setError("Clipboard unavailable; select and copy the link shown above."))}
    style={{padding:"10px 15px",borderRadius:10,background:"#d9ff57",fontWeight:900,border:0}}>
    COPY STAFF LINK
   </button>
   <p style={{fontSize:11,color:"#bccadb"}}>The link is shown only now; its token is stored as a hash.</p>
  </div>}
  {error&&<p role="alert" style={{color:"#ffb2b2"}}>Staff onboarding: {error}</p>}
  {notice&&<p role="status" style={{color:"#d9ff57"}}>{notice}</p>}
  <h4 style={{margin:"20px 0 10px",fontSize:15}}>Pending invitations ({pending.length})</h4>
  {!pending.length?<p style={{fontSize:12,color:"#adb9c9"}}>No pending invitations for this venue.</p>:
   <div style={{display:"grid",gap:8}}>{pending.map(inv=><div key={inv.id}
    style={{display:"flex",gap:12,justifyContent:"space-between",flexWrap:"wrap",alignItems:"center",
     padding:11,borderRadius:10,background:"#ffffff0c"}}>
    <span style={{overflowWrap:"anywhere",fontSize:12}}>
     <strong>{inv.email}</strong>
     <small style={{display:"block",color:"#bbc9d4",marginTop:4}}>
      {[inv.bar?"Bar":null,inv.waiter?"Waiter":null].filter(Boolean).join(" + ")} ·
      Expires {new Date(inv.expiresAt).toLocaleDateString("el-GR")}
     </small>
    </span>
    <button type="button" disabled={busy} onClick={()=>void revoke(inv)}
     style={{background:"transparent",color:"#ffd4d4",border:"1px solid #c98585",borderRadius:9,padding:"8px 11px",fontWeight:800}}>
     Revoke
    </button>
   </div>)}</div>}
 </section>;
}
