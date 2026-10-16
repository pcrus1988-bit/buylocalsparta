"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import type {BasketLine,BasketPlan,BasketResult} from "../../../../scripts/posokanei/basket-optimizer.mjs";
import styles from "./PosoKaneiPublicClient.module.css";

type Offer={retailerId:string;retailerName:string;priceEur:number;observedAt:string|null;discount:boolean};
type Product={id:string;name:string;brand:string|null;category:string|null;unit:string|null;unitQuantity:number|null;groupId:string|null;offers:Offer[]};
type Group={id:string;label:string;basis:"kg"|"l"|"piece"};
type Retailer={id:string;name:string};
type Listing={status:string;snapshotDate?:string;source?:string;count?:number;page?:number;hasMore?:boolean;products:Product[];categories:string[];groups:Group[];retailers:Retailer[]};
type Mode="single"|"limited"|"all";
const money=(n:number|null|undefined)=>typeof n==="number"&&Number.isFinite(n)?new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(n):"—";
const empty:Listing={status:"unavailable",products:[],categories:[],groups:[],retailers:[]};
function pricePerUnit(product:Product,price:number){
  const base:Record<string,[string,number]>={kg:["kg",1],g:["kg",.001],gr:["kg",.001],l:["L",1],ml:["L",.001],piece:["τεμ.",1],pcs:["τεμ.",1]};
  const unit=product.unit?base[product.unit]:undefined;
  if(!unit||!product.unitQuantity||product.unitQuantity<=0)return null;
  return {price:price/(product.unitQuantity*unit[1]),unit:unit[0]};
}
const id=()=>("line_"+Math.random().toString(36).slice(2,11));
const planOf=(r:BasketResult,m:Mode):BasketPlan|null=>m==="single"?r.bestSingleStore:m==="limited"?r.cheapestWithinStoreLimit:r.cheapestAcrossAnyStores;

