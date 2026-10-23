"use client";
import {useEffect,useState} from "react";
import styles from "./LidlStandaloneOffers.module.css";
type Store={id:string;name:string;city:string;address:string;postalCode:string};
type Item={id:string;name:string;brand:string|null;packaging:string|null;priceEur:number;referencePriceEur:number|null;validFrom:string;validTo:string;discountText:string|null;validityStatus:"current"|"upcoming"};
type Payload={status:string;products?:Item[];stores?:Store[];count?:number;hasMore?:boolean;observedAt?:string;store?:Store};
const money=(n:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(n);
const day=(s:string)=>{const d=new Date(s);return Number.isNaN(d.getTime())?s.slice(0,10):new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",day:"2-digit",month:"2-digit",year:"numeric"}).format(d)};
export function LidlStandaloneOffers(){
 const [stores,setStores]=useState<Store[]>([]),[store,setStore]=useState("GR0851");
 const [period,setPeriod]=useState<"current"|"upcoming">("current");
 const [search,setSearch]=useState(""),[page,setPage]=useState(1);
 const [data,setData]=useState<Payload>({status:"loading",products:[]}),[loading,setLoading]=useState(true);
 useEffect(()=>{
   const abort=new AbortController();
   void fetch("/api/posokanei/lidl?mode=stores",{signal:abort.signal,cache:"no-store"})
     .then(r=>r.json()).then((v:Payload)=>{if(!abort.signal.aborted&&v.status==="ready"&&v.stores)setStores(v.stores)}).catch(()=>{});
   return()=>abort.abort();
 },[]);
 useEffect(()=>{
   const abort=new AbortController();
   const timer=setTimeout(()=>{
     setLoading(true);
     const p=new URLSearchParams({mode:"offers",store,period,page:String(page)});
     if(search.trim())p.set("q",search.trim().slice(0,100));
     void fetch("/api/posokanei/lidl?"+p,{signal:abort.signal,cache:"no-store"})
       .then(async r=>{const v=await r.json() as Payload;if(!abort.signal.aborted)setData(v)})
       .catch(()=>{if(!abort.signal.aborted)setData({status:"source_unavailable",products:[]})})
       .finally(()=>{if(!abort.signal.aborted)setLoading(false)});
   },280);
   return()=>{clearTimeout(timer);abort.abort()};
 },[store,period,search,page]);
 // Do not show inactive/unlicensed or synthetic catalogue entries.
 if(data.status==="unpublished")return null;
 return <section className={styles.root} aria-label="Προσφορές Lidl χωρίς αντιστοίχιση">
   <div className={styles.head}>
    <div><p className={styles.kicker}>ΠΡΟΣΦΟΡΕΣ ΑΠΟ ΕΞΩΤΕΡΙΚΗ ΠΗΓΗ</p>
      <h2>Προϊόντα σε προσφορά Lidl</h2>
      <p>Ανεξάρτητος κατάλογος προσφορών Lidl. Δεν έχουν αντιστοιχιστεί ακόμα με το PosoKanei.</p></div>
    <span className={styles.label}>Χωρίς αντιστοίχιση</span>
   </div>
   <div className={styles.controls}>
    <label>Κατάστημα Lidl
      <select value={store} onChange={e=>{setStore(e.target.value);setPage(1)}}>
       {stores.length?stores.map(s=><option key={s.id} value={s.id}>{s.city||s.name} · {s.address||s.id}</option>):
         <option value="GR0851">Σπάρτη · GR0851</option>}
      </select>
    </label>
    <label>Αναζήτηση
     <input type="search" value={search} placeholder="π.χ. καφές, γάλα"
       onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
    </label>
    <label>Περίοδος
     <select value={period} onChange={e=>{setPeriod(e.target.value as "current"|"upcoming");setPage(1)}}>
       <option value="current">Τρέχουσες</option><option value="upcoming">Επόμενες</option>
     </select>
    </label>
   </div>
   {data.status==="source_unavailable"&&!loading&&<p role="status" className={styles.note}>
     Η τροφοδοσία Lidl δεν είναι προσωρινά διαθέσιμη. Οι τιμές PosoKanei παραμένουν ανεπηρέαστες.</p>}
   <div className={styles.summary}>
    {loading?"Ανανέωση προσφορών…":data.status==="ready"?String(data.count??0)+" προσφορές · "+(data.store?.name||store):""}
    {data.status==="ready"&&data.observedAt&&<span>Έλεγχος: {day(data.observedAt)}</span>}
   </div>
   {data.status==="ready"&&!loading&&!data.products?.length&&<p className={styles.note}>Δεν βρέθηκαν προσφορές με αυτά τα κριτήρια.</p>}
   <div className={styles.grid}>
    {data.status==="ready"&&(data.products||[]).map(item=><article className={styles.card} key={item.id}>
       <div className={styles.cardHeader}><span>{item.brand||"Lidl"}</span>
        <span className={styles.smallTag}>{item.validityStatus==="current"?"Τρέχουσα":"Προσεχώς"}</span>
       </div>
       <h3>{item.name}</h3>
       {item.packaging&&<p className={styles.packaging}>{item.packaging}</p>}
       <div className={styles.prices}><strong>{money(item.priceEur)}</strong>
        {item.referencePriceEur!==null&&<span>Τιμή αναφοράς: {money(item.referencePriceEur)}</span>}
       </div>
       {item.discountText&&<p className={styles.discount}>{item.discountText}</p>}
       <p className={styles.dates}>Από {day(item.validFrom)} έως {day(item.validTo)}</p>
       <p className={styles.note}>Ελέγξτε όρους Lidl Plus και διαθεσιμότητα στο κατάστημα.</p>
     </article>)}
   </div>
   {data.status==="ready"&&(page>1||data.hasMore)&&<nav aria-label="Σελίδες προσφορών Lidl" className={styles.paging}>
     <button type="button" disabled={page<=1} onClick={()=>setPage(x=>x-1)}>← Προηγούμενη</button>
     <span>Σελίδα {page}</span>
     <button type="button" disabled={!data.hasMore} onClick={()=>setPage(x=>x+1)}>Επόμενη →</button>
   </nav>}
   <p className={styles.footer}>Οι προσφορές είναι ενδεικτικές και δεν εισάγονται στον υπολογισμό του καλαθιού.
    Δεν είναι κατάλογος όλων των προϊόντων Lidl. Πηγή: <a href="https://www.lidl-hellas.gr/" target="_blank" rel="noopener noreferrer">Lidl Ελλάς</a>.</p>
 </section>
}
