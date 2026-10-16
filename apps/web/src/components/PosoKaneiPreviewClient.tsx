"use client";

import { useMemo, useState } from "react";
import type { BasketLine, BasketPlan, BasketResult } from "../../../../scripts/posokanei/basket-optimizer.mjs";
import {
  DEMO_GROUPS, DEMO_PRICES, DEMO_PRODUCTS, DEMO_RETAILERS, DEMO_SNAPSHOT_DATE,
  type DemoProduct
} from "../lib/posokanei-preview-fixture";
import styles from "./PosoKaneiPreviewClient.module.css";

type ViewMode = "single" | "limited" | "any";
type SortMode = "unit" | "package";

function euro(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(value)
    : "—";
}
function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR");
}
function labelForLine(line: BasketLine) {
  if(line.kind==="exact") return DEMO_PRODUCTS.find(p=>p.source_product_id===line.sourceProductId)?.name ?? "Άγνωστο προϊόν";
  const group=DEMO_GROUPS.find(g=>g.id===line.groupId);
  return group?.label ?? "Άγνωστη ομάδα";
}
function idForDemoBasket(): string {
  return "item_"+Math.random().toString(36).slice(2,10);
}
function productOffers(id: string) {
  return DEMO_PRICES.filter(p=>p.source_product_id===id)
    .sort((a,b)=>a.price_eur-b.price_eur||a.retailer_id.localeCompare(b.retailer_id));
}
function unitPrice(product:DemoProduct,price:number):number | null {
  const bases:Record<string,number>={g:0.001,kg:1,ml:0.001,l:1};
  const factor=bases[product.unit];
  if(!factor||product.unit_quantity<=0) return null;
  return price/(product.unit_quantity*factor);
}
function resultPlan(result:BasketResult,view:ViewMode):BasketPlan|null {
  if(view==="single") return result.bestSingleStore;
  if(view==="limited") return result.cheapestWithinStoreLimit;
  return result.cheapestAcrossAnyStores;
}

