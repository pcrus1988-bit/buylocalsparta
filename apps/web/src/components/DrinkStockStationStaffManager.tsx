"use client";
import {useEffect,useState} from "react";
import type {StationStaffMember} from "../lib/drinkstock-station-access-service";
import type {DrinkStockStation} from "../lib/drinkstock-station-policy";
type Directory={members:StationStaffMember[];error?:string};
export function DrinkStockStationStaffManager({partnerId,venueId,csrfToken}:{
 partnerId:string;venueId:string;csrfToken:string
}){
 const endpoint=`/api/hospitality/partners/${partnerId}/venues/${venueId}/stations`;
 const [members,setMembers]=useState<StationStaffMember[]|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState("");
 const [notice,setNotice]=useState("");
 useEffect(()=>{
  let active=true;
  fetch(endpoint,{credentials:"same-origin",cache:"no-store"})
   .then(async r=>{const x=await r.json() as Directory;if(!r.ok)throw new Error(x.error??"UNAVAILABLE");return x;})
   .then(x=>{if(active)setMembers(x.members);})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:"UNAVAILABLE");});
  return ()=>{active=false;};
 },[endpoint]);
 async function update(target:StationStaffMember,station:DrinkStockStation){
  if(busy)return;
  const enabled=!target[station];
  if(!enabled&&!window.confirm(`Revoke ${station} station access for ${target.label} at this venue?`))return;
  setBusy(target.userId+station);setError("");setNotice("");
  try{
   const resp=await fetch(endpoint,{method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({targetUserId:target.userId,station,enabled,requestKey:crypto.randomUUID()})
   });
   const result=await resp.json() as {error?:string};
   if(!resp.ok)throw new Error(result.error??"UPDATE_NOT_CONFIRMED");
   const list=await fetch(endpoint,{credentials:"same-origin",cache:"no-store"});
   if(!list.ok)throw new Error("DIRECTORY_REFRESH_FAILED");
   setMembers((await list.json() as Directory).members);
   setNotice(`${target.label}: ${station} access ${enabled?"granted":"revoked"}.`);
  }catch(e){setError(e instanceof Error?e.message:"UPDATE_NOT_CONFIRMED");}
  finally{setBusy("");}
 }
 const root=`/drinkstock/dashboard/${partnerId}/venues/${venueId}`;
 return <section style={{maxWidth:1280,margin:"24px auto",padding:"18px clamp(14px,3vw,26px)",
  color:"#fff",background:"linear-gradient(125deg,#19253a,#261b37)",
  border:"1px solid #657381",borderRadius:21}}>
  <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:15}}>
   <div>
    <p style={{color:"#d9ff57",fontSize:11,fontWeight:900,letterSpacing:2.5}}>STAFF ACCESS / VENUE</p>
    <h2 style={{fontSize:26,margin:"5px 0"}}>🍸 Bar & 🛎 waiter stations</h2>
    <p style={{color:"#c3c9d3",lineHeight:1.6,fontSize:13,maxWidth:630}}>
     Assign registered venue staff to one or both stations. Owners and managers have full access.
     Station permissions are server-checked for every ticket read and update, and every change is audited.
    </p>
   </div>
   <nav style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
    <a href={root+"/bar"} style={{padding:"10px 12px",border:"1px solid #d9ff57",borderRadius:10,color:"#d9ff57"}}>Open bar board ↗</a>
    <a href={root+"/waiters"} style={{padding:"10px 12px",border:"1px solid #d9ff57",borderRadius:10,color:"#d9ff57"}}>Open waiter board ↗</a>
   </nav>
  </div>
  {error&&<p role="alert" style={{padding:12,color:"#ffc3c3",background:"#57262b",borderRadius:9}}>Station access status: {error}</p>}
  {notice&&<p role="status" style={{color:"#d9ff57"}}>{notice}</p>}
  {members===null?<p role="status">Loading staff station assignments…</p>:
   !members.length?<p style={{padding:16,background:"#ffffff09",borderRadius:12}}>
    No active staff member is registered for this Hospitality partner yet.
    Add a staff membership before assigning bar or waiter permissions.
   </p>:
   <div style={{display:"grid",gap:9,marginTop:15}}>
    <div style={{display:"grid",gridTemplateColumns:"minmax(90px,1fr) 95px 95px",gap:9,
      padding:"8px 14px",fontSize:12,color:"#adb4c4"}}>
     <span>STAFF MEMBER</span><span>BAR</span><span>WAITER</span>
    </div>
    {members.map(member=><div key={member.userId}
     style={{display:"grid",gridTemplateColumns:"minmax(90px,1fr) 95px 95px",gap:9,
      padding:"13px 14px",background:"#ffffff0e",borderRadius:12,alignItems:"center"}}>
     <strong style={{minWidth:0,overflowWrap:"anywhere",fontSize:13}}>{member.label}</strong>
     {(["bar","waiter"] as const).map(station=><label key={station}
       style={{display:"flex",alignItems:"center",gap:8,fontSize:12,cursor:"pointer"}}>
       <input type="checkbox" aria-label={`Assign ${member.label} to ${station}`}
        checked={member[station]} disabled={Boolean(busy)}
        onChange={()=>void update(member,station)}/>
       {member[station]?"On":"Off"}
     </label>)}
    </div>)}
   </div>}
  <small style={{display:"block",marginTop:13,color:"#b4bbca"}}>
   This module does not create staff identities or activate payment processing.
   Only provider-confirmed orders appear on operational boards.
  </small>
 </section>;
}
