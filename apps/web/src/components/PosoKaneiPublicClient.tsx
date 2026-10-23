"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import type {BasketLine,BasketPlan,BasketResult} from "../../../../scripts/posokanei/basket-optimizer.mjs";
import {groupShoppingPlan,planFingerprint,savingsForPlan,savingsIncludingBrands,shoppingPlanText,packagesForEquivalent} from "../../../../scripts/posokanei/shopping-plan.mjs";
import {summarizeCheaperAlternatives} from "../../../../scripts/posokanei/alternative-opportunities.mjs";
import styles from "./PosoKaneiPublicClient.module.css";
import {LidlStandaloneOffers,type LidlVisibleOffer} from "./LidlStandaloneOffers";

type Offer={retailerId:string;retailerName:string;priceEur:number;observedAt:string|null;discount:boolean};
type Product={id:string;name:string;brand:string|null;category:string|null;unit:string|null;unitQuantity:number|null;imageUrl?:string|null;groupId:string|null;offers:Offer[];approvedAlternatives:Cheaper[]};
type Group={id:string;label:string;basis:"kg"|"l"|"piece";approvalMethod?:"automatic_commodity"|"manual_review"};
type Retailer={id:string;name:string};
type Listing={status:string;snapshotDate?:string;source?:string;count?:number;page?:number;hasMore?:boolean;products:Product[];categories:string[];categoryGroups?:string[];groups:Group[];retailers:Retailer[]};
type Cheaper={id:string;name:string;brand:string;priceEur:number;unitPriceEur:number;retailerName:string;retailerId:string;savingPercent:number;packageQuantity:number;unit:string;packageCount:number;originalTotalEur:number;candidateTotalEur:number;savingsEur:number;confidence:"reviewed_equivalent"|"automatically_verified"|"unverified_match";approvalMethod?:"automatic_commodity"|"manual_review"|"automatic_match"|"manual_or_unverified"};
type LidlLine={id:string;source:"lidl_gr";storeKey:string;storeName:string;offerId:string;name:string;brand:string|null;quantity:number;selectedPriceEur:number;validTo:string};
type LidlQuote={status:string;complete:boolean;items:Array<{lineId:string;storeKey:string;storeName:string;quantity:number;status:"current"|"not_current";offer:null|{id:string;name:string;priceEur:number;validTo:string;membershipRequirement:string}}>;stores:Array<{storeKey:string;storeName:string;subtotalEur:number;lines:number}>};
type SourceCandidate={id:string;origin:string;storeKey:string|null;name:string;brand:string|null;priceEur:number|null;confidence:string;differentBrand:boolean};
type SourceCompare={status:string;candidates?:SourceCandidate[]};
type Mode="single"|"limited";
type AccountStatus="checking"|"guest"|"customer"|"error";
type SavedList={lines:BasketLine[];lidlLines?:LidlLine[];labels:Record<string,string>;excluded:string[];maxStores:number;progress:{key:string;completed:string[]};dismissedAlternativeLines?:string[]};
const PENDING_LIST_KEY="posokanei-pending-account-save-v1";
const isCheaper=(option:Cheaper)=>Number.isFinite(option.originalTotalEur)&&Number.isFinite(option.candidateTotalEur)&&
  Math.round(option.originalTotalEur*100)>Math.round(option.candidateTotalEur*100)&&option.savingsEur>0;
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
  const [lidlLines,setLidlLines]=useState<LidlLine[]>([]);
  const [lidlQuote,setLidlQuote]=useState<LidlQuote|null>(null);
  const [lidlQuoteWorking,setLidlQuoteWorking]=useState(false);
  const [sourceCompareId,setSourceCompareId]=useState<string|null>(null);
  const [sourceCompare,setSourceCompare]=useState<SourceCompare|null>(null);
  const [sourceCompareWorking,setSourceCompareWorking]=useState(false);
  const [labels,setLabels]=useState<Record<string,string>>({});
  const [storeLimit,setStoreLimit]=useState(5);
  const [excluded,setExcluded]=useState<string[]>([]);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [preferencesLoaded,setPreferencesLoaded]=useState(false);
  const [brandResults,setBrandResults]=useState<Record<string,{
    lineId:string;sourceProductId:string;basis:string|null;sourceAmount:number|null;
    reason:string;alternatives:Cheaper[];candidates:Cheaper[];
    bestCheaperSavingEur?:number;cheaperAlternativeCount?:number;
  }>>({});
  const [expandedAlternatives,setExpandedAlternatives]=useState<string[]>([]);
  const [dismissedAlternativeLines,setDismissedAlternativeLines]=useState<string[]>([]);
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
      const saved=JSON.parse(sessionStorage.getItem(PENDING_LIST_KEY)||localStorage.getItem("posokanei-shopping-v2")||"{}") as Partial<SavedList>;
      if(Array.isArray(saved.excluded))setExcluded(saved.excluded.filter(x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x)).slice(0,24));
      if(typeof saved.maxStores==="number"&&Number.isSafeInteger(saved.maxStores)&&saved.maxStores>=1&&saved.maxStores<=5)setStoreLimit(saved.maxStores);
      if(Array.isArray(saved.lines)&&saved.lines.length<=20&&saved.lines.every(x=>x&&typeof x.id==="string"&&["exact","group"].includes(x.kind)))setLines(saved.lines);
      if(Array.isArray(saved.lidlLines)&&saved.lidlLines.length<=20&&saved.lidlLines.every(l=>l&&l.source==="lidl_gr"&&/^GR\d{4}$/.test(l.storeKey)&&/^[0-9a-f-]{36}$/i.test(l.offerId)&&Number.isSafeInteger(l.quantity)&&l.quantity>=1&&l.quantity<=100))setLidlLines(saved.lidlLines);
      if(saved.labels&&typeof saved.labels==="object")setLabels(saved.labels);
      if(saved.progress&&typeof saved.progress.key==="string"&&Array.isArray(saved.progress.completed))setProgress(saved.progress);
      if(Array.isArray(saved.dismissedAlternativeLines))setDismissedAlternativeLines(saved.dismissedAlternativeLines.filter(id=>typeof id==="string"&&/^line_[a-z0-9]{1,30}$/.test(id)&&saved.lines?.some(line=>line.id===id)).slice(0,20));
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
          setLines(data.saved.lines);setLidlLines(data.saved.lidlLines||[]);setLabels(data.saved.labels);setExcluded(data.saved.excluded);
          setStoreLimit(data.saved.maxStores);setProgress(data.saved.progress);
          setDismissedAlternativeLines(data.saved.dismissedAlternativeLines||[]);
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
  const update=useCallback((next:BasketLine[])=>{
    calculationId.current++;
    setLines(next);
    setDismissedAlternativeLines(current=>current.filter(id=>next.some(line=>line.id===id)));
    setResult(null);setError("");setSavedAt(null);
  },[]);
  useEffect(()=>{calculationId.current++;setResult(null);},[excluded,storeLimit]);
  useEffect(()=>{
    if(!preferencesLoaded){return}
    if(!lidlLines.length){setLidlQuote(null);setLidlQuoteWorking(false);return}
    const controller=new AbortController();
    setLidlQuote(null);setLidlQuoteWorking(true);
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch("/api/posokanei/lidl/quotes",{method:"POST",cache:"no-store",
          signal:controller.signal,headers:{"Content-Type":"application/json"},
          body:JSON.stringify({items:lidlLines.map(l=>({id:l.id,storeKey:l.storeKey,offerId:l.offerId,quantity:l.quantity}))})});
        const result=await response.json() as LidlQuote;
        if(!response.ok||result.status!=="ready")throw Error("quote_failed");
        if(!controller.signal.aborted)setLidlQuote(result);
      }catch{
        if(!controller.signal.aborted)setNotice("Δεν ήταν δυνατό να επανελεγχθούν οι προσφορές Lidl. Δεν υπολογίζονται ως διαθέσιμες.");
      }finally{if(!controller.signal.aborted)setLidlQuoteWorking(false)}
    },250);
    return()=>{clearTimeout(timer);controller.abort()};
  },[lidlLines,preferencesLoaded]);
  // One race-safe, quantity-aware request refreshes ALL existing basket SKUs.
  // A store exclusion or line edit automatically invalidates older alerts.
  useEffect(()=>{
    if(!preferencesLoaded)return;
    const exact=lines.filter((line):line is Extract<BasketLine,{kind:"exact"}>=>line.kind==="exact"&&!dismissedAlternativeLines.includes(line.id));
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
              reason:string;alternatives:Cheaper[];candidates:Cheaper[];
              bestCheaperSavingEur?:number;cheaperAlternativeCount?:number
            }>
          };
          if(!response.ok||json.status!=="ready")throw Error("unavailable");
          if(!controller.signal.aborted)setBrandResults(Object.fromEntries(
            (json.lines||[]).filter(x=>exact.some(l=>l.id===x.lineId&&l.sourceProductId===x.sourceProductId))
              .map(x=>[x.lineId,{...x,alternatives:x.alternatives.filter(isCheaper),candidates:x.candidates.filter(isCheaper)}])
          ));
        }catch{
          if(!controller.signal.aborted)setNotice("Ο έλεγχος εναλλακτικών δεν ολοκληρώθηκε. Δοκίμασε ξανά.");
        }finally{
          if(!controller.signal.aborted)setCheckingBrands(false);
        }
      })();
    },240);
    return()=>{clearTimeout(timer);controller.abort();};
  },[excluded,lines,dismissedAlternativeLines,preferencesLoaded,brandRefresh]);
  function addProduct(p:Product,chosenOffer?:Offer){
    if(lines.length+lidlLines.length>=20){setNotice("Μπορείς να προσθέσεις έως 20 προϊόντα στη λίστα.");return;}
    // A locked retailer is an explicit choice from a current, allowed shelf quote.
    if(chosenOffer&&(!p.offers.some(o=>o.retailerId===chosenOffer.retailerId)||
       excluded.includes(chosenOffer.retailerId)))return;
    const key=id();
    setLabels(current=>({...current,[key]:p.name}));
    update([...lines,{id:key,kind:"exact",sourceProductId:p.id,packageCount:1,
      ...(chosenOffer?{lockedRetailerId:chosenOffer.retailerId}:{})}]);
    setNotice(chosenOffer?"✓ Επιλέχθηκε η καταγεγραμμένη τιμή "+money(chosenOffer.priceEur)+
      " από "+chosenOffer.retailerName+". Μπορείς να ξεκλειδώσεις την αλυσίδα από τη λίστα.":"Προστέθηκε στη λίστα: "+p.name);
  }
  function addGovById(sourceProductId:string,name:string){
    if(lines.length+lidlLines.length>=20){setNotice("Μέχρι 20 προϊόντα ανά λίστα.");return}
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(sourceProductId))return;
    const key=id();
    setLabels(current=>({...current,[key]:name.slice(0,200)}));
    update([...lines,{id:key,kind:"exact",sourceProductId,packageCount:1}]);
    setNotice("Το προϊόν PosoKanei προστέθηκε στη λίστα.");
  }
  function addLidlOffer(offer:LidlVisibleOffer,storeKey:string,storeName:string){
    if(lines.length+lidlLines.length>=20){setNotice("Μέχρι 20 προϊόντα ανά λίστα.");return}
    if(offer.validityStatus!=="current"||!/^GR\d{4}$/.test(storeKey))return;
    const parts=offer.id.split(":");
    if(parts.length!==3||parts[0]!=="lidl_gr"||parts[1]!==storeKey||!/^[0-9a-f-]{36}$/i.test(parts[2]))return;
    if(lidlLines.some(l=>l.storeKey===storeKey&&l.offerId===parts[2])){
      setNotice("Η προσφορά βρίσκεται ήδη στη λίστα.");return;
    }
    const selected:LidlLine={id:id(),source:"lidl_gr",storeKey,storeName:storeName.slice(0,100),
      offerId:parts[2],name:offer.name.slice(0,200),brand:offer.brand,
      quantity:1,selectedPriceEur:offer.priceEur,validTo:offer.validTo};
    setLidlLines(current=>[...current,selected]);
    setSavedAt(null);setNotice("✓ Προστέθηκε στη λίστα Lidl: "+offer.name+". Η τιμή επανελέγχεται.");
  }
  function changeLidlLine(lineId:string,quantity:number){
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100)return;
    setLidlLines(current=>current.map(l=>l.id===lineId?{...l,quantity}:l));setSavedAt(null);
  }
  async function compareGovernmentProduct(p:Product){
    if(sourceCompareId===p.id){setSourceCompareId(null);setSourceCompare(null);return}
    setSourceCompareId(p.id);setSourceCompare(null);setSourceCompareWorking(true);
    try{
      const url=new URLSearchParams({origin:"posokanei",id:p.id,store:lidlLines[0]?.storeKey||"GR0851"});
      const response=await fetch("/api/posokanei/compare-sources?"+url,{cache:"no-store"});
      const result=await response.json() as SourceCompare;
      if(!response.ok)throw Error("compare_unavailable");
      setSourceCompare(result);
    }catch{setSourceCompare({status:"unavailable",candidates:[]})}
    finally{setSourceCompareWorking(false)}
  }
  function addSourceCandidate(candidate:SourceCandidate){
    if(candidate.origin==="posokanei"){addGovById(candidate.id,candidate.name);return}
    if(candidate.origin!=="lidl_gr"||!candidate.storeKey||!Number.isFinite(candidate.priceEur))return;
    const synthetic:LidlVisibleOffer={id:candidate.id,name:candidate.name,brand:candidate.brand,
      packaging:null,priceEur:candidate.priceEur!,referencePriceEur:null,validFrom:"",validTo:"",
      discountText:null,validityStatus:"current"};
    addLidlOffer(synthetic,candidate.storeKey,candidate.storeKey);
  }
  function addReviewedComparable(option:Cheaper,sourceProduct:Product){
    if(!["reviewed_equivalent","automatically_verified"].includes(option.confidence)||!isCheaper(option))return;
    if(lines.length+lidlLines.length>=20){setNotice("Μπορείς να προσθέσεις έως 20 προϊόντα στη λίστα.");return;}
    const key=id();
    setDismissedAlternativeLines(current=>[...current,key]);
    setLabels(current=>({...current,[key]:option.name}));
    // The shopper chose this cheaper brand against the visible original SKU.
    // Preserve that original so the server can verify real basket savings.
    const revised:BasketLine[]=[...lines,{id:key,kind:"exact",sourceProductId:option.id,
      packageCount:option.packageCount,
      replacedFrom:{sourceProductId:sourceProduct.id,packageCount:1}}];
    update(revised);
    setComparedProduct(null);
    void calculate(revised);
    setNotice("✓ Επιλέχθηκε φθηνότερη μάρκα. Δυνητικό όφελος "+money(option.savingsEur)+
      ". Υπολογίζεται η πραγματική εξοικονόμηση του καλαθιού.");
  }
  function chooseAlternative(lineId:string,next:Cheaper){
    if(!isCheaper(next)||dismissedAlternativeLines.includes(lineId))return;
    // Only the backend's curated and strictly validated automatic matches qualify.
    if(next.confidence==="unverified_match")return;
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
    // Both curated and strictly automatic matches preserve the original
    // quantity-priced SKU, without trusting client-provided savings.
    const replacedFrom=["reviewed_equivalent","automatically_verified"].includes(next.confidence)&&original?.kind==="exact"?
      (original.replacedFrom||{sourceProductId:original.sourceProductId,packageCount:original.packageCount}):undefined;
    const revised=lines.map(line=>line.id===lineId?
      ({...line,sourceProductId:next.id,packageCount:packages,replacedFrom,
        lockedRetailerId:undefined} as BasketLine):line);
    setDismissedAlternativeLines(current=>current.includes(lineId)?current:[...current,lineId]);
    setExpandedAlternatives(current=>current.filter(id=>id!==lineId));
    update(revised);
    setLabels(current=>({...current,[lineId]:next.name}));
    void calculate(revised);
    setNotice("✓ Επιλέχθηκε φθηνότερη εναλλακτική με "+packages+" συσκευασίες. Υπολογίζονται οι συνολικές οικονομίες.");
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
    if(!(lines.length+lidlLines.length)||savingList||accountStatus==="checking")return;
    const draft:SavedList={lines,lidlLines,labels,excluded,maxStores:storeLimit,progress,dismissedAlternativeLines};
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
  const availableAlternativeResults=Object.values(brandResults)
    .filter(entry=>!dismissedAlternativeLines.includes(entry.lineId))
    .map(entry=>({...entry,alternatives:entry.alternatives.filter(isCheaper),candidates:entry.candidates.filter(isCheaper)}))
    .filter(entry=>entry.alternatives.length>0||entry.candidates.length>0);
  const savingsOpportunities=summarizeCheaperAlternatives(availableAlternativeResults);
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
    const gov=shoppingPlanText(result,plan,mode);
    const active=lidlQuote?.items.filter(q=>q.status==="current"&&q.offer)||[];
    const lidlText=active.length?["","Lidl — επιλεγμένες προσφορές συγκεκριμένων καταστημάτων",
      ...lidlQuote!.stores.flatMap(store=>[store.storeName+" · "+money(store.subtotalEur),
        ...active.filter(q=>q.storeKey===store.storeKey).map(q=>
          "☐ "+q.offer!.name+" × "+q.quantity+" — "+money(q.offer!.priceEur*q.quantity)+" · έως "+q.offer!.validTo.slice(0,10))]),
      "Ελέγξτε Lidl Plus, διαθεσιμότητα και τρέχουσα τιμή στο κατάστημα.",
      "Οι προσφορές Lidl δεν συμμετέχουν στη σύγκριση εξοικονόμησης PosoKanei."
    ].join("\n"):"";
    const text=(gov||"ΚΟΝΤΑ ΜΟΥ — Λίστα αγορών")+lidlText;
    if(!gov&&!lidlText)return;
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
          <div className={styles.tags}><span>Σύγκριση τιμών</span><span>Μόνο φθηνότερες μάρκες</span><span>Λίστα ανά κατάστημα</span></div>
        </div>
        <div className={styles.heroBox}>
          <small>Τελευταία καταγραφή</small>
          <strong>{loading?"Φόρτωση τιμών…":listing.snapshotDate??"Δεν έχει δημοσιευτεί"}</strong>
          <span>{loading?"Ενημέρωση πραγματικών καταγεγραμμένων τιμών…":listing.status==="ready"?"Ενδεικτικές καταγεγραμμένες τιμές":"Αναμένεται επαληθευμένη δημοσίευση τιμών"}</span>
        </div>
      </div>
      <section className={styles.preferences} aria-label="Προτιμήσεις αγορών">
        <div className={styles.prefsHeader}>
          <div><span className={styles.eyebrow}>ΠΡΩΤΑ ΟΙ ΕΠΙΛΟΓΕΣ ΣΟΥ</span><h2>Πού θέλεις να ψωνίσεις;</h2><p>Επίλεξε τις αλυσίδες που σε εξυπηρετούν.</p></div>
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
      <LidlStandaloneOffers onAdd={addLidlOffer} onAddGov={addGovById} searchQuery={q}/>
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
              const cheaperCatalogueOptions=p.approvedAlternatives.filter(isCheaper);
              return <article key={p.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.glyph} aria-hidden="true">{p.imageUrl?<img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.hidden=true;}}/>:"▦"}</div>
                  <div className={styles.productTitle}><small>{p.brand||"Χωρίς μάρκα"} · {p.category||"Λοιπά"}</small><h3>{p.name}</h3><small>{p.unitQuantity??"—"} {p.unit||""} · {p.offers.length} καταγραφές</small></div>
                  <div className={styles.amount}><small>Από</small><strong>{money(best?.priceEur)}</strong><small>{best?.retailerName||"—"}</small>{unit&&<small>{money(unit.price)}/{unit.unit}</small>}</div>
                </div>
                <div className={styles.buttons}>
                  <button className={styles.primary} type="button" disabled={!best} onClick={()=>addProduct(p)}>+ Στη λίστα</button>
                  <button className={styles.secondary} type="button" onClick={()=>{void compareGovernmentProduct(p)}} aria-expanded={sourceCompareId===p.id}>Παρόμοια από όλες τις πηγές</button>
                  <button className={styles.secondary} type="button" onClick={()=>setActive(expanded?null:p.id)} aria-expanded={expanded}>Τιμές στις αλυσίδες {expanded?"−":"+"}</button>
                  {cheaperCatalogueOptions.length>0&&<button className={styles.textButton} type="button"
                    aria-expanded={comparedProduct===p.id}
                    onClick={()=>setComparedProduct(current=>current===p.id?null:p.id)}>
                    💰 Φθηνότερες μάρκες ({cheaperCatalogueOptions.length}) {comparedProduct===p.id?"−":"+"}
                  </button>}
                </div>
                {cheaperCatalogueOptions.length>0&&comparedProduct===p.id&&
                  <div className={styles.comparablePanel} aria-label={"Εγκεκριμένες εναλλακτικές για "+p.name}>
                    <h4>Πιο οικονομικές επιλογές</h4>
                    <p>Η συνολική τιμή υπολογίζεται για την αντίστοιχη ποσότητα.</p>
                    {cheaperCatalogueOptions.map(a=><div className={styles.comparableRow} key={a.id}>
                      <div><strong>{a.name}</strong>
                        <small>{a.retailerName} · {a.packageCount} × {money(a.priceEur)} = {money(a.candidateTotalEur)}</small>
                        <small className={styles.comparableBenefit}>Κερδίζεις {money(a.savingsEur)}</small>
                      </div>
                      <button className={styles.secondary} type="button" onClick={()=>addReviewedComparable(a,p)}>Επιλογή</button>
                    </div>)}
                  </div>}
                {sourceCompareId===p.id&&<div className={styles.comparablePanel} role="region" aria-label={"Διασταυρούμενες προτάσεις για "+p.name}>
                  <h4>Πιθανά παρόμοια · όλες οι πηγές</h4>
                  {sourceCompareWorking?<p>Αναζήτηση…</p>:!sourceCompare?.candidates?.length?<p>Δεν υπάρχουν διαθέσιμες τεκμηριωμένες προτάσεις.</p>:
                    sourceCompare.candidates.map(item=><div key={item.id} className={styles.comparableRow}>
                      <div><strong>{item.name}</strong><small>{item.origin==="lidl_gr"?"Lidl":"PosoKanei"} · {item.brand||"Χωρίς μάρκα"} · {item.priceEur===null?"—":money(item.priceEur)}</small>
                      <small>{item.confidence==="reviewed_equivalent"?"Ελεγμένη ομάδα":"Υποψήφιο προς επαλήθευση — χωρίς επιβεβαιωμένη ισοδυναμία"}</small></div>
                      <button type="button" className={styles.secondary} onClick={()=>addSourceCandidate(item)}>+ Στη λίστα</button>
                    </div>)}
                  <small>Χωρίς αυτόματη αντιστοίχιση ή υπολογισμό μη επαληθευμένης εξοικονόμησης.</small>
                </div>}
                {expanded&&<div className={styles.offers}><h4>Καταγεγραμμένες τιμές · μόνο από τις επιλεγμένες αλυσίδες</h4>
                  {p.offers.map((o,i)=><div key={o.retailerId} className={styles.offer}><span>{o.retailerName}{i===0&&<small className={styles.lowest}> Χαμηλότερη καταγραφή</small>}{o.discount&&<small> · Σήμανση έκπτωσης</small>}</span><strong>{money(o.priceEur)}</strong><button type="button" className={styles.secondary} aria-label={"Επιλογή τιμής "+money(o.priceEur)+" από "+o.retailerName+" για "+p.name} onClick={()=>addProduct(p,o)}>Επιλογή τιμής</button></div>)}
                </div>}
              </article>;
            })}
          </div>
          {listing.status==="ready"&&(page>1||listing.hasMore)&&<nav className={styles.pagination} aria-label="Σελίδες προϊόντων"><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Προηγούμενη</button><span>Σελίδα {page}</span><button type="button" disabled={!listing.hasMore} onClick={()=>setPage(p=>p+1)}>Επόμενη →</button></nav>}
        </section>
        {mobileListOpen&&<button type="button" className={styles.mobileListBackdrop} aria-label="Κλείσιμο λίστας αγορών" onClick={()=>setMobileListOpen(false)}/>}
        <aside className={`${styles.sidebar} ${mobileListOpen?styles.mobileBasketOpen:""}`} aria-label="Λίστα και εξοικονόμηση" role={mobileListOpen?"dialog":undefined} aria-modal={mobileListOpen?true:undefined}><div className={styles.basket} id="posokanei-basket">
          <div className={styles.drawerHeader}><strong>Η λίστα σου</strong><button type="button" onClick={()=>setMobileListOpen(false)} aria-label="Κλείσιμο λίστας">✕</button></div>
          <div className={styles.heading}><div><span className={styles.eyebrow}>02 · ΤΟ ΚΑΛΑΘΙ ΣΟΥ</span><h2>Η λίστα αγορών</h2></div><span className={styles.count}>{lines.length+lidlLines.length}</span></div>
          {lines.length+lidlLines.length>0&&<div className={styles.saveBar}>
            <button className={styles.saveButton} type="button" disabled={!(lines.length+lidlLines.length)||savingList||accountStatus==="checking"} onClick={()=>{void saveList();}}>{savingList?"Αποθήκευση…":accountStatus==="guest"?"🔒 Σύνδεση / εγγραφή & αποθήκευση":"💾 Αποθήκευση λίστας"}</button>
            <small>{accountStatus==="guest"?"Για να διατηρήσεις τη λίστα, συνδέσου ή κάνε εγγραφή.":savedAt?"✓ Αποθηκεύτηκε στον λογαριασμό σου":accountStatus==="checking"?"Έλεγχος λογαριασμού…":"Για να κρατήσεις τις αλλαγές, πάτησε Αποθήκευση."}</small>
          </div>}
          {!(lines.length+lidlLines.length)?<p className={styles.message}>Πρόσθεσε προϊόντα για να σχεδιάσεις τη λίστα αγορών.</p>:<details className={styles.listDetails} open><summary>Προϊόντα στη λίστα ({lines.length+lidlLines.length}) · Επεξεργασία</summary><div className={styles.lines}>{lines.map(l=><div className={styles.line} key={l.id}>
            <div className={styles.lineTop}><strong>{labels[l.id]||"Προϊόν"}</strong><button type="button" onClick={()=>update(lines.filter(x=>x.id!==l.id))} aria-label="Αφαίρεση από τη λίστα">✕</button></div>
            <label>{l.kind==="exact"?"Συσκευασίες":"Ποσότητα ("+(listing.groups.find(g=>g.id===l.groupId)?.basis||"kg")+")"}<input type="number" min="1" max="100" step={l.kind==="exact"?"1":"0.1"} value={l.kind==="exact"?l.packageCount:l.requiredBaseQuantity} onChange={e=>changeLine(l.id,l.kind==="exact"?{packageCount:Number(e.target.value)}:{requiredBaseQuantity:Number(e.target.value)})}/></label>
            {l.lockedRetailerId&&<div className={styles.retailerLock}><span>🔒 Επιλεγμένη αλυσίδα: {listing.retailers.find(r=>r.id===l.lockedRetailerId)?.name||l.lockedRetailerId}{excluded.includes(l.lockedRetailerId)?" · έχει αποκλειστεί στις ρυθμίσεις":""}</span><button type="button" onClick={()=>changeLine(l.id,{lockedRetailerId:undefined})}>Ξεκλείδωμα</button></div>}
            {dismissedAlternativeLines.includes(l.id)?<small className={styles.selectedAlternativeNote}>✓ Επέλεξες φθηνότερη μάρκα</small>:l.kind==="exact"&&(checkingBrands||((brandResults[l.id]?.alternatives.length||0)+(brandResults[l.id]?.candidates.length||0))>0)&&<small className={styles.brandStatus}>{checkingBrands?"Έλεγχος τιμών…":"💡 Φθηνότερες επιλογές παρακάτω"}</small>}

          </div>)}
          {lidlLines.map(item=><div className={styles.line} key={item.id}>
            <div className={styles.lineTop}><strong>{item.name}</strong>
              <button type="button" onClick={()=>{setLidlLines(v=>v.filter(x=>x.id!==item.id));setSavedAt(null)}} aria-label={"Αφαίρεση "+item.name}>✕</button>
            </div>
            <small>🏷️ Lidl · {item.storeName} · Προσφορά καταστήματος</small>
            <label>Συσκευασίες<input type="number" min="1" max="100" step="1" value={item.quantity}
              onChange={e=>changeLidlLine(item.id,Number(e.target.value))}/></label>
            {(()=>{const quote=lidlQuote?.items.find(q=>q.lineId===item.id);return quote?.status==="current"&&quote.offer?
              <small>Επαληθευμένη καταγραφή: {money(quote.offer.priceEur)} / συσκ. · έως {quote.offer.validTo.slice(0,10)}</small>:
              <small>⚠ {lidlQuoteWorking?"Επανέλεγχος…":"Η προσφορά δεν είναι τρέχουσα ή δεν μπορεί να επαληθευτεί."}</small>})()}
          </div>)}
          </div></details>}
          {notice&&<p className={styles.notice} role="status">{notice}</p>}
          {savingsOpportunities.productCount>0&&<button type="button" className={styles.savingsOpportunity}
            onClick={()=>{
              setExpandedAlternatives(current=>[...new Set([...current,...savingsOpportunities.lineIds])]);
              document.getElementById("posokanei-alternative-"+savingsOpportunities.lineIds[0])?.scrollIntoView({behavior:"smooth",block:"start"});
            }}>
            <span>Βρήκαμε φθηνότερες εναλλακτικές για <strong>{savingsOpportunities.productCount} {savingsOpportunities.productCount===1?"προϊόν":"προϊόντα"}</strong> της λίστας σου.</span>
            <strong>Εξοικονόμησε έως {money(savingsOpportunities.potentialSavingEur)}</strong>
            <span className={styles.savingsOpportunityAction}>Δες τι σε συμφέρει <span aria-hidden="true">→</span></span>
            <small>Πιθανή εξοικονόμηση από όλες τις φθηνότερες έγκυρες επιλογές. Δεν προστίθεται στο πραγματικό όφελος πριν την επιλογή.</small>
          </button>}
          {lines.some(l=>l.kind==="exact"&&!dismissedAlternativeLines.includes(l.id))&&<button type="button" className={styles.textButton} onClick={()=>setBrandRefresh(n=>n+1)} disabled={checkingBrands}>{checkingBrands?"Αναζήτηση εναλλακτικών…":"Ανανέωση εναλλακτικών ↻"}</button>}
          {availableAlternativeResults.map(entry=>
            <section className={styles.suggestion} key={entry.lineId} id={"posokanei-alternative-"+entry.lineId} aria-label={"Εναλλακτικές για "+(labels[entry.lineId]||"προϊόν")}>
              <div className={styles.suggestionDisclosure}>
                <button type="button" className={styles.suggestionToggle}
                  aria-expanded={expandedAlternatives.includes(entry.lineId)}
                  onClick={()=>setExpandedAlternatives(current=>current.includes(entry.lineId)?current.filter(id=>id!==entry.lineId):[...current,entry.lineId])}>
                  <span>💡 Φθηνότερες μάρκες για {labels[entry.lineId]||"προϊόν"} ({entry.cheaperAlternativeCount??entry.alternatives.length+entry.candidates.length})</span>
                  <span aria-hidden="true">{expandedAlternatives.includes(entry.lineId)?"−":"+"}</span>
                </button>
              {expandedAlternatives.includes(entry.lineId)&&[...entry.alternatives,...entry.candidates].map(option=><div className={styles.suggestionLine} key={option.confidence+":"+option.id}>
                <span>
                  <strong>{option.name}</strong>
                  <small>{option.retailerName} · {option.packageCount} συσκ. × {money(option.priceEur)} = {money(option.candidateTotalEur)}</small>
                  <small className={styles.savingAmount}>Κερδίζεις {money(option.savingsEur)}</small>
                  {option.confidence==="automatically_verified"&&<small>✓ Αυτόματα ελεγμένη αντιστοίχιση</small>}
                </span>
                <button type="button" className={styles.secondary} onClick={()=>chooseAlternative(entry.lineId,option)}>Επιλογή</button>
              </div>)}
              </div>
            </section>
          )}
          {lidlLines.length>0&&<section className={styles.pending} aria-label="Επιλεγμένες προσφορές Lidl ανά κατάστημα">
            <h3>🏷️ Lidl · αγορές ανά κατάστημα</h3>
            <p>Οι προσφορές επανελέγχονται από την πηγή, ανεξάρτητα από τις τιμές PosoKanei.</p>
            {lidlQuote?.stores.map(store=><p key={store.storeKey}><strong>{store.storeName}</strong> · {store.lines} είδη · {money(store.subtotalEur)}</p>)}
            {plan?.complete&&lidlQuote&&plan.storeCount+lidlQuote.stores.length>storeLimit&&
              <p role="note">⚠ Οι επιλεγμένες φυσικές επισκέψεις, μαζί με Lidl, υπερβαίνουν το όριο {storeLimit} καταστημάτων. Οι προσφορές Lidl δεν συμμετέχουν ακόμη στην ίδια βελτιστοποίηση.</p>}
            {lidlQuote&&!lidlQuote.complete&&<p role="alert">Κάποιες προσφορές έληξαν ή δεν βρέθηκαν· δεν περιλαμβάνονται στο ενδεικτικό υποσύνολο.</p>}
            {lidlQuoteWorking&&<p role="status">Έλεγχος προσφορών…</p>}
            <button type="button" className={styles.secondary} disabled={!lidlQuote?.items.some(i=>i.status==="current")} onClick={()=>{void copyPlan()}}>Αντιγραφή λίστας ανά κατάστημα</button>
            <small>Δεν έχουν επιβεβαιωθεί οι όροι Lidl Plus ή τα αποθέματα. Το Lidl υποσύνολο δεν προστίθεται στα σύνολα εξοικονόμησης PosoKanei.</small>
          </section>}
          <p className={styles.basketPreset}>Σύγκριση σε έως {storeLimit} σούπερ μάρκετ. <button type="button" onClick={()=>{setSettingsOpen(true);setMobileListOpen(false);window.scrollTo({top:0,behavior:"smooth"});}}>Αλλαγή</button></p>
          <button className={styles.calculate} type="button" onClick={()=>{void calculate();}} disabled={!lines.length||listing.status!=="ready"||working||listing.retailers.length===excluded.length}>{working?"Υπολογισμός…":"Βρες το οικονομικότερο καλάθι →"}</button>
          {error&&<p className={styles.error} role="alert">{error}</p>}
          {result&&<div className={styles.results} aria-live="polite">
            <div className={styles.buttons}><button className={mode==="single"?styles.primary:styles.secondary} onClick={()=>setMode("single")} type="button">1 αλυσίδα</button><button className={mode==="limited"?styles.primary:styles.secondary} onClick={()=>setMode("limited")} type="button">Έως {storeLimit}</button></div>
            {plan?.complete?<><small>Σύνολο πλήρους λίστας</small><div className={styles.bigTotal}>{money(plan.totalEur)}</div><p className={styles.methodNote}>Σε ίδιες τιμές προτιμάμε σούπερ μάρκετ που ήδη θα επισκεφθείς.</p>
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
            {savingsOpportunities.productCount>0&&<p className={styles.methodNote}>Πρόσθετη δυνητική εξοικονόμηση από φθηνότερες μάρκες: <strong>έως {money(savingsOpportunities.potentialSavingEur)}</strong>. Δεν προστίθεται στην πραγματική εξοικονόμηση πριν γίνει επιλογή. Το τελικό καλάθι επανυπολογίζεται με τις επιτρεπόμενες αλυσίδες.</p>}
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
      <button type="button" className={styles.mobileBasketShortcut} aria-expanded={mobileListOpen} aria-controls="posokanei-basket" onClick={()=>setMobileListOpen(true)}><span>🛒 Λίστα αγορών <b>{lines.length+lidlLines.length}</b></span><strong>{plan?.complete?money(plan.totalEur):"Άνοιγμα ↑"}</strong></button>
      <p className={styles.footerNote}>KONTA MOY × PosoKanei · Ανεξάρτητη υπηρεσία αναφοράς τιμών. Χωρίς πραγματική αγορά, απόθεμα ή σύνδεση με το checkout του ΚΟΝΤΑ ΜΟΥ.</p><p className={styles.footerNote}>Πηγή τιμών: <a href="https://posokanei.gov.gr/" target="_blank" rel="noopener noreferrer">posokanei.gov.gr</a> · Δημόσιο ημερήσιο αρχείο: <a href="https://github.com/spyrosavl/posokanei" target="_blank" rel="noopener noreferrer">spyrosavl/posokanei</a> · Νομική βάση περαιτέρω χρήσης: ν. 4727/2020, άρθρο 61 (με επιφύλαξη άρθρου 59). Δεν αποτελεί επίσημη κυβερνητική υπηρεσία.</p>
    </div>
  </div>;
}
