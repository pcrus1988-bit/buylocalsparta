"use client";
import {useEffect,useState} from "react";
import QRCode from "react-qr-code";
import type {SessionView,SessionAction} from "../lib/drinkstock-session-service";
const money=(v:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(v/100);
const button:React.CSSProperties={background:"#d9ff57",color:"#151724",border:0,borderRadius:12,padding:"12px 17px",fontWeight:850,cursor:"pointer"};
const minor:React.CSSProperties={...button,background:"#26343e",color:"#fff",border:"1px solid #50606b"};
export function DrinkStockSessionControl({initial,partnerId,venueId,csrfToken}:{initial:SessionView;partnerId:string;venueId:string;csrfToken:string}){
 const [view,setView]=useState(initial);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[issued,setIssued]=useState<{kind:"screen"|"table";url:string}|null>(null);
 const [label,setLabel]=useState("A1");
 const endpoint=`/api/hospitality/partners/${partnerId}/venues/${venueId}/sessions`;
 useEffect(()=>{
 const t=window.setInterval(()=>{fetch(endpoint,{credentials:"same-origin",cache:"no-store"}).then(r=>r.ok?r.json():null).then(v=>{if(v)setView(v);}).catch(()=>{});},10000);
 return ()=>clearInterval(t);
 },[endpoint]);
 async function command(action:SessionAction["action"],extra:Partial<SessionAction>={}){
 if(busy)return;
 if(action==="end"&&!window.confirm("End this venue's trading session permanently?"))return;
 if(action==="crash"&&!window.confirm("Trigger a 60-second market crash on all linked screens?"))return;
 setBusy(true);setError("");
 try{
 const requestKey=crypto.randomUUID();
 const response=await fetch(endpoint,{method:"POST",credentials:"same-origin",cache:"no-store",
 headers:{"content-type":"application/json","x-csrf-token":csrfToken},
 body:JSON.stringify({action,requestKey,expectedRevision:view.session?.revision,...extra})});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error??"SESSION_UNAVAILABLE");
 setView(data.view);
 if(data.token){
 const kind=action==="create_screen"?"screen":"table";
 setIssued({kind,url:`https://hospitality.kontamou.site/drinkstock/${kind==="screen"?"live":"table"}/${data.token}`});
 }
 }catch(e){const code=e instanceof Error?e.message:"SESSION_UNAVAILABLE";setError(code==="STOP_REHEARSAL_BEFORE_SESSION"?"Pause the rehearsal market in the trading floor before starting an operational session.":code);}finally{setBusy(false);}
 }
 const state=view.session?.state??"none",canManage=view.venue.role==="owner"||view.venue.role==="manager";
 return <section style={{margin:"26px auto",maxWidth:1280,padding:"26px",color:"#fff",background:"linear-gradient(125deg,#111b30,#1e153c)",border:"1px solid #52436c",borderRadius:24}}>
 <p style={{letterSpacing:3,fontSize:11,color:"#d9ff57",fontWeight:900}}>VENUE OPS / SESSION CONTROL</p>
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
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:14}}>
 <div style={{padding:18,borderRadius:15,background:"#ffffff0b",border:"1px solid #ffffff20"}}>
 <h3>📺 Screens anywhere</h3>
 <p style={{fontSize:13,color:"#bcb6d5"}}>Create a view-only link for each TV or projector. Each can access the same venue's board from any location.</p>
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
 {issued&&<div style={{marginTop:20,padding:20,borderRadius:15,background:"#fff",color:"#151724",overflowWrap:"anywhere"}}>
 <strong>New {issued.kind} link · copy or print now</strong>
 <p>Only the hashed secret is stored. The full URL will not be shown again.</p>
 {issued.kind==="table"&&<div style={{background:"#fff",padding:12,width:178}}><QRCode size={150} value={issued.url}/></div>}
 <p><a href={issued.url} target="_blank" rel="noreferrer" style={{color:"#5238bf"}}>{issued.url}</a></p>
 <button style={{...button,background:"#131727",color:"#fff"}} onClick={()=>void navigator.clipboard.writeText(issued.url)}>Copy URL</button>
 </div>}
 {view.passes.length>0&&<div style={{marginTop:20}}>
 <h3>Issued access passes</h3>
 <div style={{display:"grid",gap:8}}>{view.passes.map(p=><div key={p.id} style={{padding:12,background:"#ffffff0b",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
 <span>{p.kind==="screen"?"📺 Screen":`▦ Table ${p.tableLabel}`} · <small>{p.id.slice(0,8)}</small></span>
 {canManage&&<button style={minor} disabled={busy} onClick={()=>{if(window.confirm("Revoke this link immediately?"))void command("revoke_pass",{passId:p.id});}}>Revoke</button>}
 </div>)}</div>
 </div>}
 {error&&<p role="alert" style={{color:"#ff9c9c"}}>Action not completed: {error}</p>}
 <p style={{fontSize:12,color:"#a7a4bb",marginTop:20}}>Commercial orders, payment capture and AADE-compliant receipts require separate certified production integrations. Trading here currently operates as a venue-controlled demonstration.</p>
 </section>;
}
