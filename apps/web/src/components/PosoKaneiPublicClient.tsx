"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import type {BasketLine,BasketPlan,BasketResult} from "../../../../scripts/posokanei/basket-optimizer.mjs";
import {groupShoppingPlan,planFingerprint,savingsForPlan,savingsIncludingBrands,shoppingPlanText,packagesForEquivalent} from "../../../../scripts/posokanei/shopping-plan.mjs";
import {summarizeCheaperAlternatives} from "../../../../scripts/posokanei/alternative-opportunities.mjs";
import styles from "./PosoKaneiPublicClient.module.css";

type Offer={retailerId:string;retailerName:string;priceEur:number;observedAt:string|null;discount:boolean};
type Product={id:string;name:string;brand:string|null;category:string|null;unit:string|null;unitQuantity:number|null;imageUrl?:string|null;groupId:string|null;offers:Offer[];approvedAlternatives:Cheaper[]};
type Group={id:string;label:string;basis:"kg"|"l"|"piece";approvalMethod?:"automatic_commodity"|"manual_review"};
type Retailer={id:string;name:string};
type Listing={status:string;snapshotDate?:string;source?:string;count?:number;page?:number;hasMore?:boolean;products:Product[];categories:string[];categoryGroups?:string[];groups:Group[];retailers:Retailer[]};
type Cheaper={id:string;name:string;brand:string;priceEur:number;unitPriceEur:number;retailerName:string;retailerId:string;savingPercent:number;packageQuantity:number;unit:string;packageCount:number;originalTotalEur:number;candidateTotalEur:number;savingsEur:number;confidence:"reviewed_equivalent"|"automatically_verified";approvalMethod?:"automatic_commodity"|"manual_review"|"automatic_match"};
type Mode="single"|"limited";
type AccountStatus="checking"|"guest"|"customer"|"error";
type SavedList={lines:BasketLine[];labels:Record<string,string>;excluded:string[];maxStores:number;progress:{key:string;completed:string[]}};
const PENDING_LIST_KEY="posokanei-pending-account-save-v1";
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
  const [comparedProduct,setComparedProduct]=useState<string|null>(null);
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
  const [expandedAlternatives,setExpandedAlternatives]=useState<string[]>([]);
  const [checkingBrands,setCheckingBrands]=useState(false);
  const [brandRefresh,setBrandRefresh]=useState(0);
  const [mode,setMode]=useState<Mode>("limited");
  const [result,setResult]=useState<BasketResult|null>(null);
  const [working,setWorking]=useState(false);
  const calculationId=useRef(0);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [progress,setProgress]=useState<{key:string;completed:string[]}>({key:"",completed:[]});
  const [mobileListOpen,setMobileListOpen]=useState(false);
  const [accountStatus,setAccountStatus]=useState<AccountStatus>("checking");
  const [csrfToken,setCsrfToken]=useState("");
  const [savedAt,setSavedAt]=useState<string|null>(null);
  const [savingList,setSavingList]=useState(false);
  useEffect(()=>{
    try{
      const saved=JSON.parse(sessionStorage.getItem(PENDING_LIST_KEY)||localStorage.getItem("posokanei-shopping-v2")||"{}") as {excluded?:string[];maxStores?:number;lines?:BasketLine[];labels?:Record<string,string>;progress?:{key:string;completed:string[]}};
      if(Array.isArray(saved.excluded))setExcluded(saved.excluded.filter(x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x)).slice(0,24));
      if(typeof saved.maxStores==="number"&&Number.isSafeInteger(saved.maxStores)&&saved.maxStores>=1&&saved.maxStores<=5)setStoreLimit(saved.maxStores);
      if(Array.isArray(saved.lines)&&saved.lines.length<=20&&saved.lines.every(x=>x&&typeof x.id==="string"&&["exact","group"].includes(x.kind)))setLines(saved.lines);
      if(saved.labels&&typeof saved.labels==="object")setLabels(saved.labels);
      if(saved.progress&&typeof saved.progress.key==="string"&&Array.isArray(saved.progress.completed))setProgress(saved.progress);
      // Previously automatic anonymous storage becomes a one-time in-tab draft.
      localStorage.removeItem("posokanei-shopping-v2");
      localStorage.removeItem("posokanei-checklist-v1");
    }catch{}
    setPreferencesLoaded(true);
  },[]);
  useEffect(()=>{
    if(!preferencesLoaded)return;
    try{localStorage.setItem("posokanei-shopping-v2",JSON.stringify({excluded,maxStores:storeLimit}));}catch{}
  },[preferencesLoaded,excluded,storeLimit]);
  useEffect(()=>{
    if(!preferencesLoaded)return;
    const abort=new AbortController();
    void (async()=>{
      try{
        const r=await fetch("/api/posokanei/saved-list",{cache:"no-store",signal:abort.signal});
        if(abort.signal.aborted)return;
        if(r.status===401){setAccountStatus("guest");return;}
        if(!r.ok)throw Error("account_lists_unavailable");
        const data=await r.json() as {authenticated:boolean;csrfToken:string;saved:SavedList|null;updatedAt:string|null};
        if(abort.signal.aborted)return;
        setAccountStatus("customer");setCsrfToken(data.csrfToken);setSavedAt(data.updatedAt);
        const pending=sessionStorage.getItem(PENDING_LIST_KEY);
        if(pending&&new URLSearchParams(window.location.search).get("save")==="1"){
          const draft=JSON.parse(pending) as SavedList;
          const response=await fetch("/api/posokanei/saved-list",{method:"POST",headers:{"Content-Type":"application/json","x-csrf-token":data.csrfToken},body:JSON.stringify(draft),signal:abort.signal});
          if(abort.signal.aborted)return;
          if(!response.ok)throw Error("pending_save_failed");
          const confirmation=await response.json() as {updatedAt:string};
          setSavedAt(confirmation.updatedAt);sessionStorage.removeItem(PENDING_LIST_KEY);
          window.history.replaceState(window.history.state,"","/posokanei");
          setNotice("✓ Η λίστα αποθηκεύτηκε στον λογαριασμό KONTA MOY.");
        }else if(data.saved&&!lines.length){
          setLines(data.saved.lines);setLabels(data.saved.labels);setExcluded(data.saved.excluded);
          setStoreLimit(data.saved.maxStores);setProgress(data.saved.progress);
        }
      }catch{
        if(!abort.signal.aborted){setAccountStatus("error");setNotice("Δεν είναι διαθέσιμη η αποθήκευση αυτή τη στιγμή. Η λίστα παραμένει ανοιχτή.");}
      }
    })();
    return()=>abort.abort();
    // Run only at initial draft restore: do not replace a list while the shopper is editing it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[preferencesLoaded]);
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
  const update=useCallback((next:BasketLine[])=>{calculationId.current++;setLines(next);setResult(null);setError("");setSavedAt(null);},[]);
  useEffect(()=>{calculationId.current++;setResult(null);},[excluded,storeLimit]);
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
              excludedRetailerIds:excluded,
              includeNonCheaper:true
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
          if(!controller.signal.aborted)setNotice("Ο έλεγχος εναλλακτικών δεν ολοκληρώθηκε. Δοκίμασε ξανά.");
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
    setNotice("Προστέθηκε στη λίστα: "+p.name);
  }
  function addReviewedComparable(option:Cheaper){
    if(option.confidence!=="reviewed_equivalent")return;
    if(lines.length>=20){setNotice("Μπορείς να προσθέσεις έως 20 προϊόντα στη λίστα.");return;}
    const key=id();
    setLabels(current=>({...current,[key]:option.name}));
    update([...lines,{id:key,kind:"exact",sourceProductId:option.id,packageCount:option.packageCount}]);
    setNotice("Προστέθηκε η εγκεκριμένη εναλλακτική με "+option.packageCount+" συσκευασία/ες.");
  }
  function chooseAlternative(lineId:string,next:Cheaper){
    const selected=brandResults[lineId];
    if(!selected||typeof selected.sourceAmount!=="number"||!selected.basis)return;
    const original=lines.find(line=>line.id===lineId);
    const packages=original?.kind==="exact"&&
      original.sourceProductId===selected.sourceProductId&&next.unit===selected.basis?
      packagesForEquivalent(selected.sourceAmount,original.packageCount,next.packageQuantity):null;
    if(packages===null||packages>100){
      setNotice("Η νέα συσκευασία δεν επαρκεί για την ίδια ποσότητα.");
      return;
    }
    // Preserve the quantity-safe original price for curated and strict automatic matches.
    const replacedFrom=["reviewed_equivalent","automatically_verified"].includes(next.confidence)&&original?.kind==="exact"?
      (original.replacedFrom||{sourceProductId:original.sourceProductId,packageCount:original.packageCount}):undefined;
    const revised=lines.map(line=>line.id===lineId?
      ({...line,sourceProductId:next.id,packageCount:packages,replacedFrom} as BasketLine):line);
    setExpandedAlternatives(current=>current.filter(id=>id!==lineId));
    update(revised);
    setLabels(current=>({...current,[lineId]:next.name}));
    void calculate(revised);
    setNotice("Η εναλλακτική επιλέχθηκε με "+packages+" συσκευασίες. Υπολογίζονται οι συνολικές οικονομίες.");
  }
  function changeLine(key:string,patch:Partial<BasketLine>){
    update(lines.map(line=>line.id===key?
      ({...line,...patch,...(line.kind==="exact"&&"packageCount" in patch?{replacedFrom:undefined}:{})} as BasketLine):line));
  }
  useEffect(()=>{
    if(!mobileListOpen)return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setMobileListOpen(false);};
    window.addEventListener("keydown",onKey);
    const narrow=window.matchMedia("(max-width:1120px)").matches;
    const original=document.body.style.overflow;
    if(narrow)document.body.style.overflow="hidden";
    return()=>{window.removeEventListener("keydown",onKey);if(narrow)document.body.style.overflow=original;};
  },[mobileListOpen]);
  async function saveList(){
    if(!lines.length||savingList||accountStatus==="checking")return;
    const draft:SavedList={lines,labels,excluded,maxStores:storeLimit,progress};
    if(accountStatus==="guest"){
      try{sessionStorage.setItem(PENDING_LIST_KEY,JSON.stringify(draft));}
      catch{setNotice("Δεν μπορεί να διατηρηθεί προσωρινά η λίστα μέχρι τη σύνδεση.");return;}
      window.location.assign("/login?next="+encodeURIComponent("/posokanei?save=1"));
      return;
    }
    if(accountStatus!=="customer"||!csrfToken){setNotice("Η υπηρεσία αποθήκευσης δεν είναι διαθέσιμη. Δοκίμασε ξανά.");return;}
    setSavingList(true);
    try{
      const r=await fetch("/api/posokanei/saved-list",{method:"POST",headers:{"Content-Type":"application/json","x-csrf-token":csrfToken},body:JSON.stringify(draft)});
      if(!r.ok)throw Error("save_failed");
      const data=await r.json() as {updatedAt:string};
      setSavedAt(data.updatedAt);sessionStorage.removeItem(PENDING_LIST_KEY);
      setNotice("✓ Η λίστα αποθηκεύτηκε στον λογαριασμό σου.");
    }catch{setNotice("Δεν αποθηκεύτηκε η λίστα. Δοκίμασε ξανά.");}
    finally{setSavingList(false);}
  }
  async function calculate(basketLines:BasketLine[]=lines){
    const run=++calculationId.current;
    setWorking(true);setError("");setResult(null);
    try{
      const r=await fetch("/api/posokanei/optimize",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({lines:basketLines,storeLimit,retailerIds:listing.retailers.filter(r=>!excluded.includes(r.id)).map(r=>r.id)})});
      const data=await r.json() as {status?:string;result?:BasketResult;error?:string};
      if(!r.ok||data.status!=="ready"||!data.result)throw Error(data.error||"Η σύγκριση δεν ολοκληρώθηκε.");
      if(calculationId.current===run){setResult(data.result);setMode("limited");}
    }catch(e){if(calculationId.current===run)setError(e instanceof Error?e.message:"Σφάλμα υπολογισμού.");}
    finally{if(calculationId.current===run)setWorking(false);}
  }
  const savingsOpportunities=summarizeCheaperAlternatives(Object.values(brandResults));
  const plan=result?planOf(result,mode):null;
  const storeSections=groupShoppingPlan(plan);
  const planKey=planFingerprint(result?.snapshotDate||"",mode,plan);
  const completed=new Set(progress.key===planKey?progress.completed:[]);
  const completedCount=plan?.complete?plan.items.filter(item=>completed.has(item.lineId)).length:0;
  const actualSavings=savingsForPlan(result,plan);
  const savingsWithBrands=savingsIncludingBrands(result,plan);
  function toggleLineDone(lineId:string){
    if(!plan?.complete)return;
    setSavedAt(null);
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
          <p className={styles.lead}>Διάλεξε προϊόντα, βρες φθηνότερες μάρκες και δες σε ποια σούπερ μάρκετ συμφέρει να ψωνίσεις.</p>
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
            <div className={styles.retailerGrid}>{listing.retailers.map(r=><label key={r.id} className={styles.retailerCheck}><input type="checkbox" checked={!excluded.includes(r.id)} onChange={e=>{setExcluded(old=>e.target.checked?old.filter(x=>x!==r.id):[...old,r.id]);setResult(null);setPage(1);setComparedProduct(null);}}/><span>{r.name}</span></label>)}</div>
            <div className={styles.prefsActions}><button type="button" className={styles.textButton} onClick={()=>{setExcluded([]);setPage(1);setResult(null);setComparedProduct(null);}}>Επιλογή όλων</button><button type="button" className={styles.textButton} onClick={()=>setSettingsOpen(false)}>Ολοκλήρωση ✓</button></div>
          </fieldset>
          <label className={styles.maxStores}>Μέγιστος αριθμός σούπερ μάρκετ <select value={storeLimit} onChange={e=>{setStoreLimit(Number(e.target.value));setResult(null);}}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n===1?"1 αλυσίδα":"Έως "+n+" αλυσίδες"}</option>)}</select></label>
        </div>}
      </section>
      <div className={styles.disclaimer} role="note">Οι τιμές είναι ενδεικτικές. <details><summary>Τι πρέπει να γνωρίζω;</summary>Οι τιμές και η διαθεσιμότητα μπορεί να διαφέρουν ανά κατάστημα. Δεν πραγματοποιούνται αγορές από αυτή τη σελίδα.</details></div>
      {listing.status!=="ready"&&!loading?<section className={styles.pending} role="status">
        <h2>Η σύγκριση τιμών ετοιμάζεται.</h2>
        <p>Ο ανεξάρτητος κατάλογος θα ενεργοποιηθεί μόλις ολοκληρωθεί η επαλήθευση της πηγής και η δημοσίευση των ενημερωμένων δεδομένων. Δεν εμφανίζουμε δοκιμαστικές τιμές ως πραγματικές.</p>
      </section>:null}
      <div className={styles.layout}>
        <section className={styles.browse}>
          <div className={styles.heading}><div><span className={styles.eyebrow}>01 · ΑΝΑΖΗΤΗΣΗ</span><h2>Βρες και σύγκρινε προϊόντα</h2></div>{listing.status==="ready"&&<span>{listing.count??0} αποτελέσματα</span>}</div>
          <div className={styles.filters}>
            <label>Αναζήτηση προϊόντος<input type="search" value={q} onChange={e=>{setQ(e.target.value);setPage(1);setActive(null);setComparedProduct(null);}} placeholder="π.χ. ρύζι, γάλα, ντομάτα ψιλοκομμένη" /></label>
            <label>Κατηγορία<select value={category} onChange={e=>{setCategory(e.target.value);setPage(1);setComparedProduct(null);}}><option value="">Όλες οι κατηγορίες</option>{(listing.categoryGroups||[]).map(c=><option key={c} value={c}>{c}</option>)}</select></label>
          </div>
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
                  {!!p.approvedAlternatives?.length&&<button className={styles.textButton} type="button"
                    aria-expanded={comparedProduct===p.id}
                    onClick={()=>setComparedProduct(current=>current===p.id?null:p.id)}>
                    Σύγκρινε άλλες μάρκες ({p.approvedAlternatives.length}) {comparedProduct===p.id?"−":"↗"}
                  </button>}
                </div>
                {!!p.approvedAlternatives?.length&&comparedProduct===p.id&&
                  <div className={styles.comparablePanel} aria-label={"Εγκεκριμένες εναλλακτικές για "+p.name}>
                    <h4>Άλλες μάρκες με διαθέσιμη καταγεγραμμένη τιμή</h4>
                    <p>Εγκεκριμένος τύπος προϊόντος, όχι εγγύηση ίδιων συστατικών, αλλεργιογόνων ή προέλευσης. Οι τιμές αφορούν τις επιλεγμένες αλυσίδες.</p>
                    {p.approvedAlternatives.map(a=><div className={styles.comparableRow} key={a.id}>
                      <div><strong>{a.name}</strong>
                        <small>{a.retailerName} · {a.packageCount} × {money(a.priceEur)} = {money(a.candidateTotalEur)}</small>
                        <small className={a.savingsEur>0?styles.comparableBenefit:undefined}>{a.savingsEur>0?"Φθηνότερο κατά "+money(a.savingsEur):a.savingsEur===0?"Ίδια τιμή":"Ακριβότερο κατά "+money(Math.abs(a.savingsEur))}</small>
                      </div>
                      <button className={styles.secondary} type="button" onClick={()=>addReviewedComparable(a)}>+ Στη λίστα</button>
                    </div>)}
                  </div>}
                {expanded&&<div className={styles.offers}><h4>Καταγεγραμμένες τιμές · μόνο από τις επιλεγμένες αλυσίδες</h4>
                  {p.offers.map((o,i)=><div key={o.retailerId} className={styles.offer}><span>{o.retailerName}{i===0&&<small className={styles.lowest}> Χαμηλότερη καταγραφή</small>}{o.discount&&<small> · Σήμανση έκπτωσης</small>}</span><strong>{money(o.priceEur)}</strong></div>)}
                </div>}
              </article>;
            })}
          </div>
          {listing.status==="ready"&&(page>1||listing.hasMore)&&<nav className={styles.pagination} aria-label="Σελίδες προϊόντων"><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Προηγούμενη</button><span>Σελίδα {page}</span><button type="button" disabled={!listing.hasMore} onClick={()=>setPage(p=>p+1)}>Επόμενη →</button></nav>}
        </section>
        {mobileListOpen&&<button type="button" className={styles.mobileListBackdrop} aria-label="Κλείσιμο λίστας αγορών" onClick={()=>setMobileListOpen(false)}/>}
        <aside className={`${styles.sidebar} ${mobileListOpen?styles.mobileBasketOpen:""}`} aria-label="Λίστα και εξοικονόμηση" role={mobileListOpen?"dialog":undefined} aria-modal={mobileListOpen?true:undefined}><div className={styles.basket} id="posokanei-basket">
          <div className={styles.drawerHeader}><strong>Η λίστα σου</strong><button type="button" onClick={()=>setMobileListOpen(false)} aria-label="Κλείσιμο λίστας">✕</button></div>
          <div className={styles.heading}><div><span className={styles.eyebrow}>02 · ΤΟ ΚΑΛΑΘΙ ΣΟΥ</span><h2>Η λίστα αγορών</h2></div><span className={styles.count}>{lines.length}</span></div>
          <div className={styles.saveBar}>
            <button className={styles.saveButton} type="button" disabled={!lines.length||savingList||accountStatus==="checking"} onClick={()=>{void saveList();}}>{savingList?"Αποθήκευση…":accountStatus==="guest"?"🔒 Σύνδεση / εγγραφή & αποθήκευση":"💾 Αποθήκευση λίστας"}</button>
            <small>{accountStatus==="guest"?"Σύγκρινε χωρίς λογαριασμό. Για να κρατήσεις τη λίστα σου, συνδέσου ή κάνε εγγραφή.":savedAt?"Αποθηκευμένη στον λογαριασμό σου":accountStatus==="checking"?"Έλεγχος λογαριασμού…":"Οι αλλαγές αποθηκεύονται όταν πατήσεις Αποθήκευση."}</small>
          </div>
          {!lines.length?<p className={styles.message}>Πρόσθεσε προϊόντα για να βρεις το οικονομικότερο καλάθι.</p>:<details className={styles.listDetails}><summary>Προϊόντα στη λίστα ({lines.length}) · Προβολή / επεξεργασία</summary><div className={styles.lines}>{lines.map(l=><div className={styles.line} key={l.id}>
            <div className={styles.lineTop}><strong>{labels[l.id]||"Προϊόν"}</strong><button type="button" onClick={()=>update(lines.filter(x=>x.id!==l.id))} aria-label="Αφαίρεση από τη λίστα">✕</button></div>
            <label>{l.kind==="exact"?"Συσκευασίες":"Ποσότητα ("+(listing.groups.find(g=>g.id===l.groupId)?.basis||"kg")+")"}<input type="number" min="1" max="100" step={l.kind==="exact"?"1":"0.1"} value={l.kind==="exact"?l.packageCount:l.requiredBaseQuantity} onChange={e=>changeLine(l.id,l.kind==="exact"?{packageCount:Number(e.target.value)}:{requiredBaseQuantity:Number(e.target.value)})}/></label>
            {l.kind==="exact"&&(checkingBrands||((brandResults[l.id]?.alternatives.length||0)+(brandResults[l.id]?.candidates.length||0))>0)&&<small className={styles.brandStatus}>{checkingBrands?"Έλεγχος εναλλακτικών…":"💡 Δες συγκρίσιμες μάρκες παρακάτω"}</small>}

          </div>)}</div></details>}
          {notice&&<p className={styles.notice} role="status">{notice}</p>}
          {savingsOpportunities.productCount>0&&<button type="button" className={styles.savingsOpportunity}
            onClick={()=>{
              setExpandedAlternatives(current=>[...new Set([...current,...savingsOpportunities.lineIds])]);
              document.getElementById("posokanei-alternative-"+savingsOpportunities.lineIds[0])?.scrollIntoView({behavior:"smooth",block:"start"});
            }}>
            <span>Βρήκαμε φθηνότερες εναλλακτικές για <strong>{savingsOpportunities.productCount} {savingsOpportunities.productCount===1?"προϊόν":"προϊόντα"}</strong> της λίστας σου.</span>
            <strong>Εξοικονόμησε έως {money(savingsOpportunities.potentialSavingEur)}</strong>
            <span className={styles.savingsOpportunityAction}>Δες τις εναλλακτικές <span aria-hidden="true">→</span></span>
            <small>Εκτίμηση από καταγεγραμμένες τιμές ανά προϊόν· το τελικό όφελος υπολογίζεται ξεχωριστά.</small>
          </button>}
          {lines.some(l=>l.kind==="exact")&&<button type="button" className={styles.textButton} onClick={()=>setBrandRefresh(n=>n+1)} disabled={checkingBrands}>{checkingBrands?"Αναζήτηση εναλλακτικών…":"Ανανέωση εναλλακτικών ↻"}</button>}
          {Object.values(brandResults).filter(entry=>entry.alternatives.length>0||entry.candidates.length>0).map(entry=>
            <section className={styles.suggestion} key={entry.lineId} id={"posokanei-alternative-"+entry.lineId} aria-label={"Εναλλακτικές για "+(labels[entry.lineId]||"προϊόν")}>
              <div className={styles.suggestionDisclosure}>
                <button type="button" className={styles.suggestionToggle}
                  aria-expanded={expandedAlternatives.includes(entry.lineId)}
                  onClick={()=>setExpandedAlternatives(current=>current.includes(entry.lineId)?current.filter(id=>id!==entry.lineId):[...current,entry.lineId])}>
                  <span>💡 Εναλλακτικές για {labels[entry.lineId]||"προϊόν"} ({entry.alternatives.length+entry.candidates.length})</span>
                  <span aria-hidden="true">{expandedAlternatives.includes(entry.lineId)?"−":"+"}</span>
                </button>
              {expandedAlternatives.includes(entry.lineId)&&[...entry.alternatives,...entry.candidates].map(option=><div className={styles.suggestionLine} key={option.confidence+":"+option.id}>
                <span>
                  <strong>{option.name}</strong>
                  <small>{option.retailerName} · {option.packageCount} συσκ. × {money(option.priceEur)} = {money(option.candidateTotalEur)}</small>
                  <small>{option.savingsEur>0?"Φθηνότερο κατά "+money(option.savingsEur):option.savingsEur<0?"Ακριβότερο κατά "+money(-option.savingsEur):"Ίδια καταγεγραμμένη τιμή"}</small>
                  <small>✓ {option.confidence==="automatically_verified"?"Αυτόματα ελεγμένη αντιστοίχιση":"Ελεγμένος συγκρίσιμος τύπος"}</small>
                </span>
                <button type="button" className={styles.secondary} onClick={()=>chooseAlternative(entry.lineId,option)}>Επιλογή</button>
              </div>)}
              </div>
            </section>
          )}
          <p className={styles.basketPreset}>Αυτόματη επιλογή οικονομικότερων αλυσίδων · έως {storeLimit} από τις επιλεγμένες <button type="button" onClick={()=>{setSettingsOpen(true);window.scrollTo({top:0,behavior:"smooth"});}}>Αλλαγή</button></p>
          <button className={styles.calculate} type="button" onClick={()=>{void calculate();}} disabled={!lines.length||listing.status!=="ready"||working||listing.retailers.length===excluded.length}>{working?"Υπολογισμός…":"Βρες το οικονομικότερο καλάθι →"}</button>
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
            {mode!=="single"&&actualSavings!==null&&<p className={styles.saving}>Εξοικονόμηση από επιλογή σούπερ μάρκετ για <strong>τις τωρινές μάρκες</strong>: <strong>{money(actualSavings)}</strong></p>}
            {!!result.reviewedBrandSwitchCount&&plan?.complete&&<>
              {result.brandSwitchSavingsEur!==null&&<p className={styles.saving}>Από τις {result.reviewedBrandSwitchCount} αλλαγές μάρκας, έναντι της αρχικής λίστας σε μία αλυσίδα: <strong>{result.brandSwitchSavingsEur>=0?money(result.brandSwitchSavingsEur):"επιπλέον κόστος "+money(-result.brandSwitchSavingsEur)}</strong></p>}
              {savingsWithBrands!==null&&<p className={styles.saving}><strong>{savingsWithBrands>=0?"Συνολική εξοικονόμηση":"Επιπλέον συνολικό κόστος"} με τις επιλεγμένες μάρκες:</strong> <strong>{money(Math.abs(savingsWithBrands))}</strong> <small>Έναντι της αρχικής λίστας {result.originalBasketBenchmarkMode==="single"?"σε μία αλυσίδα":"με έως "+storeLimit+" αλυσίδες"}, στις ίδιες τιμές. Δεν υπολογίζονται δύο φορές οι ίδιες οικονομίες.</small></p>}
              {savingsWithBrands===null&&<p className={styles.methodNote}>Δεν υπάρχει πλήρης αρχική λίστα για σύγκριση συνολικής εξοικονόμησης.</p>}
            </>}
            <details className={styles.classicComparisonDetails}><summary>Σύγκριση με αγορά από ένα σούπερ μάρκετ <span>Λεπτομέρειες ↓</span></summary>
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
            </section></details>
            {result.missingItems.length>0&&<p>Χωρίς τιμή: {result.missingItems.map(item=>labels[item.lineId]||item.lineId).join(", ")}</p>}
            <small>Δεν περιλαμβάνεται κόστος μετακίνησης, διανομή ή προγράμματα επιβράβευσης.</small>
          </div>}
        </div></aside>
      </div>
      <button type="button" className={styles.mobileBasketShortcut} aria-expanded={mobileListOpen} aria-controls="posokanei-basket" onClick={()=>setMobileListOpen(true)}><span>🛒 Λίστα αγορών <b>{lines.length}</b></span><strong>{plan?.complete?money(plan.totalEur):"Άνοιγμα ↑"}</strong></button>
      <p className={styles.footerNote}>KONTA MOY × PosoKanei · Ανεξάρτητη υπηρεσία αναφοράς τιμών. Χωρίς πραγματική αγορά, απόθεμα ή σύνδεση με το checkout του ΚΟΝΤΑ ΜΟΥ.</p><p className={styles.footerNote}>Πηγή τιμών: <a href="https://posokanei.gov.gr/" target="_blank" rel="noopener noreferrer">posokanei.gov.gr</a> · Δημόσιο ημερήσιο αρχείο: <a href="https://github.com/spyrosavl/posokanei" target="_blank" rel="noopener noreferrer">spyrosavl/posokanei</a> · Νομική βάση περαιτέρω χρήσης: ν. 4727/2020, άρθρο 61 (με επιφύλαξη άρθρου 59). Δεν αποτελεί επίσημη κυβερνητική υπηρεσία.</p>
    </div>
  </div>;
}