export function PosoKaneiPublicClient(){
  const [q,setQ]=useState("");
  const [category,setCategory]=useState("");
  const [page,setPage]=useState(1);
  const [listing,setListing]=useState<Listing>(empty);
  const [loading,setLoading]=useState(true);
  const [active,setActive]=useState<string|null>(null);
  const [group,setGroup]=useState<string|null>(null);
  const [alternatives,setAlternatives]=useState<Product[]>([]);
  const [sorting,setSorting]=useState<"unit"|"package">("unit");
  const [lines,setLines]=useState<BasketLine[]>([]);
  const [labels,setLabels]=useState<Record<string,string>>({});
  const [storeLimit,setStoreLimit]=useState(2);
  const [mode,setMode]=useState<Mode>("limited");
  const [result,setResult]=useState<BasketResult|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    const abort=new AbortController();
    const timer=setTimeout(async()=>{
      setLoading(true);
      try {
        const url=new URL("/api/posokanei",window.location.origin);
        if(q.trim())url.searchParams.set("q",q.trim());
        if(category)url.searchParams.set("category",category);
        url.searchParams.set("page",String(page));
        const response=await fetch(url.toString(),{signal:abort.signal,cache:"no-store"});
        const data=await response.json() as Listing;
        if(!abort.signal.aborted)setListing(data.status==="ready"?data:empty);
      }catch{if(!abort.signal.aborted)setListing(empty);}
      finally{if(!abort.signal.aborted)setLoading(false);}
    },180);
    return ()=>{clearTimeout(timer);abort.abort();};
  },[q,category,page]);
  useEffect(()=>{
    if(!group){setAlternatives([]);return;}
    const abort=new AbortController();
    void (async()=>{
      try {
        const response=await fetch("/api/posokanei?group="+encodeURIComponent(group),{signal:abort.signal,cache:"no-store"});
        const data=await response.json() as Listing;
        if(!abort.signal.aborted)setAlternatives(data.status==="ready"?data.products:[]);
      }catch{if(!abort.signal.aborted)setAlternatives([]);}
    })();
    return ()=>abort.abort();
  },[group]);
  const groupInfo=listing.groups.find(g=>g.id===group);
  const ranked=useMemo(()=>[...alternatives].sort((a,b)=>{
    const aPrice=a.offers[0]?.priceEur??Infinity,bPrice=b.offers[0]?.priceEur??Infinity;
    if(sorting==="unit"){
      const au=pricePerUnit(a,aPrice)?.price??Infinity,bu=pricePerUnit(b,bPrice)?.price??Infinity;
      if(au!==bu)return au-bu;
    }
    return aPrice-bPrice||a.name.localeCompare(b.name,"el");
  }),[alternatives,sorting]);
  const update=useCallback((next:BasketLine[])=>{setLines(next);setResult(null);setError("");},[]);
  function addProduct(p:Product,retailer?:string){
    const key=id();
    setLabels(current=>({...current,[key]:p.name}));
    update([...lines,{id:key,kind:"exact",sourceProductId:p.id,packageCount:1,...(retailer?{lockedRetailerId:retailer}:{})}]);
    setNotice("Προστέθηκε στη λίστα: "+p.name);
  }
  function addGroup(g:Group){
    const key=id();
    setLabels(current=>({...current,[key]:g.label}));
    update([...lines,{id:key,kind:"group",groupId:g.id,requiredBaseQuantity:1}]);
    setNotice("Προστέθηκαν ισοδύναμα προϊόντα στη λίστα.");
  }
  function changeLine(key:string,patch:Partial<BasketLine>){
    update(lines.map(line=>line.id===key?({...line,...patch} as BasketLine):line));
  }
  async function calculate(){
    setWorking(true);setError("");setResult(null);setNotice("");
    try{
      const r=await fetch("/api/posokanei/optimize",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({lines,storeLimit})});
      const data=await r.json() as {status?:string;result?:BasketResult;error?:string};
      if(!r.ok||data.status!=="ready"||!data.result)throw Error(data.error||"Η σύγκριση δεν ολοκληρώθηκε.");
      setResult(data.result);setMode("limited");
    }catch(e){setError(e instanceof Error?e.message:"Σφάλμα υπολογισμού.");}
    finally{setWorking(false);}
  }
  const plan=result?planOf(result,mode):null;
  return <div className={styles.scope}>
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>ΚΟΝΤΑ ΜΟΥ · ΑΝΕΞΑΡΤΗΤΗ ΣΥΓΚΡΙΣΗ</p>
          <h1>KONTA MOY <span>× PosoKanei</span></h1>
          <p className={styles.lead}>Σύγκρινε τιμές στα σούπερ μάρκετ, διάλεξε τη μάρκα που προτιμάς και υπολόγισε το πραγματικά οικονομικότερο <em>καταγεγραμμένο</em> καλάθι σου.</p>
          <div className={styles.tags}><span>Τιμές ανά αλυσίδα</span><span>Ισοδύναμες μάρκες</span><span>Έως 3 σούπερ μάρκετ</span></div>
        </div>
        <div className={styles.heroBox}>
          <small>Τελευταία καταγραφή</small>
          <strong>{listing.snapshotDate??"Δεν έχει δημοσιευτεί"}</strong>
          <span>{listing.status==="ready"?"Ενδεικτικές καταγεγραμμένες τιμές":"Αναμένεται επαληθευμένη δημοσίευση τιμών"}</span>
        </div>
      </div>
      <div className={styles.disclaimer} role="note"><strong>Σημαντικό:</strong> Οι τιμές είναι ενδεικτικές καταγραφές, όχι απόδειξη διαθεσιμότητας ή ίδιας τιμής στο τοπικό κατάστημα. Δεν πραγματοποιούνται αγορές ή παραγγελίες μέσω της σύγκρισης.</div>
      {listing.status!=="ready"&&!loading?<section className={styles.pending} role="status">
        <h2>Η σύγκριση τιμών ετοιμάζεται.</h2>
        <p>Ο ανεξάρτητος κατάλογος θα ενεργοποιηθεί μόλις ολοκληρωθεί η επαλήθευση της πηγής και η δημοσίευση των ενημερωμένων δεδομένων. Δεν εμφανίζουμε δοκιμαστικές τιμές ως πραγματικές.</p>
      </section>:null}
      <div className={styles.layout}>
        <section className={styles.browse}>
          <div className={styles.heading}><div><span className={styles.eyebrow}>01 · ΑΝΑΖΗΤΗΣΗ</span><h2>Βρες και σύγκρινε προϊόντα</h2></div>{listing.status==="ready"&&<span>{listing.count??0} αποτελέσματα</span>}</div>
          <div className={styles.filters}>
            <label>Αναζήτηση προϊόντος<input type="search" value={q} onChange={e=>{setQ(e.target.value);setPage(1);setActive(null);}} placeholder="π.χ. ρύζι, γάλα, ντομάτα ψιλοκομμένη" /></label>
            <label>Κατηγορία<select value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}><option value="">Όλες οι κατηγορίες</option>{listing.categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
          </div>
          {loading&&<p className={styles.message} role="status">Φόρτωση καταλόγου…</p>}
          {listing.status==="ready"&&!loading&&listing.products.length===0&&<p className={styles.message}>Δεν βρέθηκαν καταγεγραμμένες τιμές με αυτά τα κριτήρια.</p>}
          <div className={styles.cards}>
            {listing.products.map(p=>{
              const best=p.offers[0],expanded=p.id===active,unit=best?pricePerUnit(p,best.priceEur):null;
              return <article key={p.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.glyph} aria-hidden="true">▦</div>
                  <div className={styles.productTitle}><small>{p.brand||"Χωρίς μάρκα"} · {p.category||"Λοιπά"}</small><h3>{p.name}</h3><small>{p.unitQuantity??"—"} {p.unit||""} · {p.offers.length} καταγραφές</small></div>
                  <div className={styles.amount}><small>Από</small><strong>{money(best?.priceEur)}</strong><small>{best?.retailerName||"—"}</small>{unit&&<small>{money(unit.price)}/{unit.unit}</small>}</div>
                </div>
                <div className={styles.buttons}>
                  <button className={styles.primary} type="button" disabled={!best} onClick={()=>addProduct(p)}>+ Στη λίστα · καλύτερη τιμή</button>
                  <button className={styles.secondary} type="button" onClick={()=>setActive(expanded?null:p.id)} aria-expanded={expanded}>Σύγκριση αλυσίδων {expanded?"−":"+"}</button>
                  {p.groupId&&<button className={styles.textButton} type="button" onClick={()=>{setGroup(p.groupId);setSorting("unit");}}>Άλλες μάρκες ↗</button>}
                </div>
                {expanded&&<div className={styles.offers}><h4>Επίλεξε συγκεκριμένη αλυσίδα</h4>
                  {p.offers.map((o,i)=><div key={o.retailerId} className={styles.offer}><span>{o.retailerName}{i===0&&<small className={styles.lowest}> Χαμηλότερη καταγραφή</small>}{o.discount&&<small> · Σήμανση έκπτωσης</small>}</span><strong>{money(o.priceEur)}</strong><button type="button" onClick={()=>addProduct(p,o.retailerId)}>Επιλογή</button></div>)}
                </div>}
              </article>;
            })}
          </div>
          {listing.status==="ready"&&(page>1||listing.hasMore)&&<nav className={styles.pagination} aria-label="Σελίδες προϊόντων"><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Προηγούμενη</button><span>Σελίδα {page}</span><button type="button" disabled={!listing.hasMore} onClick={()=>setPage(p=>p+1)}>Επόμενη →</button></nav>}
          {groupInfo&&<section className={styles.alternative} aria-label="Σύγκριση ισοδύναμων προϊόντων">
            <div className={styles.heading}><div><span className={styles.eyebrow}>02 · ΕΛΕΓΜΕΝΕΣ ΕΝΑΛΛΑΚΤΙΚΕΣ</span><h2>{groupInfo.label}</h2></div><button type="button" className={styles.close} onClick={()=>setGroup(null)} aria-label="Κλείσιμο εναλλακτικών">✕</button></div>
            <div className={styles.buttons}><button className={sorting==="unit"?styles.primary:styles.secondary} onClick={()=>setSorting("unit")} type="button">Ανά {groupInfo.basis}</button><button className={sorting==="package"?styles.primary:styles.secondary} onClick={()=>setSorting("package")} type="button">Ανά συσκευασία</button></div>
            {ranked.map(p=><div className={styles.offer} key={p.id}><span><strong>{p.brand||p.name}</strong><small> {p.name} · {p.offers[0]?.retailerName||""}</small></span><span><strong>{money(p.offers[0]?.priceEur)}</strong><small> {money(pricePerUnit(p,p.offers[0]?.priceEur??0)?.price)}/{groupInfo.basis}</small></span><button type="button" onClick={()=>addProduct(p)}>+ Στη λίστα</button></div>)}
            <button className={styles.primary} type="button" onClick={()=>addGroup(groupInfo)}>+ Η οικονομικότερη ισοδύναμη μάρκα</button>
          </section>}
        </section>
        <aside className={styles.sidebar} aria-label="Λίστα και εξοικονόμηση"><div className={styles.basket}>
          <div className={styles.heading}><div><span className={styles.eyebrow}>03 · ΤΟ ΚΑΛΑΘΙ ΣΟΥ</span><h2>Η λίστα αγορών</h2></div><span className={styles.count}>{lines.length}</span></div>
          {!lines.length?<p className={styles.message}>Πρόσθεσε προϊόντα για να υπολογίσουμε το συνολικό κόστος στα σούπερ μάρκετ.</p>:<div className={styles.lines}>{lines.map(l=><div className={styles.line} key={l.id}>
            <div className={styles.lineTop}><strong>{labels[l.id]||"Προϊόν"}</strong><button type="button" onClick={()=>update(lines.filter(x=>x.id!==l.id))} aria-label="Αφαίρεση από τη λίστα">✕</button></div>
            <label>{l.kind==="exact"?"Συσκευασίες":"Ποσότητα ("+(listing.groups.find(g=>g.id===l.groupId)?.basis||"kg")+")"}<input type="number" min="1" max="100" step={l.kind==="exact"?"1":"0.1"} value={l.kind==="exact"?l.packageCount:l.requiredBaseQuantity} onChange={e=>changeLine(l.id,l.kind==="exact"?{packageCount:Number(e.target.value)}:{requiredBaseQuantity:Number(e.target.value)})}/></label>
            <label>Αλυσίδα<select value={l.lockedRetailerId||""} onChange={e=>changeLine(l.id,{lockedRetailerId:e.target.value||undefined})}><option value="">Όποια συμφέρει</option>{listing.retailers.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</select></label>
          </div>)}</div>}
          {notice&&<p className={styles.notice} role="status">{notice}</p>}
          <label>Μέγιστος αριθμός αλυσίδων<select value={storeLimit} onChange={e=>{setStoreLimit(Number(e.target.value));setResult(null);}}><option value={1}>1 σούπερ μάρκετ</option><option value={2}>Έως 2 σούπερ μάρκετ</option><option value={3}>Έως 3 σούπερ μάρκετ</option></select></label>
          <button className={styles.calculate} type="button" onClick={calculate} disabled={!lines.length||listing.status!=="ready"||working}>{working?"Υπολογισμός…":"Βρες το οικονομικότερο καλάθι →"}</button>
          {error&&<p className={styles.error} role="alert">{error}</p>}
          {result&&<div className={styles.results} aria-live="polite">
            <div className={styles.buttons}><button className={mode==="single"?styles.primary:styles.secondary} onClick={()=>setMode("single")} type="button">1 αλυσίδα</button><button className={mode==="limited"?styles.primary:styles.secondary} onClick={()=>setMode("limited")} type="button">Έως {storeLimit}</button><button className={mode==="all"?styles.primary:styles.secondary} onClick={()=>setMode("all")} type="button">Όλες</button></div>
            {plan?.complete?<><small>Σύνολο πλήρους λίστας</small><div className={styles.bigTotal}>{money(plan.totalEur)}</div><p>{plan.storeCount} αλυσίδα/αλυσίδες</p>{plan.items.map(item=><div className={styles.resultLine} key={item.lineId}><span>{item.productName}<small> {item.retailerName} · {item.packages} τεμ.</small></span><strong>{money(item.lineTotalEur)}</strong></div>)}</>:<p className={styles.error}>Δεν υπάρχει πλήρης λίστα με καταγεγραμμένες τιμές. Τα προϊόντα που λείπουν δεν υπολογίζονται ως δωρεάν.</p>}
            {mode!=="single"&&result.savingsVsCheapestCompleteSingleStoreEur!==null&&<p className={styles.saving}>Ενδεικτική εξοικονόμηση έναντι μιας αλυσίδας: <strong>{money(result.savingsVsCheapestCompleteSingleStoreEur)}</strong></p>}
            {result.missingItems.length>0&&<p>Χωρίς τιμή: {result.missingItems.map(item=>labels[item.lineId]||item.lineId).join(", ")}</p>}
            <small>Δεν περιλαμβάνεται κόστος μετακίνησης, διανομή ή προγράμματα επιβράβευσης.</small>
          </div>}
        </div></aside>
      </div>
      <p className={styles.footerNote}>KONTA MOY × PosoKanei · Ανεξάρτητη υπηρεσία αναφοράς τιμών. Χωρίς πραγματική αγορά, απόθεμα ή σύνδεση με το checkout του ΚΟΝΤΑ ΜΟΥ.</p>
    </div>
  </div>;
}
