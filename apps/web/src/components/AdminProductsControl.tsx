"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { AdminProductCategoriesWorkspace, AdminProductCategoryCard, AdminProductRow, AdminProductsWorkspace } from "../lib/admin-products-runtime";
import { AdminNavIcon } from "./AdminNavIcon";
import styles from "./AdminProductsControl.module.css";

type View="products"|"categories";
type Layout="cards"|"rows";
const PRODUCT_STATES=[["all","Όλα"],["live","Live"],["draft","Draft"],["uncategorized","Χωρίς κατηγορία"],["missing_media","Χωρίς εικόνα"],["no_offer","Χωρίς offer"],["suppressed","Suppressed"],["recalled","Recall"]] as const;

function formatCount(value:number){return new Intl.NumberFormat("el-GR",{notation:value>=100000?"compact":"standard",maximumFractionDigits:1}).format(value);}
function formatMoney(minor:number|undefined,currency:string){if(minor==null)return "—";return new Intl.NumberFormat("el-GR",{style:"currency",currency,maximumFractionDigits:2}).format(minor/100);}
function productState(product:AdminProductRow){if(product.recalled)return{label:"Recall",tone:"danger"};if(product.suppressed)return{label:"Suppressed",tone:"muted"};if(product.active)return{label:"Live",tone:"positive"};return{label:"Draft",tone:"attention"};}
function qualityScore(product:AdminProductRow){let score=20;if(product.categoryCode)score+=20;if(product.brandName)score+=15;if(!product.missingAttributes)score+=15;if(product.hasMedia)score+=15;if(product.offerCount>0)score+=15;return score;}
function productStorefrontHref(product:AdminProductRow){if(!product.active||product.suppressed||product.recalled)return undefined;const routeKey=encodeURIComponent(product.slug||product.publicId);return product.channel==="bazaar"?`/bazaar/product/${routeKey}`:`/product/${routeKey}`;}

