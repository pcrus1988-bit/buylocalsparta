"use client";
import { useEffect,useState,type FormEvent } from "react";
import type {MarketSnapshot} from "../lib/drinkstock-market-service";
import type {DrinkStockCategory} from "../lib/drinkstock-market-pricing";
import styles from "../app/hospitality/drinkStock/market.module.css";

const money=(c:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(c/100);
const categoryNames:Record<DrinkStockCategory,string>={
 beer:"🍺 Beer",cocktail:"🍹 Cocktail",spirits:"🥃 Spirits",wine:"🍷 Wine",
 soft_drink:"🥤 Soft drink",other:"✨ Other"
};
const errorText:Record<string,string>={
 REHEARSAL_PAUSED:"Η αγορά δοκιμών είναι σε παύση. Ενεργοποίησε πρώτα τη λειτουργία.",
 MARKET_COOLDOWN:"Μία κίνηση ανά δευτερόλεπτο. Δοκίμασε ξανά.",
 PRODUCT_ALREADY_EXISTS:"Αυτό το ποτό υπάρχει ήδη στον συγκεκριμένο χώρο.",
 PRODUCT_LIMIT_REACHED:"Έφτασες το όριο των 60 ποτών.",
 MARKET_ROLE_FORBIDDEN:"Δεν έχεις δικαίωμα αλλαγών για αυτόν τον χώρο.",
 MARKET_NOT_FOUND:"Δεν έχεις εξουσιοδότηση για τον συγκεκριμένο χώρο.",
 INVALID_CSRF:"Η συνεδρία χρειάζεται ανανέωση. Κάνε νέα σύνδεση."
};
type Action="add_product"|"demand"|"pause"|"resume"|"reset";
type ActionBody={action:Action;requestKey:string;productId?:string;product?:{name:string;category:DrinkStockCategory;basePriceEuros:number}};
export function DrinkStockVenueMarket({initial,partnerId,venueId,csrfToken}:{
  initial:MarketSnapshot;partnerId:string;venueId:string;csrfToken:string
}){
 const [market,setMarket]=useState(initial);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const [name,setName]=useState("");
 const [category,setCategory]=useState<DrinkStockCategory>("beer");
 const [price,setPrice]=useState("5.00");
 const [display,setDisplay]=useState(false);
 const endpoint=`/api/hospitality/partners/${partnerId}/venues/${venueId}/market`;
 useEffect(()=>{
   const timer=window.setInterval(()=>{
     if(document.visibilityState!=="visible"||busy)return;
     fetch(endpoint,{cache:"no-store",credentials:"same-origin"})
       .then(async response=>{if(!response.ok)throw new Error("refresh");return response.json() as Promise<MarketSnapshot>})
       .then(setMarket).catch(()=>{});
   },20000);
   return ()=>window.clearInterval(timer);
 },[endpoint,busy]);
 async function act(body:Omit<ActionBody,"requestKey">){
   if(busy)return;
   setBusy(body.action+(body.productId??""));setError("");setSuccess("");
   try{
     const requestKey=crypto.randomUUID();
     const response=await fetch(endpoint,{method:"POST",credentials:"same-origin",cache:"no-store",
       headers:{"content-type":"application/json","x-csrf-token":csrfToken},
       body:JSON.stringify({...body,requestKey})
     });
     const data=await response.json() as MarketSnapshot & {error?:string};
     if(!response.ok)throw new Error(data.error??"MARKET_UNAVAILABLE");
     setMarket(data);
     setSuccess(body.action==="demand"?"Η εικονική ζήτηση υπολογίστηκε.":body.action==="add_product"?"Το ποτό προστέθηκε.":"Η κατάσταση ενημερώθηκε.");
     if(body.action==="add_product"){setName("");setPrice("5.00");}
   }catch(cause){
     const code=cause instanceof Error?cause.message:"";
     setError(errorText[code]??"Δεν επιβεβαιώθηκε η αλλαγή. Δες το ιστορικό πριν προσπαθήσεις ξανά.");
   }finally{setBusy("");}
 }
 function onAdd(e:FormEvent<HTMLFormElement>){
   e.preventDefault();
   const euros=Number(price);
   if(!Number.isFinite(euros))return;
   void act({action:"add_product",product:{name,category,basePriceEuros:euros}});
 }
 const active=market.venue.rehearsalEnabled;
 const total=market.products.length;
 const moved=market.products.filter(d=>d.priceCents!==d.baseCents).length;
 return <main className={styles.stage}>
  <header className={styles.header}>
   <div><span className={styles.overline}>DRINKSTOCK // THE TRADING FLOOR</span>
    <h1>{market.venue.name}<span> ↗</span></h1>
    <p>Η δική σου χρηματιστηριακή πίστα ποτών. Όλα τα σήματα ζήτησης είναι <strong>χειροκίνητες δοκιμές</strong> — όχι πωλήσεις.</p>
   </div>
   <div className={styles.statusWrap}><span className={active?styles.liveDot:styles.pauseDot}/>
    <strong>{active?"REHEARSAL ON":"MARKET PAUSED"}</strong><small>{market.venue.role.toUpperCase()} ACCESS</small></div>
  </header>
  <div className={styles.stats}>
   <div><span>LISTED DRINKS</span><strong>{total}</strong></div>
   <div><span>PRICES MOVED</span><strong>{moved}</strong></div>
   <div><span>MARKET SIGNALS</span><strong>{market.events.filter(e=>e.type==="demand").length}{market.events.length===20?"+":""}</strong></div>
   <div><span>ENGINE</span><strong>± BOUNDED</strong></div>
  </div>
  <div className={styles.toolbar}>
   <div className={styles.toolbarInfo}><strong>🎛 MARKET CONTROLS</strong><span>Άσκηση διαχείρισης χωρίς POS, πραγματικό stock ή εισπράξεις.</span></div>
   <div className={styles.toolbarButtons}>
     <button type="button" onClick={()=>setDisplay(!display)}>{display?"← EDITOR":"◉ DISPLAY PREVIEW"}</button>
     {market.canManage&&<button type="button" className={styles.primary} disabled={Boolean(busy)} onClick={()=>act({action:active?"pause":"resume"})}>{active?"Ⅱ PAUSE":"▶ START REHEARSAL"}</button>}
     {market.canManage&&<button type="button" disabled={Boolean(busy)||total===0} onClick={()=>{if(window.confirm("Επαναφορά όλων των τιμών καταλόγου αυτού του χώρου;"))void act({action:"reset"});}}>↺ RESET PRICES</button>}
   </div>
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {success&&<p role="status" className={styles.success}>{success}</p>}
  {!total?<div className={styles.empty}><span>📈</span><h2>No drinks on the board yet.</h2><p>Πρόσθεσε το πρώτο ποτό παρακάτω. Θα εμφανιστεί αμέσως στον πίνακα δοκιμών.</p></div>:
   <section className={display?styles.boardDisplay:styles.board} aria-label="Ελεγχόμενος πίνακας τιμών">
     {market.products.map((drink,i)=>{
       const delta=drink.priceCents-drink.baseCents;
       const pct=Math.round(delta/drink.baseCents*100);
       return <article key={drink.id} className={styles.drink}>
         <div className={styles.drinkTop}><span className={styles.rank}>#{String(i+1).padStart(2,"0")}</span><span className={styles.category}>{categoryNames[drink.category]}</span></div>
         <h2>{drink.name}</h2><div className={styles.quote}>{money(drink.priceCents)}</div>
         <div className={styles.movements}><span className={delta>0?styles.up:delta<0?styles.down:styles.flat}>{delta>0?"▲":delta<0?"▼":"↔"} {pct>0?"+":""}{pct}%</span><span>BASE {money(drink.baseCents)}</span></div>
         <div className={styles.bar} aria-hidden="true"><i style={{width:`${Math.round((drink.priceCents-drink.minCents)/Math.max(1,drink.maxCents-drink.minCents)*100)}%`}}/></div>
         {!display&&market.canManage&&<button type="button" disabled={!active||Boolean(busy)} className={styles.buySignal}
          onClick={()=>act({action:"demand",productId:drink.id})}>⚡ DEMAND SIGNAL <span>↗</span></button>}
       </article>;
     })}
   </section>}
  {!display&&<div className={styles.lower}>
    <section className={styles.editor}>
      <div className={styles.heading}><span>01 / BUILD THE BOARD</span><h2>+ Add a drink</h2></div>
      {market.canManage?<form onSubmit={onAdd} className={styles.form}>
       <label>Drink name<input maxLength={80} minLength={2} required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Moscow Mule"/></label>
       <label>Category<select value={category} onChange={e=>setCategory(e.target.value as DrinkStockCategory)}>{Object.entries(categoryNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
       <label>Base price (€)<input type="number" min="1" max="2000" step=".01" required value={price} onChange={e=>setPrice(e.target.value)}/></label>
       <button type="submit" disabled={Boolean(busy)||total>=60}>LIST DRINK ↗</button>
       <small>Price band: 70–145% of starting price. Up to 60 entries per venue.</small>
      </form>:<p>Μόνο ιδιοκτήτες και διαχειριστές μπορούν να επεξεργαστούν τον κατάλογο.</p>}
    </section>
    <section className={styles.history}>
      <div className={styles.heading}><span>02 / MARKET TAPE</span><h2>Recent activity</h2></div>
      {!market.events.length?<p className={styles.noEvents}>Καμία καταγεγραμμένη κίνηση μέχρι στιγμής.</p>:
       <ol>{market.events.map(e=><li key={e.id}>
        <span>{e.type==="demand"?"⚡":e.type==="product_added"?"✚":e.type==="reset"?"↺":e.type==="rehearsal_paused"?"Ⅱ":"▶"} {e.type.replaceAll("_"," ").toUpperCase()}</span>
        <small>{new Date(e.createdAt).toLocaleString("el-GR",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit"})} · {e.movements.filter(m=>m.deltaCents!==0).length} price moves</small>
       </li>)}</ol>}
    </section>
  </div>}
  <footer className={styles.disclaimer}>SIMULATION / NO REAL ORDERS · Prices are server-persisted rehearsal quotes scoped to this venue, not customer charges or POS prices. <button type="button" onClick={()=>window.location.reload()}>Refresh full board ↻</button></footer>
 </main>;
}