export function PosoKaneiPreviewClient({csrfToken}:{csrfToken:string}) {
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState("all");
  const [activeProduct,setActiveProduct]=useState<string|null>("demo-tomato-a");
  const [alternatives,setAlternatives]=useState<string|null>("demo-chopped-tomatoes");
  const [sortMode,setSortMode]=useState<SortMode>("unit");
  const [lines,setLines]=useState<BasketLine[]>([]);
  const [storeLimit,setStoreLimit]=useState(2);
  const [view,setView]=useState<ViewMode>("limited");
  const [result,setResult]=useState<BasketResult|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const categories=useMemo(()=>["all",...new Set(DEMO_PRODUCTS.map(p=>p.category))],[]);
  const products=useMemo(()=>DEMO_PRODUCTS.filter(p=>
    (category==="all"||p.category===category)&&
    normalize([p.name,p.brand,p.category].join(" ")).includes(normalize(search.trim()))
  ),[category,search]);

  function updateLines(fn:(current:BasketLine[])=>BasketLine[]) {
    setLines(fn);
    setResult(null);
    setError("");
  }
  function addExact(productId:string,retailerId?:string) {
    updateLines(current=>[...current,{
      id:idForDemoBasket(),kind:"exact",sourceProductId:productId,packageCount:1,
      ...(retailerId?{lockedRetailerId:retailerId}:{})
    }]);
  }
  function addComparable(groupId:string,lockedProductId?:string) {
    const group=DEMO_GROUPS.find(g=>g.id===groupId);
    if(!group)return;
    updateLines(current=>[...current,{
      id:idForDemoBasket(),kind:"group",groupId,requiredBaseQuantity:group.basis==="piece"?1:1,
      ...(lockedProductId?{lockedProductId}:{})
    }]);
  }
  function patchLine(id:string,fn:(line:BasketLine)=>BasketLine) {
    updateLines(current=>current.map(line=>line.id===id?fn(line):line));
  }
  async function optimize() {
    setError("");setResult(null);setWorking(true);
    try {
      const response=await fetch("/api/admin/posokanei-preview",{
        method:"POST",cache:"no-store",credentials:"same-origin",
        headers:{"Content-Type":"application/json","x-csrf-token":csrfToken},
        body:JSON.stringify({lines,storeLimit})
      });
      const body=await response.json() as {result?:BasketResult;error?:string;mode?:string};
      if(!response.ok||body.mode!=="SYNTHETIC_ADMIN_PREVIEW"||!body.result) {
        throw new Error(body.error||"Ο υπολογισμός δεν ολοκληρώθηκε.");
      }
      setResult(body.result);
      setView("limited");
    } catch (e) {
      setError(e instanceof Error?e.message:"Αποτυχία σύγκρισης.");
    } finally {setWorking(false);}
  }

  const selectedGroup=DEMO_GROUPS.find(g=>g.id===alternatives);
  const groupItems=useMemo(()=>{
    if(!selectedGroup)return [];
    return selectedGroup.memberIds.flatMap(id=>{
      const p=DEMO_PRODUCTS.find(product=>product.source_product_id===id);
      const first=productOffers(id)[0];
      if(!p||!first)return [];
      return [{product:p,retailer:first.retailer_name,retailerId:first.retailer_id,price:first.price_eur,perUnit:unitPrice(p,first.price_eur)}];
    }).sort((a,b)=>sortMode==="unit"
      ? (a.perUnit??Infinity)-(b.perUnit??Infinity)||a.price-b.price
      : a.price-b.price);
  },[selectedGroup,sortMode]);
  const chosenPlan=result?resultPlan(result,view):null;

  return <div className={styles.scope}>
    <div className={styles.wrap}>
      <div className={styles.notice} role="status">
        <span className={styles.dot} aria-hidden="true"/>
        <strong>ΙΔΙΩΤΙΚΗ ΠΡΟΕΠΙΣΚΟΠΗΣΗ · DEMO</strong>
        <span>Οι τιμές, οι μάρκες και τα καταστήματα είναι επινοημένα. Δεν αποτελούν πραγματικά δεδομένα PosoKanei.</span>
      </div>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>KONTA MOY × PosoKanei</span>
          <h1>Το πιο οικονομικό καλάθι αρχίζει με τη σωστή σύγκριση.</h1>
          <p>Διάλεξε το προϊόν, σύγκρινε σούπερ μάρκετ ή ισοδύναμες μάρκες και δες πόσο κοστίζει ολόκληρη η λίστα αγορών σου.</p>
          <div className={styles.heroPills}><span>Ανά προϊόν</span><span>Ανά σούπερ μάρκετ</span><span>Συνολικό καλάθι</span></div>
        </div>
        <div className={styles.heroPanel}>
          <span>Αποτελέσματα δοκιμής</span>
          <strong>{DEMO_PRODUCTS.length} προϊόντα</strong>
          <strong>{DEMO_RETAILERS.length} αλυσίδες</strong>
          <small>Αποκλειστικά τεχνητά δεδομένα · {DEMO_SNAPSHOT_DATE}</small>
        </div>
      </div>

      <div className={styles.layout}>
        <section className={styles.mainColumn} aria-label="Κατάλογος σύγκρισης">
          <div className={styles.sectionTop}>
            <div><span className={styles.eyebrow}>01 — ΑΝΑΚΑΛΥΨΗ</span><h2>Βρες ένα προϊόν</h2></div>
            <span className={styles.muted}>{products.length} αποτελέσματα</span>
          </div>
          <div className={styles.searchRow}>
            <label className={styles.searchLabel}>
              <span>Αναζήτηση</span>
              <input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="π.χ. ντομάτα ψιλοκομμένη, ρύζι, γάλα" autoComplete="off"/>
            </label>
            <label className={styles.categoryLabel}>
              <span>Κατηγορία</span>
              <select value={category} onChange={event=>setCategory(event.target.value)}>
                {categories.map(c=><option key={c} value={c}>{c==="all"?"Όλες οι κατηγορίες":c}</option>)}
              </select>
            </label>
          </div>
          <div className={styles.products}>
            {products.length===0&&<p className={styles.empty}>Δεν βρέθηκαν προϊόντα στα δοκιμαστικά δεδομένα.</p>}
            {products.map(product=>{
              const offers=productOffers(product.source_product_id);
              const cheapest=offers[0];
              const expanded=activeProduct===product.source_product_id;
              const basis=unitPrice(product,cheapest?.price_eur??0);
              return <article className={styles.productCard} key={product.source_product_id}>
                <div className={styles.productTop}>
                  <div className={styles.productIcon} aria-hidden="true">▦</div>
                  <div className={styles.productName}>
                    <span className={styles.muted}>{product.brand} · {product.category}</span>
                    <h3>{product.name}</h3>
                    <span className={styles.muted}>{product.unit_quantity} {product.unit} · {offers.length} καταγεγραμμένες τιμές</span>
                  </div>
                  <div className={styles.priceTag}>
                    <small>Από</small>
                    <strong>{euro(cheapest?.price_eur)}</strong>
                    <span>{cheapest?.retailer_name??"—"}</span>
                    {basis!==null&&<small>{euro(basis)}/{product.unit==="l"||product.unit==="ml"?"L":"kg"}</small>}
                  </div>
                </div>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.primary} onClick={()=>addExact(product.source_product_id,cheapest?.retailer_id)} disabled={!cheapest}>+ Προσθήκη καλύτερης τιμής</button>
                  <button type="button" className={styles.secondary} onClick={()=>setActiveProduct(expanded?null:product.source_product_id)} aria-expanded={expanded}>Σύγκριση αλυσίδων {expanded?"−":"+"}</button>
                  {product.groupId&&<button type="button" className={styles.linkButton} onClick={()=>setAlternatives(product.groupId??null)}>Άλλες μάρκες ↗</button>}
                </div>
                {expanded&&<div className={styles.offers}>
                  <div className={styles.offersHeader}><strong>Επίλεξε σούπερ μάρκετ</strong><span>Τιμή συσκευασίας</span></div>
                  {offers.map((offer,index)=><div className={styles.offer} key={offer.retailer_id}>
                    <span>{offer.retailer_name} {index===0&&<span className={styles.winner}>Φθηνότερο</span>}</span>
                    <strong>{euro(offer.price_eur)}</strong>
                    <button type="button" className={styles.pick} onClick={()=>addExact(product.source_product_id,offer.retailer_id)} aria-label={"Επιλογή "+offer.retailer_name+" για "+product.name}>Επιλογή</button>
                  </div>)}
                  <small className={styles.muted}>Οι τιμές αφορούν αλυσίδες και όχι επιβεβαιωμένη διαθεσιμότητα συγκεκριμένου καταστήματος.</small>
                </div>}
              </article>;
            })}
          </div>

          <div className={styles.sectionTop}>
            <div><span className={styles.eyebrow}>02 — ΕΝΑΛΛΑΚΤΙΚΕΣ</span><h2>Άλλες μάρκες, ίδιο προϊόν</h2></div>
          </div>
          <div className={styles.alternatives}>
            <label className={styles.groupSelect}>Συγκρίσιμη κατηγορία
              <select value={alternatives??""} onChange={event=>setAlternatives(event.target.value||null)}>
                {DEMO_GROUPS.map(g=><option value={g.id} key={g.id}>{g.label}</option>)}
              </select>
            </label>
            <div className={styles.sortTabs} role="group" aria-label="Τρόπος σύγκρισης προϊόντων">
              <button type="button" className={sortMode==="unit"?styles.tabActive:styles.tab} onClick={()=>setSortMode("unit")}>Καλύτερη τιμή ανά κιλό</button>
              <button type="button" className={sortMode==="package"?styles.tabActive:styles.tab} onClick={()=>setSortMode("package")}>Φθηνότερη συσκευασία</button>
            </div>
            <div className={styles.altList}>
              {groupItems.map((row,index)=><div key={row.product.source_product_id} className={styles.altRow}>
                <span className={styles.rank}>{index+1}</span>
                <div><strong>{row.product.brand}</strong><small>{row.product.name} · {row.retailer}</small></div>
                <div className={styles.altPrice}><strong>{euro(row.price)}</strong><small>{euro(row.perUnit)}/kg</small></div>
                <button type="button" className={styles.pick} onClick={()=>addExact(row.product.source_product_id,row.retailerId)}>Επιλογή</button>
              </div>)}
            </div>
            {selectedGroup&&<button type="button" className={styles.secondary} onClick={()=>addComparable(selectedGroup.id)}>
              + Πρόσθεσε 1 {selectedGroup.basis==="kg"?"κιλό":"μονάδα"} από την οικονομικότερη ισοδύναμη μάρκα
            </button>}
            <p className={styles.caption}>Μόνο ελεγμένα ισοδύναμα: π.χ. η passata δεν αντιμετωπίζεται ως ψιλοκομμένη ντομάτα.</p>
          </div>
        </section>
        <aside className={styles.sidebar} aria-label="Λίστα αγορών και βελτιστοποίηση">
          <div className={styles.basket}>
            <div className={styles.sectionTop}>
              <div><span className={styles.eyebrow}>03 — ΤΟ ΚΑΛΑΘΙ ΣΟΥ</span><h2>Λίστα αγορών</h2></div>
              <span className={styles.count}>{lines.length}</span>
            </div>
            {lines.length===0?<div className={styles.emptyBasket}>Πρόσθεσε προϊόντα από τη σύγκριση για να δημιουργήσεις μία λίστα και να βρεις το μικρότερο συνολικό κόστος.</div>:
              <div className={styles.basketList}>{lines.map(line=><div className={styles.basketLine} key={line.id}>
                <div className={styles.basketLineTop}>
                  <strong>{labelForLine(line)}</strong>
                  <button type="button" className={styles.remove} onClick={()=>updateLines(current=>current.filter(item=>item.id!==line.id))} aria-label="Αφαίρεση προϊόντος">✕</button>
                </div>
                <div className={styles.basketLineDetail}>
                  <label>{line.kind==="exact"?"Συσκευασίες":"Ποσότητα (kg)"}
                    <input type="number" min={line.kind==="exact"?"1":"0.1"} max="100" step={line.kind==="exact"?"1":"0.1"}
                      value={line.kind==="exact"?line.packageCount:line.requiredBaseQuantity}
                      onChange={e=>patchLine(line.id,current=>current.kind==="exact"
                        ?{...current,packageCount:Number(e.target.value)}
                        :{...current,requiredBaseQuantity:Number(e.target.value)})}/>
                  </label>
                  {line.kind==="group"&&<label>Προτίμηση μάρκας
                    <select value={line.lockedProductId??""} onChange={e=>patchLine(line.id,current=>current.kind==="group"
                      ?{...current,lockedProductId:e.target.value||undefined}:current)}>
                      <option value="">Οικονομικότερη ισοδύναμη</option>
                      {DEMO_GROUPS.find(g=>g.id===line.groupId)?.memberIds.map(id=>{
                        const product=DEMO_PRODUCTS.find(p=>p.source_product_id===id);
                        return product?<option key={id} value={id}>{product.brand}</option>:null;
                      })}
                    </select>
                  </label>}
                  <label>Επιλογή αλυσίδας
                    <select value={line.lockedRetailerId??""} onChange={e=>patchLine(line.id,current=>({...current,lockedRetailerId:e.target.value||undefined}))}>
                      <option value="">Ελεύθερη επιλογή</option>
                      {DEMO_RETAILERS.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </label>
                </div>
              </div>)}</div>}
            <div className={styles.optimizeControls}>
              <label>Μέγιστος αριθμός σούπερ μάρκετ
                <select value={storeLimit} onChange={event=>{setStoreLimit(Number(event.target.value));setResult(null);}}>
                  <option value={1}>1 αλυσίδα</option>
                  <option value={2}>2 αλυσίδες</option>
                  <option value={3}>3 αλυσίδες</option>
                </select>
              </label>
              <button type="button" className={styles.cta} disabled={!lines.length||working||lines.length>20} onClick={optimize}>
                {working?"Υπολογισμός…":"Βρες το οικονομικότερο καλάθι →"}
              </button>
              {error&&<p className={styles.error} role="alert">{error}</p>}
            </div>
            {result&&<div className={styles.result} aria-live="polite">
              <div className={styles.modeTabs} role="group" aria-label="Αποτέλεσμα σύγκρισης">
                <button type="button" className={view==="single"?styles.tabActive:styles.tab} onClick={()=>setView("single")}>1 αλυσίδα</button>
                <button type="button" className={view==="limited"?styles.tabActive:styles.tab} onClick={()=>setView("limited")}>Έως {storeLimit}</button>
                <button type="button" className={view==="any"?styles.tabActive:styles.tab} onClick={()=>setView("any")}>Χωρίς όριο</button>
              </div>
              {chosenPlan?<div className={styles.total}>
                <small>Χαμηλότερο πλήρες σύνολο</small>
                <strong>{euro(chosenPlan.totalEur)}</strong>
                <span>{chosenPlan.storeCount} {chosenPlan.storeCount===1?"αλυσίδα":"αλυσίδες"}</span>
                <div className={styles.chosenItems}>{chosenPlan.items.map(item=><div key={item.lineId}>
                  <span>{item.productName} · {item.packages} τεμ.<small>{item.retailerName}</small></span>
                  <strong>{euro(item.lineTotalEur)}</strong>
                </div>)}</div>
              </div>:<div className={styles.missing}>Δεν υπάρχει πλήρες καλάθι για αυτή την επιλογή. Κάποια προϊόντα δεν είναι διαθέσιμα στα δοκιμαστικά δεδομένα.</div>}
              {result.savingsVsCheapestCompleteSingleStoreEur!=null&&view!=="single"&&<p className={styles.savings}>
                Μέγιστη θεωρητική εξοικονόμηση έναντι της καλύτερης πλήρους επιλογής μιας αλυσίδας: <strong>{euro(result.savingsVsCheapestCompleteSingleStoreEur)}</strong>
              </p>}
              {result.missingItems.length>0&&<div className={styles.missing}><strong>Προϊόντα χωρίς καταγεγραμμένη τιμή:</strong> {result.missingItems.map(m=>labelForLine(lines.find(l=>l.id===m.lineId)!)).join(", ")}</div>}
              <p className={styles.caption}>Δεν περιλαμβάνονται μετακίνηση, πόντοι επιβράβευσης, έξοδα παράδοσης ή πραγματική διαθεσιμότητα.</p>
            </div>}
          </div>
        </aside>
      </div>
      <p className={styles.bottomNotice}>Ανεξάρτητο εργαλείο σύγκρισης ενδεικτικών τιμών · Δεν δημιουργεί παραγγελία στο KONTA MOY. Τα δεδομένα αυτής της προεπισκόπησης είναι 100% συνθετικά.</p>
    </div>
  </div>;
}