export function AdminProductsControl({csrfToken,initialView="products",canWrite=false}:{csrfToken:string;initialView?:View;canWrite?:boolean}){
  const [view,setView]=useState<View>(initialView);
  const [layout,setLayout]=useState<Layout>("cards");
  const [query,setQuery]=useState("");
  const [debouncedQuery,setDebouncedQuery]=useState("");
  const [state,setState]=useState("all");
  const [category,setCategory]=useState("");
  const [channel,setChannel]=useState("all");
  const [workspace,setWorkspace]=useState<AdminProductsWorkspace>();
  const [categoryWorkspace,setCategoryWorkspace]=useState<AdminProductCategoriesWorkspace>();
  const [loading,setLoading]=useState(true);
  const [loadingMore,setLoadingMore]=useState(false);
  const [error,setError]=useState("");
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [categoryBusy,setCategoryBusy]=useState("");
  const [reloadKey,setReloadKey]=useState(0);
  const requestRef=useRef(0);
  const paginationAbortRef=useRef<AbortController|null>(null);

  useEffect(()=>{const timer=window.setTimeout(()=>setDebouncedQuery(query.trim()),220);return()=>window.clearTimeout(timer);},[query]);

  useEffect(()=>{
    if(view!=="products")return;
    paginationAbortRef.current?.abort();
    paginationAbortRef.current=null;
    setLoadingMore(false);
    const requestId=++requestRef.current;
    const controller=new AbortController();
    setLoading(true);setError("");setSelected(new Set());
    const search=new URLSearchParams({limit:"48",state,channel});
    if(debouncedQuery)search.set("q",debouncedQuery);
    if(category)search.set("category",category);
    fetch("/api/admin/products?"+search.toString(),{cache:"no-store",signal:controller.signal})
      .then(async response=>{const payload=await response.json() as AdminProductsWorkspace&{error?:string};if(!response.ok)throw new Error(payload.error??"Could not load products");if(requestId===requestRef.current)setWorkspace(payload);})
      .catch(cause=>{if(cause instanceof DOMException&&cause.name==="AbortError")return;if(requestId===requestRef.current)setError(cause instanceof Error?cause.message:"Could not load products");})
      .finally(()=>{if(requestId===requestRef.current)setLoading(false);});
    return()=>controller.abort();
  },[view,debouncedQuery,state,category,channel,reloadKey]);

  useEffect(()=>{
    if(view!=="categories")return;
    paginationAbortRef.current?.abort();
    paginationAbortRef.current=null;
    setLoadingMore(false);
    const requestId=++requestRef.current;
    const controller=new AbortController();
    setLoading(true);setError("");
    const search=new URLSearchParams({view:"categories",limit:"60"});
    if(debouncedQuery)search.set("q",debouncedQuery);
    fetch("/api/admin/products?"+search.toString(),{cache:"no-store",signal:controller.signal})
      .then(async response=>{const payload=await response.json() as AdminProductCategoriesWorkspace&{error?:string};if(!response.ok)throw new Error(payload.error??"Could not load categories");if(requestId===requestRef.current)setCategoryWorkspace(payload);})
      .catch(cause=>{if(cause instanceof DOMException&&cause.name==="AbortError")return;if(requestId===requestRef.current)setError(cause instanceof Error?cause.message:"Could not load categories");})
      .finally(()=>{if(requestId===requestRef.current)setLoading(false);});
    return()=>controller.abort();
  },[view,debouncedQuery,reloadKey]);

  const visibleProducts=workspace?.products??[];

  async function loadMoreProducts(){
    if(!workspace?.hasMore||!workspace.nextCursor||loadingMore)return;
    const requestId=requestRef.current;
    const controller=new AbortController();
    paginationAbortRef.current?.abort();
    paginationAbortRef.current=controller;
    setLoadingMore(true);setError("");
    const search=new URLSearchParams({limit:"48",state,channel,cursor:workspace.nextCursor});
    if(debouncedQuery)search.set("q",debouncedQuery);
    if(category)search.set("category",category);
    try{
      const response=await fetch("/api/admin/products?"+search.toString(),{cache:"no-store",signal:controller.signal});
      const payload=await response.json() as AdminProductsWorkspace&{error?:string};
      if(!response.ok)throw new Error(payload.error??"Could not load more products");
      if(controller.signal.aborted||requestId!==requestRef.current)return;
      setWorkspace(current=>current?{...payload,products:[...current.products,...payload.products]}:payload);
    }catch(cause){
      if(cause instanceof DOMException&&cause.name==="AbortError")return;
      if(requestId===requestRef.current)setError(cause instanceof Error?cause.message:"Could not load more products");
    }finally{
      if(paginationAbortRef.current===controller)paginationAbortRef.current=null;
      if(requestId===requestRef.current)setLoadingMore(false);
    }
  }

  async function loadMoreCategories(){
    if(!categoryWorkspace?.hasMore||categoryWorkspace.nextOffset==null||loadingMore)return;
    const requestId=requestRef.current;
    const controller=new AbortController();
    paginationAbortRef.current?.abort();
    paginationAbortRef.current=controller;
    setLoadingMore(true);setError("");
    const search=new URLSearchParams({view:"categories",limit:"60",offset:String(categoryWorkspace.nextOffset)});
    if(debouncedQuery)search.set("q",debouncedQuery);
    try{
      const response=await fetch("/api/admin/products?"+search.toString(),{cache:"no-store",signal:controller.signal});
      const payload=await response.json() as AdminProductCategoriesWorkspace&{error?:string};
      if(!response.ok)throw new Error(payload.error??"Could not load more categories");
      if(controller.signal.aborted||requestId!==requestRef.current)return;
      setCategoryWorkspace(current=>current?{...payload,categories:[...current.categories,...payload.categories]}:payload);
    }catch(cause){
      if(cause instanceof DOMException&&cause.name==="AbortError")return;
      if(requestId===requestRef.current)setError(cause instanceof Error?cause.message:"Could not load more categories");
    }finally{
      if(paginationAbortRef.current===controller)paginationAbortRef.current=null;
      if(requestId===requestRef.current)setLoadingMore(false);
    }
  }

  function toggleSelected(id:string){setSelected(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});}
  async function copySelected(){if(!selected.size)return;await navigator.clipboard?.writeText([...selected].join("\n")).catch(()=>undefined);}

  async function updateCommerceMode(card:AdminProductCategoryCard,commerceMode:string){
    if(!canWrite)return;
    setCategoryBusy(card.categoryCode+":commerce");setError("");
    try{
      const response=await fetch("/api/admin/categories",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},body:JSON.stringify({categoryCode:card.categoryCode,labelEl:card.labelEl,commerceMode})});
      const payload=await response.json() as {error?:string};
      if(!response.ok)throw new Error(payload.error??"Category policy update failed");
      setCategoryWorkspace(current=>current?{...current,categories:current.categories.map(item=>item.categoryCode===card.categoryCode?{...item,commerceMode}:item)}:current);
    }catch(cause){setError(cause instanceof Error?cause.message:"Category policy update failed");}
    finally{setCategoryBusy("");}
  }

  async function toggleCategory(card:AdminProductCategoryCard,field:"active"|"assignable"|"discoverable"){
    if(!canWrite)return;
    setCategoryBusy(card.categoryCode+":"+field);setError("");
    const updated={...card,[field]:!card[field]};
    try{
      const response=await fetch("/api/admin/catalogue/structure",{method:"PATCH",headers:{"content-type":"application/json","x-csrf-token":csrfToken},body:JSON.stringify({kind:"category",categoryCode:card.categoryCode,labelEl:card.labelEl,parentCategoryCode:card.parentCategoryCode??null,taxonomyRole:card.taxonomyRole,assignable:updated.assignable,discoverable:updated.discoverable,active:updated.active,sortOrder:card.sortOrder})});
      const payload=await response.json() as {error?:string};
      if(!response.ok)throw new Error(payload.error??"Category update failed");
      setCategoryWorkspace(current=>current?{...current,categories:current.categories.map(item=>item.categoryCode===card.categoryCode?updated:item)}:current);
    }catch(cause){setError(cause instanceof Error?cause.message:"Category update failed");}
    finally{setCategoryBusy("");}
  }

  const filtersActive=Boolean(query||state!=="all"||category||channel!=="all");
  const metrics=workspace?.metrics;

  return <section className={styles.shell}>
    <div className={styles.modeBar}>
      <div className={styles.viewTabs} role="tablist" aria-label="Products control centre views">
        <button type="button" className={view==="products"?styles.activeTab:undefined} onClick={()=>setView("products")}><AdminNavIcon name="catalog"/> Products</button>
        <button type="button" className={view==="categories"?styles.activeTab:undefined} onClick={()=>setView("categories")}><AdminNavIcon name="overview"/> Categories</button>
      </div>
      <div className={styles.topActions}>
        {canWrite?<Link href="/admin/quickadd">+ Quick Add</Link>:null}
        <Link href="/admin/catalogue/structure">Advanced Structure</Link>
        <Link href="/admin/catalogue/enrichment">Quality QA</Link>
      </div>
    </div>

    {view==="products"&&metrics?<div className={styles.metricGrid}>
      <article><span>Canonical products</span><strong>{formatCount(metrics.canonicalProductsApprox)}</strong><small>fast DB estimate</small></article>
      <article><span>Storefront projection</span><strong>{formatCount(metrics.storefrontProductsApprox)}</strong><small>currently projected</small></article>
      <article><span>Vendor offers</span><strong>{formatCount(metrics.vendorOffersApprox)}</strong><small>fast DB estimate</small></article>
      <article><span>Families</span><strong>{formatCount(metrics.productFamiliesApprox)}</strong><small>canonical grouping</small></article>
      <article className={metrics.uncategorizedLive?styles.attentionMetric:undefined}><span>Uncategorized</span><strong>{formatCount(metrics.uncategorizedLive)}</strong><small>needs taxonomy</small></article>
      <article><span>Categories</span><strong>{formatCount(metrics.categories)}</strong><small>taxonomy nodes</small></article>
    </div>:null}

    <div className={styles.controlBar}>
      <label className={styles.search}><span aria-hidden="true">⌕</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={view==="products"?"Search title, GTIN, MPN or product ID…":"Search category or code…"}/>{query?<button type="button" onClick={()=>setQuery("")} aria-label="Clear search">×</button>:null}</label>
      {view==="products"?<>
        <select value={category} onChange={event=>setCategory(event.target.value)} aria-label="Category filter"><option value="">All categories</option>{(workspace?.categories??[]).map(item=><option key={item.categoryCode} value={item.categoryCode}>{item.labelEl}</option>)}</select>
        <select value={channel} onChange={event=>setChannel(event.target.value)} aria-label="Commerce channel"><option value="all">All channels</option><option value="normal">Normal</option><option value="bazaar">Bazaar</option></select>
        <div className={styles.layoutToggle} aria-label="Layout"><button type="button" className={layout==="cards"?styles.activeLayout:undefined} onClick={()=>setLayout("cards")} aria-label="Card view">▦</button><button type="button" className={layout==="rows"?styles.activeLayout:undefined} onClick={()=>setLayout("rows")} aria-label="Row view">☷</button></div>
      </>:null}
    </div>

    {view==="products"?<div className={styles.filterRail}>{PRODUCT_STATES.map(([value,label])=><button type="button" key={value} className={state===value?styles.activeFilter:undefined} onClick={()=>setState(value)}>{label}</button>)}{filtersActive?<button type="button" className={styles.clearFilter} onClick={()=>{setQuery("");setState("all");setCategory("");setChannel("all");}}>Reset</button>:null}</div>:null}

    {view==="products"&&!loading?<div className={styles.resultBar}>
      <span><strong>{visibleProducts.length}</strong> products loaded{workspace?.hasMore?" · more available":""}</span>
      <div>
        <button type="button" onClick={()=>setSelected(new Set(visibleProducts.map(product=>product.publicId)))} disabled={!visibleProducts.length}>Select visible</button>
        <button type="button" onClick={()=>setReloadKey(value=>value+1)}>Refresh</button>
      </div>
    </div>:null}

    {view==="products"&&selected.size?<div className={styles.selectionBar}><strong>{selected.size} selected</strong><button type="button" onClick={copySelected}>Copy IDs</button><Link href="/admin/matching">Open Matching</Link><button type="button" onClick={()=>setSelected(new Set())}>Clear selection</button></div>:null}

    {error?<div className={styles.error} role="alert"><strong>Could not complete the request.</strong><span>{error}</span><button type="button" onClick={()=>setReloadKey(value=>value+1)}>Retry</button></div>:null}
    {loading?<div className={styles.skeletonGrid} aria-label="Loading">{Array.from({length:view==="products"?12:8}).map((_,index)=><i key={index}/>)}</div>:null}

    {!loading&&view==="products"?<>
      <div className={layout==="cards"?styles.productGrid:styles.productRows}>
        {visibleProducts.map(product=>{const currentState=productState(product);const quality=qualityScore(product);const storefrontHref=productStorefrontHref(product);const visualStyle={"--score":quality+"%"} as CSSProperties & Record<"--score",string>;return <article className={styles.productCard} key={product.publicId}>
          <div className={styles.productTop}><label className={styles.checkbox}><input type="checkbox" checked={selected.has(product.publicId)} onChange={()=>toggleSelected(product.publicId)}/><span/></label><span className={styles.status+" "+styles["status_"+currentState.tone]}>{currentState.label}</span><span className={styles.channel}>{product.channel}</span></div>
          <div className={styles.productVisual} aria-hidden="true"><span>{(product.brandName??product.categoryName??"KM").slice(0,2).toUpperCase()}</span><i style={visualStyle}/></div>
          <div className={styles.productBody}><small>{product.brandName??"No brand"}</small><h3>{product.title}</h3><p>{product.categoryName??"Χωρίς κατηγορία"}</p><div className={styles.productSignals}><span className={product.hasMedia?styles.goodSignal:styles.badSignal}>{product.hasMedia?"✓ Media":"! No media"}</span><span className={product.offerCount?styles.goodSignal:styles.badSignal}>{product.offerCount?String(product.offerCount)+" offer"+(product.offerCount===1?"":"s"):"! No offer"}</span><span className={!product.missingAttributes?styles.goodSignal:styles.warnSignal}>{product.missingAttributes?"! Attributes":"✓ Attributes"}</span></div></div>
          <div className={styles.productMeta}><div><span>From</span><strong>{formatMoney(product.minPriceMinor,product.currency)}</strong></div><div><span>Quality</span><strong>{quality}%</strong></div></div>
          <div className={styles.productIds}><code>{product.publicId}</code>{product.gtin?<code>GTIN {product.gtin}</code>:null}</div>
          <div className={styles.productActions}>{storefrontHref?<Link href={storefrontHref}>Storefront ↗</Link>:<span aria-disabled="true">Not public</span>}{product.categoryCode?<Link href={"/admin/catalogue/structure?category="+encodeURIComponent(product.categoryCode)}>Category</Link>:<Link href="/admin/catalogue/structure">Assign category</Link>}</div>
        </article>;})}
      </div>
      {!visibleProducts.length?<div className={styles.empty}><AdminNavIcon name="search"/><strong>No products match these filters.</strong><span>Try removing one filter or searching by an exact GTIN / product ID.</span></div>:null}
      {workspace?.hasMore?<button className={styles.loadMore} type="button" onClick={loadMoreProducts} disabled={loadingMore}>{loadingMore?"Loading…":"Load next 48 products"}</button>:null}
    </>:null}

    {!loading&&view==="categories"?<>
      <div className={styles.categoryHeader}><div><strong>Category control</strong><span>{canWrite?"Toggle visibility and assignment rules without leaving the dashboard.":"Read-only access: category policies and states are visible but cannot be changed."}</span></div><Link href="/admin/catalogue/structure">Open full taxonomy tree →</Link></div>
      <div className={styles.categoryGrid}>{(categoryWorkspace?.categories??[]).map(item=><article className={styles.categoryCard} key={item.categoryCode}>
        <div className={styles.categoryCardHead}><span className={styles.categoryGraphic}><AdminNavIcon name="catalog"/></span><div><small>{item.parentCategoryCode??"ROOT"} · {item.taxonomyRole}</small><h3>{item.labelEl}</h3><code>{item.categoryCode}</code></div><strong>{formatCount(item.liveProductCount)}<small> live</small></strong></div>
        <div className={styles.categoryPolicy}>
          <label><span>Commerce policy</span><select value={item.commerceMode} disabled={!canWrite||categoryBusy===item.categoryCode+":commerce"} onChange={event=>void updateCommerceMode(item,event.target.value)}><option value="standard">Standard</option><option value="logistics_sensitive">Logistics sensitive</option><option value="compatibility_sensitive">Compatibility sensitive</option><option value="regulated_mixed">Regulated mixed</option><option value="vehicles">Vehicles</option><option value="directory_only">Directory only</option></select></label>
        </div>
        <div className={styles.categoryToggles}>{(["active","discoverable","assignable"] as const).map(field=>{const checked=item[field];const busy=categoryBusy===item.categoryCode+":"+field;return <button type="button" key={field} className={checked?styles.toggleOn:styles.toggleOff} disabled={!canWrite||busy} onClick={()=>void toggleCategory(item,field)} aria-pressed={checked}><i/><span>{field==="active"?"Active":field==="discoverable"?"Discoverable":"Assignable"}</span></button>;})}</div>
        <div className={styles.categoryActions}><Link href={"/admin/catalogue/structure?category="+encodeURIComponent(item.categoryCode)}>Advanced settings →</Link></div>
      </article>)}</div>
      {!categoryWorkspace?.categories.length?<div className={styles.empty}><AdminNavIcon name="search"/><strong>No categories match this search.</strong></div>:null}
      {categoryWorkspace?.hasMore?<button className={styles.loadMore} type="button" onClick={loadMoreCategories} disabled={loadingMore}>{loadingMore?"Loading…":"Load more categories"}</button>:null}
    </>:null}
  </section>;
}
