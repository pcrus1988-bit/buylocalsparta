"use client";
import {useState} from "react";
import type {AdminScreenRow} from "../lib/drinkstock-screen-admin";
export function DrinkStockAdminTvScreens({initial,csrfToken}:{initial:AdminScreenRow[];csrfToken:string}){
 const [screens,setScreens]=useState(initial),[busy,setBusy]=useState(""),[message,setMessage]=useState("");
 async function change(screen:AdminScreenRow,feedMode:"simulation"|"actual"){
  if(busy)return;
  setBusy(screen.passId);setMessage("");
  try{
   const r=await fetch("/api/admin/hospitality/tv-screens",{method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({partnerId:screen.partnerId,venueId:screen.venueId,passId:screen.passId,feedMode,requestKey:crypto.randomUUID()})});
   const data=await r.json() as {error?:string;updated?:boolean};
   if(!r.ok||!data.updated)throw new Error(data.error??"UPDATE_FAILED");
   setScreens(prev=>prev.map(item=>item.passId===screen.passId?{...item,feedMode}:item));
   setMessage("Screen feed updated. Its display will switch automatically.");
  }catch(e){setMessage("Update failed: "+(e instanceof Error?e.message:"UNAVAILABLE"));}
  finally{setBusy("");}
 }
 return <section className="shell vendor-section" aria-label="DrinkStock TV feed modes">
  <h2>📺 DrinkStock — TV Screen Feeds</h2>
  <p>Choose the source independently for each screen. Simulation shows fictional buys; Actual Orders shows only verified paid DrinkStock transactions from that venue. No credentials, table IDs or customer details are exposed.</p>
  {!screens.length?<p>No active DrinkStock screen links have been created yet. Venue owners can issue them from the DrinkStock dashboard.</p>:
   <div style={{display:"grid",gap:12}}>
    {screens.map(screen=><div key={screen.passId} style={{border:"1px solid #d0d3da",borderRadius:13,padding:15,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
     <div><strong>{screen.partnerName} · {screen.venueName}</strong>
      <small style={{display:"block",opacity:.75}}>TV screen · {screen.passId.slice(0,8)}</small></div>
     <div role="group" aria-label={`TV source for ${screen.venueName}`} style={{display:"flex",gap:7,flexWrap:"wrap"}}>
      <button type="button" aria-pressed={screen.feedMode==="simulation"} disabled={Boolean(busy)||screen.feedMode==="simulation"}
       onClick={()=>void change(screen,"simulation")} style={{padding:"10px 14px",borderRadius:10,border:"1px solid #444",background:screen.feedMode==="simulation"?"#caff4e":"#fff",color:"#101820",fontWeight:800,cursor:"pointer"}}>Simulation</button>
      <button type="button" aria-pressed={screen.feedMode==="actual"} disabled={Boolean(busy)||screen.feedMode==="actual"}
       onClick={()=>void change(screen,"actual")} style={{padding:"10px 14px",borderRadius:10,border:"1px solid #444",background:screen.feedMode==="actual"?"#caff4e":"#fff",color:"#101820",fontWeight:800,cursor:"pointer"}}>Actual Orders</button>
     </div>
    </div>)}
   </div>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
