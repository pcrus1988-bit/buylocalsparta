"use client";
import {useEffect,useRef,useState} from "react";
import QRCode from "react-qr-code";
import type {SessionView,SessionAction} from "../lib/drinkstock-session-service";
import {decideSessionRevisionRecovery} from "../lib/drinkstock-session-recovery";
const money=(v:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(v/100);
const button:React.CSSProperties={background:"#caff4e",color:"#15112e",border:0,borderRadius:12,padding:"12px 17px",fontWeight:850,cursor:"pointer"};
const minor:React.CSSProperties={...button,background:"#493a73",color:"#fff",border:"1px solid #50606b"};
export function DrinkStockSessionControl({initial,partnerId,venueId,csrfToken}:{initial:SessionView;partnerId:string;venueId:string;csrfToken:string}){
 const [view,setView]=useState(initial);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[issued,setIssued]=useState<{kind:"screen"|"table";url:string;label:string}|null>(null);
 const [label,setLabel]=useState("A1");
 const busyRef=useRef(false);
 const endpoint=`/api/hospitality/partners/${partnerId}/venues/${venueId}/sessions`;
 function acceptView(incoming:SessionView){
  // A slow GET started before a successful command must not overwrite its result.
  setView(prior=>Date.parse(incoming.serverNow)<Date.parse(prior.serverNow)?prior:incoming);
 }
 useEffect(()=>{
  let mounted=true;
  const refresh=async()=>{
   if(busyRef.current||document.visibilityState!=="visible")return;
   try{
    const response=await fetch(endpoint,{credentials:"same-origin",cache:"no-store"});
    if(!response.ok)return;
    const incoming=await response.json() as SessionView;
    if(mounted&&!busyRef.current)
     setView(prior=>Date.parse(incoming.serverNow)<Date.parse(prior.serverNow)?prior:incoming);
   }catch{ /* periodic polling is best effort */ }
  };
  const timer=window.setInterval(()=>void refresh(),10000);
  return ()=>{mounted=false;window.clearInterval(timer);};
 },[endpoint]);
 async function command(action:SessionAction["action"],extra:Partial<SessionAction>={}){
  if(busyRef.current)return;
  if(action==="end"&&!window.confirm("End this venue's trading session permanently?"))return;
  if(action==="crash"&&!window.confirm("Trigger a 60-second market crash on all linked screens?"))return;
  busyRef.current=true;setBusy(true);setError("");setIssued(null);
  try{
   // One idempotency key for the entire operation, including a single stale retry.
   const requestKey=crypto.randomUUID();
   const originalSessionId=view.session?.id??null;
   const send=async(expectedRevision:number|undefined)=>{
    const response=await fetch(endpoint,{method:"POST",credentials:"same-origin",cache:"no-store",
     headers:{"content-type":"application/json","x-csrf-token":csrfToken},
     body:JSON.stringify({action,requestKey,expectedRevision,...extra})});
    const data=await response.json() as {error?:string;view?:SessionView;token?:string};
    return {response,data};
   };
   let {response,data}=await send(view.session?.revision);
   if(response.status===409&&data.error==="STALE_REVISION"){
    // Never blindly replay against a different session. Fetch the authoritative
    // venue state, then retry at most once if the user's command remains valid.
    const refreshed=await fetch(endpoint,{credentials:"same-origin",cache:"no-store"});
    if(!refreshed.ok)throw new Error("SESSION_REFRESH_FAILED");
    const current=await refreshed.json() as SessionView;
    acceptView(current);
    const decision=decideSessionRevisionRecovery(action,originalSessionId,current.session);
    if(decision==="review")
     throw new Error("Session changed. Controls refreshed; review the latest state before trying again.");
    if(decision==="already_applied")return;
    ({response,data}=await send(current.session?.revision));
   }
   if(!response.ok)throw new Error(data.error??"SESSION_UNAVAILABLE");
   if(!data.view)throw new Error("SESSION_REFRESH_FAILED");
   acceptView(data.view);
   if(data.token){
    const kind=action==="create_screen"?"screen":"table";
    setIssued({kind,label:kind==="table"?label:"REMOTE DISPLAY",url:`https://hospitality.kontamou.site/drinkstock/${kind==="screen"?"live":"table"}/${data.token}`});
   }
  }catch(e){
   const code=e instanceof Error?e.message:"SESSION_UNAVAILABLE";
   setError(code==="STOP_REHEARSAL_BEFORE_SESSION"
    ?"Pause the rehearsal market in the trading floor before starting an operational session."
    :code==="STALE_REVISION"
    ?"Session changed again. Refresh the controls before trying again.":code);
  }finally{busyRef.current=false;setBusy(false);}
 }
 const state=view.session?.state??"none",canManage=view.venue.role==="owner"||view.venue.role==="manager";
 return <section style={{margin:"26px auto",maxWidth:1280,padding:"26px",color:"#fff",background:"linear-gradient(125deg,#15112e,#1e153c)",border:"1px solid #52436c",borderRadius:24}}>
 <p style={{letterSpacing:3,fontSize:11,color:"#caff4e",fontWeight:900}}>VENUE OPS / SESSION CONTROL</p>
 <h2 style={{fontSize:"clamp(25px,4vw,40px)",margin:"9px 0 12px"}}>Trading session · {view.venue.name}</h2>
 <p style={{color:"#c1bbd7"}}>Session: <strong>{state.toUpperCase()}</strong> · {view.products.length} drinks · Bounds {view.session?.floorPercent??70}%–{view.session?.ceilingPercent??145}%</p>
 {view.session?.crashUntil&&<p role="status" style={{fontWeight:900,color:"#ff7979"}}>⚠ MARKET CRASH until {new Date(view.session.crashUntil).toLocaleTimeString("el-GR")}</p>}
 {canManage&&<div style={{display:"flex",gap:9,flexWrap:"wrap",margin:"23px 0"}}>
 {!view.session||state==="ended"?<button style={button} disabled={busy} onClick={()=>void command("start")}>▶ Start new session</button>:null}
 {state==="running"&&<><button style={minor} disabled={busy} onClick={()=>void command("pause")}>Ⅱ Pause</button>
 <button style={{...button,background:"#ff435e",color:"#fff"}} disabled={busy} onClick={()=>void command("crash")}>⚡ CRASH MARKET · 60s</button></>}
 {state==="paused"&&<button style={button} disabled={busy} onClick={()=>void command("resume")}>▶ Resume</button>}
 {state!=="none"&&state!=="ended"&&<button style={minor} disabled={busy} onClick={()=>void command("end")}>■ End session</button>}
 </div>}
 <aside aria-label="KONTA MOY POS-independent fallback" style={{padding:18,margin:"15px 0 24px",borderRadius:15,
  background:"#15112e",border:"1px solid #665585"}}>
  <strong style={{color:"#caff4e"}}>KONTA MOY CHECKOUT · POS FALLBACK</strong>
  <p style={{color:"#d5d6e6",fontSize:13,lineHeight:1.6,marginBottom:0}}>
   {view.checkoutFallback?.adminEnabled?
    "The platform administrator has approved this partner for the POS-unavailable checkout fallback. Guest payments remain unavailable until KONTA MOY's DrinkStock settlement and certified receipt integration is operational.":
    "Admin approval required. If your venue has no compatible POS, request KONTA MOY checkout eligibility from the platform administrator. No orders are charged until the approved payment and fiscal integration is active."}
  </p>
  <small style={{color:"#ffcc9e",display:"block",marginTop:10}}>
   {view.checkoutFallback?.adminEnabled?"✓ ADMIN APPROVED · ⏳ CUSTOMER CHECKOUT NOT ACTIVE":"● NOT APPROVED · CUSTOMER CHECKOUT NOT ACTIVE"}
  </small>
 </aside>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:14}}>
 <div style={{padding:18,borderRadius:15,background:"#ffffff0b",border:"1px solid #ffffff20"}}>
 <h3>📺 Screens anywhere</h3>
 <p style={{fontSize:13,color:"#bcb6d5"}}>Create a view-only link for each TV or projector. Choose <strong>Simulation</strong> for animated demo orders or <strong>Actual orders</strong> to show only provider-verified paid orders from this venue. Each screen has its own independent setting.</p>
 {canManage&&<button style={button} disabled={busy} onClick={()=>void command("create_screen")}>+ Create screen link</button>}
 </div>
 <div style={{padding:18,borderRadius:15,background:"#ffffff0b",border:"1px solid #ffffff20"}}>
 <h3>▦ QR table access</h3>
 <p style={{fontSize:13,color:"#bcb6d5"}}>A unique guest link for each table. Online payment and order submission are not activated yet.</p>
 {canManage&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
 <input value={label} onChange={e=>setLabel(e.target.value)} maxLength={30} aria-label="Table label" style={{minWidth:110,maxWidth:140,border:"1px solid #999",background:"#fff",color:"#111",borderRadius:9,padding:12}}/>
 <button style={button} disabled={busy} onClick={()=>void command("create_table",{tableLabel:label})}>+ Generate table QR</button>
 </div>}
 </div>
 </div>
 {issued&&<>
 <style>{`@media print{
   body *{visibility:hidden!important}
   #drinkstock-pass-print-area,#drinkstock-pass-print-area *{visibility:visible!important}
   #drinkstock-pass-print-area{position:absolute!important;top:0!important;left:0!important;width:100%!important;background:#fff!important;color:#111!important;box-shadow:none!important;border:0!important;padding:35px!important}
   #drinkstock-pass-actions{display:none!important}
 }`}</style>
 <div id="drinkstock-pass-print-area" style={{marginTop:20,padding:25,borderRadius:15,background:"#fff",color:"#15112e",overflowWrap:"anywhere",maxWidth:490}}>
  <strong style={{fontSize:22}}>DRINKSTOCK ↗</strong>
  <h3 style={{margin:"9px 0 4px"}}>{view.venue.name}</h3>
  <p style={{margin:"0 0 14px",fontWeight:900,fontSize:20}}>{issued.kind==="table"?"TABLE "+issued.label:"VENUE DISPLAY"}</p>
  <div style={{background:"#fff",padding:12,width:218,border:"2px solid #111",borderRadius:12}}><QRCode size={190} value={issued.url}/></div>
  <p style={{fontSize:13,maxWidth:330}}>Scan to {issued.kind==="table"?"view your table's drinks and live prices":"open this venue's remote view-only market screen"}.</p>
  <div id="drinkstock-pass-actions">
   <p style={{fontSize:12}}>Copy or print this link now. Only its hash is stored, so the original code cannot be recovered after this page closes.</p>
   <p style={{fontSize:12}}><a href={issued.url} target="_blank" rel="noreferrer" style={{color:"#5238bf"}}>{issued.url}</a></p>
   <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
    <button style={{...button,background:"#131727",color:"#fff"}} onClick={()=>void navigator.clipboard.writeText(issued.url)}>Copy URL</button>
    <button style={button} onClick={()=>window.print()}>🖨 Print QR</button>
    <button style={minor} onClick={()=>setIssued(null)}>Hide temporary link</button>
   </div>
  </div>
 </div></>}
 {view.passes.length>0&&<div style={{marginTop:20}}>
 <h3>Issued access passes</h3>
 <div style={{display:"grid",gap:8}}>{view.passes.map(p=><div key={p.id} style={{padding:12,background:"#ffffff0b",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
 <span>{p.kind==="screen"?"📺 Screen":`▦ Table ${p.tableLabel}`} · <small>{p.id.slice(0,8)}</small></span>
 {p.kind==="screen"&&<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
  <span style={{fontSize:12,color:"#c4bedb"}}>TV feed</span>
  <button type="button" style={{...minor,background:p.feedMode==="simulation"?"#caff4e":"#493a73",color:p.feedMode==="simulation"?"#131727":"#fff"}} disabled={!canManage||busy||p.feedMode==="simulation"} aria-pressed={p.feedMode==="simulation"} onClick={()=>void command("set_screen_feed",{passId:p.id,feedMode:"simulation"})}>Simulation</button>
  <button type="button" style={{...minor,background:p.feedMode==="actual"?"#caff4e":"#493a73",color:p.feedMode==="actual"?"#131727":"#fff"}} disabled={!canManage||busy||p.feedMode==="actual"} aria-pressed={p.feedMode==="actual"} onClick={()=>void command("set_screen_feed",{passId:p.id,feedMode:"actual"})}>Actual orders</button>
 </div>}
 {canManage&&<button style={minor} disabled={busy} onClick={()=>{if(window.confirm("Revoke this link immediately?"))void command("revoke_pass",{passId:p.id});}}>Revoke</button>}
 </div>)}</div>
 </div>}
 {error&&<p role="alert" style={{color:"#ff9c9c"}}>Action not completed: {error}</p>}
 <p style={{fontSize:12,color:"#a7a4bb",marginTop:20}}>Commercial orders, payment capture and AADE-compliant receipts require separate certified production integrations. Trading here currently operates as a venue-controlled demonstration.</p>
 </section>;
}
