"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import type {BasketLine,BasketPlan,BasketResult} from "../../../../scripts/posokanei/basket-optimizer.mjs";
import {groupShoppingPlan,planFingerprint,savingsForPlan,shoppingPlanText,packagesForEquivalent} from "../../../../scripts/posokanei/shopping-plan.mjs";
import styles from "./PosoKaneiPublicClient.module.css";

type Offer={retailerId:string;retailerName:string;priceEur:number;observedAt:string|null;discount:boolean};
type Product={id:string;name:string;brand:string|null;category:string|null;unit:string|null;unitQuantity:number|null;imageUrl?:string|null;groupId:string|null;offers:Offer[]};
type Group={id:string;label:string;basis:"kg"|"l"|"piece"};
type Retailer={id:string;name:string};
type Listing={status:string;snapshotDate?:string;source?:string;count?:number;page?:number;hasMore?:boolean;products:Product[];categories:string[];categoryGroups?:string[];groups:Group[];retailers:Retailer[]};
type Cheaper={id:string;name:string;brand:string;priceEur:number;unitPriceEur:number;retailerName:string;retailerId:string;savingPercent:number;packageQuantity:number;unit:string;packageCount:number;originalTotalEur:number;candidateTotalEur:number;savingsEur:number;confidence:"reviewed_equivalent"|"unverified_match"};
type Mode="single"|"limited";
const money=(n:number|null|undefined)=>typeof n==="number"&&Number.isFinite(n)?new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(n):"—";
const empty:Listing={status:"unavailable",products:[],categories:[],groups:[],retailers:[]};
function pricePerUnit(product:Product,price:number){
  const base:Record<string,[string,number]>={kg:["kg",1],g:["kg",.001],gr:["kg",.001],l:["L",1],L:["L",1],ml:["L",.001],piece:["τεμ.",1],pcs:["τεμ.",1]};
  const unit=product.unit?base[product.unit]:undefined;
  if(!unit||!product.unitQuantity||product.unitQuantity<=0)return null;
  return {price:price/(product.unitQuantity*unit[1]),unit:unit[0]};
}
const id=()=>("line_"+Math.random().toString(36).slice(2,11));
const planOf=(r:BasketResult,m:Mode):BasketPlan|null=>m==="single"?r.bestSingleStore:r.cheapestWithinStoreLimit;

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
  const [storeLimit,setStoreLimit]=useState(5);
  const [excluded,setExcluded]=useState<string[]>([]);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [preferencesLoaded,setPreferencesLoaded]=useState(false);
  const [brandResults,setBrandResults]=useState<Record<string,{
    lineId:string;sourceProductId:string;basis:string|null;sourceAmount:number|null;
    reason:string;alternatives:Cheaper[];candidates:Cheaper[];
  }>>({});
  const [checkingBrands,setCheckingBrands]=useState(false);
  const [brandRefresh,setBrandRefresh]=useState(0);
  const [mode,setMode]=useState<Mode>("limited");
  const [result,setResult]=useState<BasketResult|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [progress,setProgress]=useState<{key:string;completed:string[]}>({key:"",completed:[]});
  useEffect(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem("posokanei-shopping-v2")||"{}") as {excluded?:string[];maxStores?:number;lines?:BasketLine[];labels?:Record<string,string>};
      if(Array.isArray(saved.excluded))setExcluded(saved.excluded.filter(x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x)).slice(0,24));
      if(typeof saved.maxStores==="number"&&Number.isSafeInteger(saved.maxStores)&&saved.maxStores>=1&&saved.maxStores<=5)setStoreLimit(saved.maxStores);
      if(Array.isArray(saved.lines)&&saved.lines.length<=20&&saved.lines.every(x=>x&&typeof x.id==="string"&&["exact","group"].includes(x.kind)))setLines(saved.lines);
      if(saved.labels&&typeof saved.labels==="object")setLabels(saved.labels);
    }catch{}
    setPreferencesLoaded(true);
  },[]);
  useEffect(()=>{
    if(!preferencesLoaded)return;
    try{localStorage.setItem("posokanei-shopping-v2",JSON.stringify({excluded,maxStores:storeLimit,lines,labels}));}catch{}
  },[preferencesLoaded,excluded,storeLimit,lines,labels]);
  useEffect(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem("posokanei-checklist-v1")||"{}") as {key?:unknown;completed?:unknown};
      if(typeof saved.key==="string"&&saved.key.length<=3000&&Array.isArray(saved.completed)&&saved.completed.length<=20&&
         saved.completed.every(x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x)))setProgress({key:saved.key,completed:saved.completed as string[]});
    }catch{}
  },[]);
  useEffect(()=>{
    try{localStorage.setItem("posokanei-checklist-v1",JSON.stringify(progress));}catch{}
  },[progress]);
  useEffect(()=>{
    const abort=new AbortController();
    if(!preferencesLoaded)return ()=>abort.abort();
    const timer=setTimeout(async()=>{
      setLoading(true);
      try {
        const url=new URL("/api/posokanei",window.location.origin);
        if(q.trim())url.searchParams.set("q",q.trim());
        if(category)url.searchParams.set("category",category);
        if(excluded.length)url.searchParams.set("exclude",excluded.join(","));
        url.searchParams.set("page",String(page));
        const response=await fetch(url.toString(),{signal:abort.signal,cache:"no-store"});
        const data=await response.json() as Listing;
        if(!abort.signal.aborted)setListing(data.status==="ready"?data:empty);
      }catch{if(!abort.signal.aborted)setListing(empty);}
      finally{if(!abort.signal.aborted)setLoading(false);}
    },180);
    return ()=>{clearTimeout(timer);abort.abort();};
  },[q,category,page,excluded,preferencesLoaded]);
  useEffect(()=>{
    if(!group){setAlternatives([]);return;}
    const abort=new AbortController();
    void (async()=>{
      try {
        const response=await fetch("/api/posokanei?group="+encodeURIComponent(group)+(excluded.length?"&exclude="+encodeURIComponent(excluded.join(",")):""),{signal:abort.signal,cache:"no-store"});
        const data=await response.json() as Listing;
        if(!abort.signal.aborted)setAlternatives(data.status==="ready"?data.products:[]);
      }catch{if(!abort.signal.aborted)setAlternatives([]);}
    })();
    return ()=>abort.abort();
  },[group,excluded]);
  const groupInfo=listing.groups.find(g=>g.id===group);
  useEffect(()=>{
    if(group&&alternatives.length)
      document.getElementById("posokanei-reviewed-comparisons")?.scrollIntoView({behavior:"smooth",block:"start"});
  },[group,alternatives]);
  const ranked=useMemo(()=>[...alternatives].sort((a,b)=>{
    const aPrice=a.offers[0]?.priceEur??Infinity,bPrice=b.offers[0]?.priceEur??Infinity;
    if(sorting==="unit"){
      const au=pricePerUnit(a,aPrice)?.price??Infinity,bu=pricePerUnit(b,bPrice)?.price??Infinity;
      if(au!==bu)return au-bu;
    }
    return aPrice-bPrice||a.name.localeCompare(b.name,"el");
  }),[alternatives,sorting]);
  const update=useCallback((next:BasketLine[])=>{setLines(next);setResult(null);setError("");},[]);
  // One race-safe, quantity-aware request refreshes ALL existing basket SKUs.
  // A store exclusion or line edit automatically invalidates older alerts.
  useEffect(()=>{
    if(!preferencesLoaded)return;
    const exact=lines.filter((line):line is Extract<BasketLine,{kind:"exact"}>=>line.kind==="exact");
    setBrandResults({});
    if(!exact.length){setCheckingBrands(false);return;}
    const controller=new AbortController();
    setCheckingBrands(true);
    const timer=setTimeout(()=>{
      void (async()=>{
        try{
          const response=await fetch("/api/posokanei/alternatives",{
            method:"POST",cache:"no-store",signal:controller.signal,
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
              lines:exact.map(l=>({id:l.id,sourceProductId:l.sourceProductId,packageCount:l.packageCount})),
              excludedRetailerIds:excluded
            })
          });
          const json=await response.json() as {
            status:string;lines?:Array<{
              lineId:string;sourceProductId:string;basis:string|null;sourceAmount:number|null;
              reason:string;alternatives:Cheaper[];candidates:Cheaper[]
            }>
          };
          if(!response.ok||json.status!=="ready")throw Error("unavailable");
          if(!controller.signal.aborted)setBrandResults(Object.fromEntries(
            (json.lines||[]).filter(x=>exact.some(l=>l.id===x.lineId&&l.sourceProductId===x.sourceProductId))
              .map(x=>[x.lineId,x])
          ));
        }catch{
          if(!controller.signal.aborted)setNotice("Ο έλεγχος φθηνότερων μαρκών δεν ολοκληρώθηκε. Δοκίμασε ξανά.");
        }finally{
          if(!controller.signal.aborted)setCheckingBrands(false);
        }
      })();
    },240);
    return()=>{clearTimeout(timer);controller.abort();};
  },[excluded,lines,preferencesLoaded,brandRefresh]);
  function addProduct(p:Product){
    if(lines.length>=20){setNotice("Μπορείς να προσθέσεις έως 20 προϊόντα στη λίστα.");return;}
    const key=id();
    setLabels(current=>({...current,[key]:p.name}));
    update([...lines,{id:key,kind:"exact",sourceProductId:p.id,packageCount:1}]);
    setNotice("Προστέθηκε στη λίστα: "+p.name+" · ελέγχονται όλες οι μάρκες της λίστας.");
  }
  function chooseCheaper(lineId:string,next:Cheaper){
    const selected=brandResults[lineId];
    if(!selected||typeof selected.sourceAmount!=="number"||!selected.basis)return;
    const original=lines.find(line=>line.id===lineId);
    const packages=original?.kind==="exact"&&
      original.sourceProductId===selected.sourceProductId&&next.unit===selected.basis?
      packagesForEquivalent(selected.sourceAmount,original.packageCount,next.packageQuantity):null;
    if(packages===null){
      setNotice("Η νέα συσκευασία δεν επαρκεί για την ίδια ποσότητα.");
      return;
    }
    changeLine(lineId,{sourceProductId:next.id,packageCount:packages});
    setLabels(current=>({...current,[lineId]:next.name}));
    setNotice("Η μάρκα ενημερώθηκε. Η ποσότητα διατηρήθηκε με "+packages+" συσκευασίες.");
  }
  function addGroup(g:Group){
    if(lines.length>=20){setNotice("Μπορείς να προσθέσεις έως 20 προϊόντα στη λίστα.");return;}
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
      const r=await fetch("/api/posokanei/optimize",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({lines,storeLimit,retailerIds:listing.retailers.filter(r=>!excluded.includes(r.id)).map(r=>r.id)})});
      const data=await r.json() as {status?:string;result?:BasketResult;error?:string};
      if(!r.ok||data.status!=="ready"||!data.result)throw Error(data.error||"Η σύγκριση δεν ολοκληρώθηκε.");
      setResult(data.result);setMode("limited");
    }catch(e){setError(e instanceof Error?e.message:"Σφάλμα υπολογισμού.");}
    finally{setWorking(false);}
  }
  const plan=result?planOf(result,mode):null;
  const storeSections=groupShoppingPlan(plan);
  const planKey=planFingerprint(result?.snapshotDate||"",mode,plan);
  const completed=new Set(progress.key===planKey?progress.completed:[]);
  const completedCount=plan?.complete?plan.items.filter(item=>completed.has(item.lineId)).length:0;
  const actualSavings=savingsForPlan(result,plan);
  function toggleLineDone(lineId:string){
    if(!plan?.complete)return;
    setProgress(previous=>{
      const current=previous.key===planKey?previous.completed:[];
      return {key:planKey,completed:current.includes(lineId)?current.filter(id=>id!==lineId):[...current,lineId]};
    });
  }
  async function copyPlan(){
    const text=shoppingPlanText(result,plan,mode);
    if(!text)return;
    try{
      await navigator.clipboard.writeText(text);
      setNotice("Η λίστα ανά σούπερ μάρκετ αντιγράφηκε. Μπορείς να τη στείλεις ή να την αποθηκεύσεις.");
    }catch{
      setNotice("Δεν επιτράπηκε η αντιγραφή. Δοκίμασε ξανά από ασφαλή σύνδεση.");
    }
  }
  return <div className={styles.scope}>
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>ΚΟΝΤΑ ΜΟΥ · ΑΝΕΞΑΡΤΗΤΗ ΣΥΓΚΡΙΣΗ</p>
          <h1>KONTA MOY <span>× PosoKanei</span></h1>
          <p className={styles.lead}>Σύγκρινε τιμές στα σούπερ μάρκετ, διάλεξε τη μάρκα που προτιμάς και υπολόγισε το πραγματικά οικονομικότερο <em>καταγεγραμμένο</em> καλάθι σου.</p>
          <div className={styles.tags}><span>Τιμές ανά αλυσίδα</span><span>Ισοδύναμες μάρκες</span><span>Έως 5 σούπερ μάρκετ</span></div>
        </div>
        <div className={styles.heroBox}>
          <small>Τελευταία καταγραφή</small>
          <strong>{loading?"Φόρτωση τιμών…":listing.snapshotDate??"Δεν έχει δημοσιευτεί"}</strong>
          <span>{loading?"Ενημέρωση πραγματικών καταγεγραμμένων τιμών…":listing.status==="ready"?"Ενδεικτικές καταγεγραμμένες τιμές":"Αναμένεται επαληθευμένη δημοσίευση τιμών"}</span>
        </div>
      </div>
      <section className={styles.preferences} aria-label="Προτιμήσεις αγορών">
        <div className={styles.prefsHeader}>
          <div><span className={styles.eyebrow}>ΠΡΩΤΑ ΟΙ ΕΠΙΛΟΓΕΣ ΣΟΥ</span><h2>Πού θέλεις να ψωνίσεις;</h2><p>Διάλεξε μια φορά τις αλυσίδες που σε εξυπηρετούν. Όλες οι συγκρίσεις θα σεβαστούν αυτή την επιλογή.</p></div>
          <button type="button" className={styles.secondary} onClick={()=>setSettingsOpen(x=>!x)} aria-expanded={settingsOpen}>{settingsOpen?"Κλείσιμο ρυθμίσεων":"Αλυσίδες & όριο αγορών"} ⚙</button>
        </div>
        <div className={styles.prefsSummary}><span><strong>{listing.retailers.length-excluded.filter(id=>listing.retailers.some(r=>r.id===id)).length}</strong> επιλεγμένες αλυσίδες</span><span>Μοίρασμα σε <strong>έως {storeLimit}</strong> σούπερ μάρκετ</span></div>
        {settingsOpen&&<div className={styles.prefsPanel}>
          <fieldset><legend>Αλυσίδες που σε εξυπηρετούν</legend><p>Αποεπίλεξε όσες δεν βρίσκονται κοντά σου. Δεν χρησιμοποιούμε αυτόματα την τοποθεσία σου.</p>
            <div className={styles.retailerGrid}>{listing.retailers.map(r=><label key={r.id} className={styles.retailerCheck}><input type="checkbox" checked={!excluded.includes(r.id)} onChange={e=>{setExcluded(old=>e.target.checked?old.filter(x=>x!==r.id):[...old,r.id]);setResult(null);setPage(1);}}/><span>{r.name}</span></label>)}</div>
            <div className={styles.prefsActions}><button type="button" className={styles.textButton} onClick={()=>{setExcluded([]);setPage(1);setResult(null);}}>Επιλογή όλων</button><button type="button" className={styles.textButton} onClick={()=>setSettingsOpen(false)}>Ολοκλήρωση ✓</button></div>
          </fieldset>
          <label className={styles.maxStores}>Μέγιστος αριθμός σούπερ μάρκετ <select value={storeLimit} onChange={e=>{setStoreLimit(Number(e.target.value));setResult(null);}}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n===1?"1 αλυσίδα":"Έως "+n+" αλυσίδες"}</option>)}</select></label>
        </div>}
      </section>
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
            <label>Κατηγορία<select value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}><option value="">Όλες οι κατηγορίες</option>{(listing.categoryGroups||[]).map(c=><option key={c} value={c}>{c}</option>)}</select></label>
          </div>
          {listing.groups.length>0&&<details className={styles.reviewedBrowser}>
            <summary>Ελεγμένες συγκρίσεις μαρκών · {listing.groups.length} είδη προϊόντων</summary>
            <p>Διάλεξε ένα είδος για να δεις διαφορετικές μάρκες και τις καταγεγραμμένες τιμές τους ανά συσκευασία ή κιλό. Η σύγκριση αφορά τον τύπο του προϊόντος, όχι εγγύηση ίδιων συστατικών ή προέλευσης.</p>
            <div className={styles.reviewedChips}>
              {listing.groups.map(g=><button key={g.id} type="button" className={styles.secondary}
                onClick={()=>{setGroup(g.id);setSorting("unit");}}>{g.label} ↗</button>)}
            </div>
          </details>}
          {loading&&<p className={styles.message} role="status">Φόρτωση καταλόγου…</p>}
          {listing.status==="ready"&&!loading&&listing.products.length===0&&<p className={styles.message}>Δεν βρέθηκαν καταγεγραμμένες τιμές με αυτά τα κριτήρια.</p>}
          <div className={styles.cards}>
            {listing.products.map(p=>{
              const best=p.offers[0],expanded=p.id===active,unit=best?pricePerUnit(p,best.priceEur):null;
              return <article key={p.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.glyph} aria-hidden="true">{p.imageUrl?<img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.hidden=true;}}/>:"▦"}</div>
                  <div className={styles.productTitle}><small>{p.brand||"Χωρίς μάρκα"} · {p.category||"Λοιπά"}</small><h3>{p.name}</h3><small>{p.unitQuantity??"—"} {p.unit||""} · {p.offers.length} καταγραφές</small></div>
                  <div className={styles.amount}><small>Από</small><strong>{money(best?.priceEur)}</strong><small>{best?.retailerName||"—"}</small>{unit&&<small>{money(unit.price)}/{unit.unit}</small>}</div>
                </div>
                <div className={styles.buttons}>
                  <button className={styles.primary} type="button" disabled={!best} onClick={()=>addProduct(p)}>+ Στη λίστα · καλύτερη τιμή</button>
                  <button className={styles.secondary} type="button" onClick={()=>setActive(expanded?null:p.id)} aria-expanded={expanded}>Τιμές στις αλυσίδες {expanded?"−":"+"}</button>
                  {p.groupId&&<button className={styles.textButton} type="button" onClick={()=>{setGroup(p.groupId);setSorting("unit");}}>Άλλες μάρκες ↗</button>}
                </div>
                {expanded&&<div className={styles.offers}><h4>Καταγεγραμμένες τιμές · μόνο από τις επιλεγμένες αλυσίδες</h4>
                  {p.offers.map((o,i)=><div key={o.retailerId} className={styles.offer}><span>{o.retailerName}{i===0&&<small className={styles.lowest}> Χαμηλότερη καταγραφή</small>}{o.discount&&<small> · Σήμανση έκπτωσης</small>}</span><strong>{money(o.priceEur)}</strong></div>)}
                </div>}
              </article>;
            })}
          </div>
          {listing.status==="ready"&&(page>1||listing.hasMore)&&<nav className={styles.pagination} aria-label="Σελίδες προϊόντων"><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Προηγούμενη</button><span>Σελίδα {page}</span><button type="button" disabled={!listing.hasMore} onClick={()=>setPage(p=>p+1)}>Επόμενη →</button></nav>}
          {groupInfo&&<section id="posokanei-reviewed-comparisons" className={styles.alternative} aria-label="Σύγκριση ισοδύναμων προϊόντων">
            <div className={styles.heading}><div><span className={styles.eyebrow}>02 · ΕΛΕΓΜΕΝΕΣ ΕΝΑΛΛΑΚΤΙΚΕΣ</span><h2>{groupInfo.label}</h2></div><button type="button" className={styles.close} onClick={()=>setGroup(null)} aria-label="Κλείσιμο εναλλακτικών">✕</button></div>
            <p className={styles.methodNote}>Προϊόντα επιλεγμένα βάσει ελεγμένης ονομασίας, τύπου και μονάδας μέτρησης. Πριν αντικαταστήσεις μάρκα, έλεγξε συστατικά, αλλεργιογόνα και προέλευση.</p>
            <div className={styles.buttons}><button className={sorting==="unit"?styles.primary:styles.secondary} onClick={()=>setSorting("unit")} type="button">Ανά {groupInfo.basis}</button><button className={sorting==="package"?styles.primary:styles.secondary} onClick={()=>setSorting("package")} type="button">Ανά συσκευασία</button></div>
            {ranked.map(p=><div className={styles.offer} key={p.id}><span><strong>{p.brand||p.name}</strong><small> {p.name} · {p.offers[0]?.retailerName||""}</small></span><span><strong>{money(p.offers[0]?.priceEur)}</strong><small> {money(pricePerUnit(p,p.offers[0]?.priceEur??0)?.price)}/{groupInfo.basis}</small></span><button type="button" onClick={()=>addProduct(p)}>+ Στη λίστα</button></div>)}
            <button className={styles.primary} type="button" onClick={()=>addGroup(groupInfo)}>+ Η οικονομικότερη ισοδύναμη μάρκα</button>
          </section>}
        </section>
        <aside className={styles.sidebar} aria-label="Λίστα και εξοικονόμηση"><div className={styles.basket} id="posokanei-basket">
          <div className={styles.heading}><div><span className={styles.eyebrow}>03 · ΤΟ ΚΑΛΑΘΙ ΣΟΥ</span><h2>Η λίστα αγορών</h2></div><span className={styles.count}>{lines.length}</span></div>
          {!lines.length?<p className={styles.message}>Πρόσθεσε προϊόντα για να υπολογίσουμε το συνολικό κόστος στα σούπερ μάρκετ.</p>:<details className={styles.listDetails}><summary>Προϊόντα στη λίστα ({lines.length}) · Προβολή / επεξεργασία</summary><div className={styles.lines}>{lines.map(l=><div className={styles.line} key={l.id}>
            <div className={styles.lineTop}><strong>{labels[l.id]||"Προϊόν"}</strong><button type="button" onClick={()=>update(lines.filter(x=>x.id!==l.id))} aria-label="Αφαίρεση από τη λίστα">✕</button></div>
            <label>{l.kind==="exact"?"Συσκευασίες":"Ποσότητα ("+(listing.groups.find(g=>g.id===l.groupId)?.basis||"kg")+")"}<input type="number" min="1" max="100" step={l.kind==="exact"?"1":"0.1"} value={l.kind==="exact"?l.packageCount:l.requiredBaseQuantity} onChange={e=>changeLine(l.id,l.kind==="exact"?{packageCount:Number(e.target.value)}:{requiredBaseQuantity:Number(e.target.value)})}/></label>
            {l.kind==="exact"&&<small className={styles.brandStatus}>{checkingBrands?"Έλεγχος συγκρίσιμων μαρκών…":brandResults[l.id]?.alternatives.length?`✅ ${brandResults[l.id].alternatives.length} ελεγμένη/ες φθηνότερη/ες μάρκα/ες`:brandResults[l.id]?.candidates?.length?`🔎 ${brandResults[l.id].candidates.length} πιθανές οικονομικότερες επιλογές (μη ελεγμένη ισοδυναμία)`:brandResults[l.id]?.reason==="unknown_quantity"?"Δεν υπάρχουν επαρκή στοιχεία ποσότητας":brandResults[l.id]?.reason==="no_source_price"?"Δεν υπάρχει τιμή στις επιλεγμένες αλυσίδες":"Δεν βρέθηκε φθηνότερη συγκρίσιμη μάρκα"}</small>}

          </div>)}</div></details>}
          {notice&&<p className={styles.notice} role="status">{notice}</p>}
          {lines.some(l=>l.kind==="exact")&&<button type="button" className={styles.textButton} onClick={()=>setBrandRefresh(n=>n+1)} disabled={checkingBrands}>{checkingBrands?"Έλεγχος όλων των προϊόντων…":"Ανανέωση ελέγχου μαρκών για όλη τη λίστα ↻"}</button>}
          {Object.values(brandResults).filter(x=>x.alternatives.length>0).map(result=><details className={styles.suggestion} key={result.lineId}>
            <summary>💡 Φθηνότερες μάρκες για {labels[result.lineId]||"προϊόν"} ({result.alternatives.length})</summary>
            <p>Ίδια λεπτομερής κατηγορία και περιγραφή προϊόντος. Σύγκριση του κόστους για τη ζητούμενη ποσότητα, με ολόκληρες συσκευασίες και μόνο τις επιλεγμένες αλυσίδες. Έλεγξε τα χαρακτηριστικά πριν αντικαταστήσεις.</p>
            {result.alternatives.map(a=><div className={styles.suggestionLine} key={a.id}>
              <span><strong>{a.name}</strong><small>{a.retailerName} · {a.packageCount} συσκ. × {money(a.priceEur)} = {money(a.candidateTotalEur)}</small><small>Έναντι {money(a.originalTotalEur)} · λιγότερα {money(a.savingsEur)} ({a.savingPercent}%)</small></span>
              <button type="button" className={styles.secondary} onClick={()=>chooseCheaper(result.lineId,a)}>Αντικατάσταση μάρκας</button>
            </div>)}
            <small>Ενδεικτικές καταγεγραμμένες τιμές αλυσίδων · η τελική εξοικονόμηση εξαρτάται από το συνολικό σχέδιο αγορών.</small>
          </details>)}
          {Object.values(brandResults).filter(x=>x.candidates?.length>0).map(entry=><details className={styles.suggestion} key={"candidate-"+entry.lineId}>
            <summary>🔎 Πιθανά οικονομικότερα προϊόντα για {labels[entry.lineId]||"προϊόν"} ({entry.candidates.length})</summary>
            <p><strong>Μη επιβεβαιωμένες εναλλακτικές:</strong> τα προϊόντα έχουν ομοιότητες στην κατηγορία, την ονομασία και τις μονάδες, αλλά ΔΕΝ έχει επαληθευτεί ότι είναι ισοδύναμα. Συστατικά, αλλεργιογόνα, διατροφικές ιδιότητες, τύπος και χρήση μπορεί να διαφέρουν. Η σύγκριση τιμής είναι υποθετική και δεν αποτελεί εγγυημένη εξοικονόμηση.</p>
            {entry.candidates.map(candidate=><div className={styles.suggestionLine} key={candidate.id}>
              <span><strong>{candidate.name}</strong><small>{candidate.retailerName} · {candidate.packageCount} συσκ. × {money(candidate.priceEur)} = {money(candidate.candidateTotalEur)}</small><small>Διαφορά καταγεγραμμένης τιμής, μόνο αν καλύπτει την ανάγκη σου: {money(candidate.savingsEur)}</small></span>
            </div>)}
            <small>Δεν επιτρέπεται αυτόματη αντικατάσταση από μη ελεγμένες ομάδες προϊόντων. Επίλεξε χειροκίνητα ένα διαφορετικό προϊόν από την αναζήτηση αφού ελέγξεις τα χαρακτηριστικά του.</small>
          </details>)}
          <p className={styles.basketPreset}>Αυτόματη επιλογή οικονομικότερων αλυσίδων · έως {storeLimit} από τις επιλεγμένες <button type="button" onClick={()=>{setSettingsOpen(true);window.scrollTo({top:0,behavior:"smooth"});}}>Αλλαγή</button></p>
          <button className={styles.calculate} type="button" onClick={calculate} disabled={!lines.length||listing.status!=="ready"||working||listing.retailers.length===excluded.length}>{working?"Υπολογισμός…":"Βρες το οικονομικότερο καλάθι →"}</button>
          {error&&<p className={styles.error} role="alert">{error}</p>}
          {result&&<div className={styles.results} aria-live="polite">
            <div className={styles.buttons}><button className={mode==="single"?styles.primary:styles.secondary} onClick={()=>setMode("single")} type="button">1 αλυσίδα</button><button className={mode==="limited"?styles.primary:styles.secondary} onClick={()=>setMode("limited")} type="button">Έως {storeLimit}</button></div>
            {plan?.complete?<><small>Σύνολο πλήρους λίστας</small><div className={styles.bigTotal}>{money(plan.totalEur)}</div><p className={styles.methodNote}>Στις ίδιες τιμές προτιμάμε αλυσίδες που ήδη επισκέπτεσαι, ώστε να αποφεύγονται επιπλέον στάσεις.</p>
              <div className={styles.planToolbar}>
                <span role="status">{completedCount}/{plan.items.length} προϊόντα στη λίστα ολοκληρώθηκαν</span>
                <button type="button" className={styles.secondary} onClick={()=>{void copyPlan();}}>Αντιγραφή ανά κατάστημα</button>
              </div>
              <div className={styles.storePlans}>{storeSections.map(store=><section className={styles.storePlan} key={store.id} aria-label={"Λίστα για "+store.name}>
                <div className={styles.storePlanHeader}><strong>{store.name}</strong><span>{store.items.length} προϊόντα · {money(store.subtotalEur)}</span></div>
                {store.items.map(item=><label className={styles.storePlanItem} key={item.lineId}>
                  <input type="checkbox" checked={completed.has(item.lineId)} onChange={()=>toggleLineDone(item.lineId)} aria-label={"Αγοράστηκε "+item.productName}/>
                  <span className={completed.has(item.lineId)?styles.doneItem:undefined}>{item.productName}<small>{item.packages} συσκ. · {money(item.pricePerPackageEur)} / συσκ.</small></span>
                  <strong>{money(item.lineTotalEur)}</strong>
                </label>)}
              </section>)}</div>
              <p className={styles.planCaution}>Μπορείς να τσεκάρεις όσα αγόρασες. Η πρόοδος μένει μόνο σε αυτή τη συσκευή, για το συγκεκριμένο σχέδιο και ημερομηνία τιμών.</p>
            </>:<p className={styles.error}>Δεν υπάρχει πλήρης λίστα με καταγεγραμμένες τιμές. Τα προϊόντα που λείπουν δεν υπολογίζονται ως δωρεάν.</p>}
            {mode!=="single"&&actualSavings!==null&&<p className={styles.saving}>Ενδεικτική εξοικονόμηση <strong>αυτού του σχεδίου</strong> έναντι μιας αλυσίδας: <strong>{money(actualSavings)}</strong></p>}
            <section className={styles.classicComparison} aria-label="Σύγκριση με σενάριο επιλογής μίας αλυσίδας βάσει κάλυψης">
              <span className={styles.eyebrow}>ΣΥΓΚΡΙΣΗ ΣΤΡΑΤΗΓΙΚΩΝ</span>
              <h3>Πόσα εξοικονομείς με τη μοιρασμένη λίστα;</h3>
              <p className={styles.methodNote}>Προσομοίωση παραδοσιακής επιλογής: διαλέγουμε <strong>μία</strong> από τις επιτρεπόμενες αλυσίδες που διαθέτει τα περισσότερα διαφορετικά προϊόντα της λίστας, <strong>χωρίς να βελτιστοποιούμε το συνολικό κόστος</strong>. Σε ισοβαθμία εφαρμόζεται σταθερή σειρά αλυσίδων, όχι η τιμή. Πρόκειται για ενδεικτικό σενάριο σύγκρισης, όχι επαληθευμένη αναπαραγωγή του αλγορίθμου του επίσημου PosoKanei.</p>
              {result.coverageMatchedProductsComparison?
                <>
                  <p className={styles.matchedIntro}>
                    <strong>Δίκαιη σύγκριση μόνο για {result.coverageMatchedProductsComparison.matchedItemCount} από τα {result.lineCount} προϊόντα</strong> που έχουν καταγεγραμμένη τιμή στο {result.coverageMatchedProductsComparison.benchmarkRetailerName}.
                    {result.coverageMatchedProductsComparison.unmatchedItemCount>0?" Τα υπόλοιπα "+result.coverageMatchedProductsComparison.unmatchedItemCount+" προϊόντα δεν συμμετέχουν σε αυτή τη σύγκριση.":""}
                  </p>
                  <div className={styles.comparisonColumns}>
                    <div className={styles.comparisonOption}>
                      <small>Μία αλυσίδα · {result.coverageMatchedProductsComparison.benchmarkRetailerName}</small>
                      <strong>{money(result.coverageMatchedProductsComparison.benchmarkSubtotalEur)}</strong>
                      <span>Κόστος των {result.coverageMatchedProductsComparison.matchedItemCount} διαθέσιμων προϊόντων</span>
                    </div>
                    <div className={styles.comparisonOption}>
                      <small>KONTA MOY · μοίρασμα των ίδιων προϊόντων</small>
                      <strong>{money(result.coverageMatchedProductsComparison.optimizedSubtotalEur)}</strong>
                      <span>{result.coverageMatchedProductsComparison.optimizedStoreCount} {result.coverageMatchedProductsComparison.optimizedStoreCount===1?"στάση":"στάσεις"} · έως {storeLimit} αλυσίδες</span>
                    </div>
                  </div>
                  <p className={styles.saving}>Εξοικονόμηση για <strong>τα ίδια {result.coverageMatchedProductsComparison.matchedItemCount} προϊόντα</strong>: <strong>{money(result.coverageMatchedProductsComparison.savingsEur)} ({result.coverageMatchedProductsComparison.savingsPercent.toLocaleString("el-GR")}%)</strong></p>
                  <details className={styles.matchedDetails} open>
                    <summary>Αναλυτικές τιμές ανά προϊόν ({result.coverageMatchedProductsComparison.matchedItemCount})</summary>
                    <div className={styles.matchedHead}><span>Προϊόν</span><span>{result.coverageMatchedProductsComparison.benchmarkRetailerName}</span><span>KONTA MOY</span></div>
                    {result.coverageMatchedProductsComparison.products.map(item=>
                      <div className={styles.matchedProductRow} key={item.lineId}>
                        <div className={styles.matchedName}><strong>{item.name}</strong><small>{item.packages} {item.packages===1?"συσκευασία":"συσκευασίες"}</small></div>
                        <div className={styles.matchedPrice}><strong>{money(item.benchmarkLineTotalEur)}</strong><small>{money(item.benchmarkUnitPriceEur)}/συσκ.</small></div>
                        <div className={styles.matchedPrice}><strong>{money(item.optimizedLineTotalEur)}</strong><small>{item.optimizedRetailerName}</small><small>{money(item.optimizedUnitPriceEur)}/συσκ.</small>
                          {item.savingEur>0&&<em>−{money(item.savingEur)}</em>}
                        </div>
                      </div>
                    )}
                  </details>
                  {result.coverageMatchedProductsComparison.unmatchedItemCount>0&&
                    <p className={styles.methodNote}>Εκτός σύγκρισης — χωρίς καταγεγραμμένη τιμή στο {result.coverageMatchedProductsComparison.benchmarkRetailerName}: {result.coverageMatchedProductsComparison.unmatchedLineIds.map(id=>labels[id]||"Προϊόν λίστας").join(", ")}. Το πλήρες κόστος της λίστας εμφανίζεται ξεχωριστά πιο πάνω.</p>}
                  <p className={styles.methodNote}>Οι τιμές του KONTA MOY εδώ αφορούν ανεξάρτητη βελτιστοποίηση <strong>ακριβώς των ίδιων προϊόντων και ποσοτήτων</strong>, όχι άλλες μάρκες και όχι τη συνολική λίστα. Συνεπώς οι αλυσίδες μπορεί να διαφέρουν από το πλάνο ολόκληρου του καλαθιού.</p>
                </>
                :<p className={styles.methodNote}>Δεν υπάρχουν κοινά προϊόντα με καταγεγραμμένη τιμή για να γίνει ισότιμη σύγκριση.</p>}
            </section>
            {result.missingItems.length>0&&<p>Χωρίς τιμή: {result.missingItems.map(item=>labels[item.lineId]||item.lineId).join(", ")}</p>}
            <small>Δεν περιλαμβάνεται κόστος μετακίνησης, διανομή ή προγράμματα επιβράβευσης.</small>
          </div>}
        </div></aside>
      </div>
      {!!lines.length&&<button type="button" className={styles.mobileBasketShortcut} onClick={()=>document.getElementById("posokanei-basket")?.scrollIntoView({behavior:"smooth",block:"start"})}>{Object.values(brandResults).some(x=>x.alternatives.length>0||x.candidates?.length>0)?"🔎 Εναλλακτικές μάρκες · Δες →":`🛒 Λίστα ${lines.length} · Υπολογισμός →`}</button>}
      <p className={styles.footerNote}>KONTA MOY × PosoKanei · Ανεξάρτητη υπηρεσία αναφοράς τιμών. Χωρίς πραγματική αγορά, απόθεμα ή σύνδεση με το checkout του ΚΟΝΤΑ ΜΟΥ.</p><p className={styles.footerNote}>Πηγή τιμών: <a href="https://posokanei.gov.gr/" target="_blank" rel="noopener noreferrer">posokanei.gov.gr</a> · Δημόσιο ημερήσιο αρχείο: <a href="https://github.com/spyrosavl/posokanei" target="_blank" rel="noopener noreferrer">spyrosavl/posokanei</a> · Νομική βάση περαιτέρω χρήσης: ν. 4727/2020, άρθρο 61 (με επιφύλαξη άρθρου 59). Δεν αποτελεί επίσημη κυβερνητική υπηρεσία.</p>
    </div>
  </div>;
}
