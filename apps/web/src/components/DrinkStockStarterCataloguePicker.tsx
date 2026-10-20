"use client";
import {useMemo,useState} from "react";
import {DRINKSTOCK_STARTER_CATALOGUE} from "../lib/drinkstock-starter-catalogue";
import {resolveGreekBeverageVat} from "../lib/drinkstock-greek-vat";
import type {MarketSnapshot} from "../lib/drinkstock-market-service";
import styles from "../app/hospitality/drinkStock/market.module.css";

const euros=(c:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(c/100);
const status:Record<string,string>={
 ROLE_FORBIDDEN:"Only owners and managers can import the catalogue.",
 NOT_FOUND:"Venue access is no longer available.",
 SESSION_LOCKED:"End the operational session and pause rehearsal before importing.",
 PRODUCT_LIMIT:"Up to 60 active drinks can be listed at one venue.",
 IMPORT_KEY_CONFLICT:"This import key was already used. Refresh the venue.",
 INVALID_CSRF:"Session expired. Sign in again.",
 CATALOGUE_UNAVAILABLE:"Import could not be confirmed. Refresh the board before retrying."
};
const groups=["beer","wine","spirits","cocktail","soft_drink","other"] as const;
const categoryName:Record<(typeof groups)[number],string>={
 beer:"🍺 Beer & cider",wine:"🍷 Wine",spirits:"🥃 Spirits",
 cocktail:"🍸 Cocktails & mocktails",soft_drink:"🥤 Soft drinks",other:"☕ Coffee, water & juices"
};
export function DrinkStockStarterCataloguePicker({market,partnerId,venueId,csrfToken,onImported}:{
 market:MarketSnapshot;partnerId:string;venueId:string;csrfToken:string;
 onImported:(snapshot:MarketSnapshot)=>void;
}){
 const [selected,setSelected]=useState<string[]>([]);
 const [prices,setPrices]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const existing=useMemo(()=>new Set(market.products.map(x=>x.name.toLocaleLowerCase("el-GR"))),[market.products]);
 const remaining=Math.max(0,60-market.products.length);
 const available=DRINKSTOCK_STARTER_CATALOGUE.filter(x=>!existing.has(x.name.toLocaleLowerCase("el-GR")));
 const eligible=market.canManage&&!market.venue.rehearsalEnabled&&!market.venue.activeSession;
 function toggle(key:string,checked:boolean){setSelected(current=>
   checked?[...current.filter(x=>x!==key),key]:current.filter(x=>x!==key));setError("");}
 async function submit(){
  if(!eligible||busy||selected.length<1)return;
  if(selected.length>remaining){setError("Choose at most "+remaining+" drinks.");return;}
  const items:{key:string;baseCents:number}[]=[];
  for(const key of selected){
   const p=DRINKSTOCK_STARTER_CATALOGUE.find(x=>x.key===key);
   if(!p)continue;
   const raw=prices[key]??(p.suggestedGrossCents/100).toFixed(2);
   const parsed=Number(raw);
   if(!Number.isFinite(parsed)||parsed<1||parsed>2000||
     Math.abs(parsed*100-Math.round(parsed*100))>0.000001){
    setError("Invalid gross price for "+p.name+" (between €1.00 and €2,000.00, two decimals).");return;
   }
   items.push({key,baseCents:Math.round(parsed*100)});
  }
  if(!window.confirm(`Import ${items.length} drinks into ${market.venue.name}? Prices are example gross menu prices; check availability and VAT classification before any real sales.`))return;
  setBusy(true);setError("");setSuccess("");
  try{
   const endpoint=`/api/hospitality/partners/${partnerId}/venues/${venueId}/market`;
   const resp=await fetch(endpoint+"/import",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({requestKey:crypto.randomUUID(),items})
   });
   const data=await resp.json() as {error?:string;imported?:number;skipped?:number};
   if(!resp.ok)throw new Error(data.error??"CATALOGUE_UNAVAILABLE");
   const fresh=await fetch(endpoint,{cache:"no-store",credentials:"same-origin"});
   if(!fresh.ok)throw new Error("CATALOGUE_UNAVAILABLE");
   onImported(await fresh.json() as MarketSnapshot);
   setSelected([]);
   setSuccess(`Imported ${data.imported??0} drinks; ${data.skipped??0} already existed. VAT labels await merchant review. No orders or payments were created.`);
  }catch(err){const code=err instanceof Error?err.message:"";
    setError(status[code]??"Import status is uncertain. Refresh the board to avoid repeating an order.");}
  finally{setBusy(false);}
 }
 return <section className={styles.editor} aria-label="Greek starter beverage catalogue" style={{margin:"24px 0",padding:22}}>
  <div className={styles.heading}><span>GREEK VENUE CATALOGUE / SELECTIVE IMPORT</span><h2>🍸 Ready-to-use drinks library</h2></div>
  <p style={{fontSize:13,lineHeight:1.7}}>
   {DRINKSTOCK_STARTER_CATALOGUE.length} generic Greek bar and café drinks, with editable example prices,
   explicit alcohol classifications, and <strong>24% dine-in / 13% non-alcoholic takeaway</strong> VAT guidance.
   Alcoholic takeaway remains 24%. Special island rates require separate verification. All menu
   entries are venue-specific; no automatic stock, payment or receipt is created.
   <strong> Warning:</strong> Some regulated facilities cap bottled-water and coffee prices.
   The current trading engine cannot enforce those special absolute legal maxima,
   so the starter library must not be used for commercial pricing of regulated goods without a separate compliance check.
  </p>
  <details>
   <summary style={{cursor:"pointer",fontWeight:900,padding:"12px 0",color:"#d9ff57"}}>
    Open starter catalogue · {remaining} available slots · {selected.length} selected
   </summary>
   <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"13px 0"}}>
    <button type="button" disabled={!eligible||busy} onClick={()=>setSelected(available.slice(0,remaining).map(x=>x.key))}>Select available (up to {remaining})</button>
    <button type="button" disabled={busy} onClick={()=>setSelected([])}>Clear selection</button>
   </div>
   {groups.map(group=>{
    const entries=available.filter(p=>p.category===group);
    if(!entries.length)return null;
    return <div key={group} style={{marginBottom:20}}>
     <h3 style={{margin:"12px 0 8px",color:"#d5ff53"}}>{categoryName[group]}</h3>
     <div style={{display:"grid",gap:8}}>
      {entries.map(p=>{
       const dine=resolveGreekBeverageVat({vatClass:p.vatClass,mode:"dine_in"}).rateBasisPoints/100;
       const away=resolveGreekBeverageVat({vatClass:p.vatClass,mode:"takeaway"}).rateBasisPoints/100;
       return <div key={p.key} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 100px",gap:8,
        border:"1px solid #ffffff2a",padding:10,borderRadius:10,alignItems:"center"}}>
        <label style={{display:"flex",gap:9,alignItems:"start",fontSize:13,cursor:"pointer"}}>
         <input type="checkbox" checked={selected.includes(p.key)} disabled={!eligible||busy}
          onChange={e=>toggle(p.key,e.target.checked)}/>
         <span><strong>{p.name}</strong><small style={{display:"block",marginTop:4,color:"#adb2c5"}}>
          {p.vatClass==="alcoholic"?"Alcoholic":"Non-alcoholic"} · VAT on-prem {dine}% · takeaway {away}%
         </small></span>
        </label>
        <label style={{fontSize:10}}>Gross €<input type="number" min="1" max="2000" step=".01"
         aria-label={`Gross menu price for ${p.name}`} style={{maxWidth:95,padding:7}}
         disabled={!eligible||busy} value={prices[p.key]??(p.suggestedGrossCents/100).toFixed(2)}
         onChange={e=>setPrices(old=>({...old,[p.key]:e.target.value}))}/></label>
       </div>;
      })}
     </div>
    </div>;
   })}
   <p style={{fontSize:12,color:"#abb5c3"}}>Examples are gross customer prices, not mandated
    prices. Dine-in and takeaway can require different tax treatment, so neither VAT review nor
    commercial readiness is automatically granted at import.</p>
   <button type="button" className={styles.primary} disabled={!eligible||busy||!selected.length||selected.length>remaining}
    onClick={()=>void submit()}>{busy?"Importing…":`IMPORT ${selected.length} SELECTED DRINKS ↗`}</button>
   {!eligible&&<p role="status">Import requires owner/manager access, paused rehearsal and no active session.</p>}
   {error&&<p role="alert" style={{color:"#ffa0a0"}}>{error}</p>}
   {success&&<p role="status" style={{color:"#b9ffbd"}}>{success}</p>}
  </details>
  <small style={{display:"block",marginTop:10}}>Existing drinks are not modified. Maximum 60 active venue products.</small>
 </section>;
}
