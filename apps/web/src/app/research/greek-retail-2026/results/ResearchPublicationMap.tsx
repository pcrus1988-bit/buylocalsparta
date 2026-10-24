"use client";

import { useEffect,useMemo,useState } from "react";
import { GREECE_REGIONS } from "../../../../lib/research-geographic-core";
import type { SafePublicResultPoint,SafeParticipationGeography } from "../../../../lib/research-public-results-data";
import { publicMetricLabel } from "../../../../lib/research-public-results-sections";
import styles from "./ResultsWorkbench.module.css";

type Feature={properties:{name:string};geometry:{type:string;coordinates:unknown}};
type MapData={type:string;features:Feature[]};
const names=new Map(GREECE_REGIONS.map(r=>[r.key,r.label]));
function polygonPath(geometry:Feature["geometry"]):string{
 const draw=(ring:number[][])=>ring.length?
  "M"+ring.map(([lon,lat])=>`${(55+(lon-19)*65).toFixed(1)},${(18+(42-lat)*78).toFixed(1)}`).join("L")+"Z":"";
 if(geometry.type==="Polygon")return (geometry.coordinates as number[][][]).map(draw).join(" ");
 if(geometry.type==="MultiPolygon")return (geometry.coordinates as number[][][][]).flatMap(p=>p.map(draw)).join(" ");
 return "";
}
const fmt=(n:number)=>n.toLocaleString("el-GR",{maximumFractionDigits:1});
function heat(value:number|undefined,maximum:number,isProportion:boolean){
 if(value===undefined)return "#e4e8e1";
 const amount=Math.max(0,Math.min(1,isProportion?value:Math.sqrt(Math.max(0,value)/Math.max(1,maximum))));
 const from=[222,237,220],to=[21,99,63];
 return "rgb("+from.map((v,i)=>Math.round(v+(to[i]-v)*amount)).join(",")+")";
}
export function ResearchPublicationMap({
 points,geography,isDemo
}:{
 points:readonly SafePublicResultPoint[];
 geography?:SafeParticipationGeography;
 isDemo:boolean;
}){
 const [geo,setGeo]=useState<MapData|null>(null);
 const [failed,setFailed]=useState(false);
 const [measure,setMeasure]=useState("participation");
 const [selected,setSelected]=useState("");
 const [sort,setSort]=useState("high");
 const [zoom,setZoom]=useState(1);
 const [search,setSearch]=useState("");
 useEffect(()=>{
  const c=new AbortController();
  fetch("/research/greece-regions.geojson",{signal:c.signal}).then(r=>{
   if(!r.ok)throw Error("map unavailable");return r.json();
  }).then((x:MapData)=>{if(x.type!=="FeatureCollection"||!Array.isArray(x.features))throw Error("invalid geography");setGeo(x);})
   .catch((e:Error)=>{if(e.name!=="AbortError")setFailed(true);});
  return ()=>c.abort();
 },[]);
 const metricKeys=[...new Set(points.filter(p=>typeof p.segment.regionCode==="string").map(p=>p.metricKey))].sort();
 const selectedKey=measure!=="participation"&&metricKeys.includes(measure)?measure:"participation";
 const regionValues=useMemo(()=>{
  const byKey=new Map(geography?.regions.map(x=>[x.key,x.started])??[]);
  const regionPoints=points.filter(p=>p.metricKey===selectedKey&&typeof p.segment.regionCode==="string");
  const byOutcome=new Map(regionPoints.map(p=>[p.segment.regionCode,p.value]));
  const byN=new Map(regionPoints.map(p=>[p.segment.regionCode,p.n]));
  return GREECE_REGIONS.map(region=>({
   key:region.key,label:region.label,
   value:selectedKey==="participation"?byKey.get(region.key):byOutcome.get(region.key),
   n:selectedKey==="participation"?byKey.get(region.key):byN.get(region.key)
  }));
 },[geography,points,selectedKey]);
 const available=regionValues.filter(v=>v.value!==undefined&&v.n!==undefined);
 const max=Math.max(1,...available.map(x=>x.value??0));
 const hasMetric=selectedKey!=="participation";
 const isProportion=hasMetric&&points.some(p=>p.metricKey===selectedKey&&p.format==="proportion");
 const sorted=regionValues.filter(x=>names.has(x.key)&&x.label.toLocaleLowerCase("el").includes(search.toLocaleLowerCase("el")))
  .sort((a,b)=>{
   if(sort==="name")return a.label.localeCompare(b.label,"el");
   if(a.value===undefined)return b.value===undefined?0:1;
   if(b.value===undefined)return -1;
   return sort==="low"?a.value-b.value:b.value-a.value;
  });
 const display=(v:number|undefined)=>v===undefined?"Ανεπαρκή δεδομένα":
  hasMetric?(isProportion?fmt(v*100)+"%":fmt(v)):Math.round(v).toLocaleString("el-GR");
 const focused=regionValues.find(v=>v.key===selected);
 const density=selectedKey==="participation"&&geography?.densityImage?geography.densityImage:undefined;
 return <section aria-label="Διαδραστικός χάρτης Ελλάδας" className={styles.mapPanel}>
  <div className={styles.mapFilters}>
   <label>Τι να εμφανίζει ο χάρτης
    <select value={selectedKey} onChange={e=>{setMeasure(e.target.value);setSelected("");}}>
     <option value="participation">Πυκνότητα συμμετοχής · ενάρξεις</option>
     {metricKeys.map(key=><option key={key} value={key}>{publicMetricLabel(key)}</option>)}
    </select>
   </label>
   <label>Ταξινόμηση
    <select value={sort} onChange={e=>setSort(e.target.value)}>
     <option value="high">Υψηλότερες τιμές</option><option value="low">Χαμηλότερες τιμές</option><option value="name">Αλφαβητικά</option>
    </select>
   </label>
   <label>Εστίαση σε Περιφέρεια
    <select value={selected} onChange={e=>setSelected(e.target.value)}>
     <option value="">Όλη η Ελλάδα</option>{GREECE_REGIONS.map(r=><option value={r.key} key={r.key}>{r.label}</option>)}
    </select>
   </label>
  </div>
  {isDemo&&<div className={styles.demoStrip}>ΔΕΙΓΜΑ ΠΡΟΕΠΙΣΚΟΠΗΣΗΣ — Δεν απεικονίζονται πραγματικές συμμετοχές ή αποτελέσματα.</div>}
  <div className={styles.mapLayout}>
   <div className={styles.mapCanvas}>
    <div className={styles.mapToolbar}><strong>{hasMetric?"Περιφερειακές εκτιμήσεις":"Πυκνότητα συμμετοχής"}</strong>
     <div className={styles.mapZoom}>
      <button type="button" aria-label="Σμίκρυνση" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z/1.4))}>−</button>
      <button type="button" aria-label="Μεγέθυνση" disabled={zoom>=3.5} onClick={()=>setZoom(z=>Math.min(3.5,z*1.4))}>+</button>
      <button type="button" onClick={()=>setZoom(1)}>Επαναφορά</button>
     </div>
    </div>
    {failed?<p role="alert">Ο γεωγραφικός χάρτης δεν φορτώθηκε. Τα περιφερειακά δεδομένα εμφανίζονται στον πίνακα.</p>:
     !geo?<p role="status">Φόρτωση γεωγραφικού υποβάθρου…</p>:
     <svg viewBox={`${405-405/zoom} ${325-325/zoom} ${810/zoom} ${650/zoom}`}
      role="img" aria-label="Χρωματικός χάρτης των 13 Περιφερειών Ελλάδας· επιλέξτε περιοχή στον χάρτη ή στον πίνακα"
      className={styles.mapSvg}>
      <defs>
       <clipPath id="results-greece-land">{geo.features.map(f=><path key={f.properties.name} d={polygonPath(f.geometry)} fillRule="evenodd"/>)}</clipPath>
      </defs>
      {geo.features.map(feature=>{
       const region=regionValues.find(x=>x.key===feature.properties.name);
       const fill=region&&region.value!==undefined?heat(region.value,max,isProportion):"#e4e8e1";
       return <path key={feature.properties.name} d={polygonPath(feature.geometry)}
        fill={density?"#eaf0e5":fill} stroke="#8ca99a" strokeWidth={1.1/zoom}
        opacity={selected&&selected!==feature.properties.name?.95:1}
        fillRule="evenodd" className={styles.mapRegion}
        onClick={()=>setSelected(s=>s===feature.properties.name?"":feature.properties.name)}>
        <title>{names.get(feature.properties.name)??feature.properties.name}: {display(region?.value)}</title>
       </path>;
      })}
      {density&&<image href={density} x="0" y="0" width="810" height="650" preserveAspectRatio="none"
        clipPath="url(#results-greece-land)" pointerEvents="none"/>}
     </svg>}
    <div className={styles.legend}><span>Χαμηλότερη</span><span className={styles.colorRamp}/><span>Υψηλότερη</span><span className={styles.legendNoData}>■ χωρίς δημοσιεύσιμα δεδομένα</span></div>
    {focused&&<div className={styles.regionFocus}><strong>{focused.label}</strong><span>{display(focused.value)}</span></div>}
   </div>
   <div className={styles.mapSide}>
    <label>Αναζήτηση Περιφέρειας<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="π.χ. Πελοπόννησος"/></label>
    <div className={styles.regionList}>
     {sorted.map(region=><button type="button" key={region.key} aria-pressed={selected===region.key}
       className={selected===region.key?styles.selectedRegion:styles.regionButton}
       onClick={()=>setSelected(s=>s===region.key?"":region.key)}>
      <span><i style={{background:region.value===undefined?"#d9dfd6":heat(region.value,max,isProportion)}}/>{region.label}</span>
      <strong>{display(region.value)}</strong>
     </button>)}
    </div>
   </div>
  </div>
  {hasMetric?<p className={styles.note}>
   Η χρωματική ένταση αφορά αποκλειστικά εγκεκριμένες συγκεντρωτικές εκτιμήσεις ανά Περιφέρεια με n≥30.
   Δεν εξάγουμε συμπεράσματα από κωδικούς νομού ή ιστορικούς κωδικούς προέλευσης.
   Οι κενές Περιφέρειες σημαίνουν απουσία επαρκών ή ελεγμένων δεδομένων, όχι μηδενικό αποτέλεσμα.
  </p>:<p className={styles.note}>
   Η συμμετοχή αποτυπώνει ενάρξεις ερωτηματολογίων και όχι απαντήσεις ή αποτελέσματα.
   Τα δεδομένα προέρχονται από δημοσίως διαθέσιμα γεωγραφικά συγκεντρωτικά στοιχεία, όχι από θέσεις συσκευών.
   {available.length===0?" Δεν διατίθενται προς το παρόν επαρκή δημοσιεύσιμα γεωγραφικά στοιχεία.":""}
  </p>}
  <p className={styles.note}>Γεωγραφικά όρια: ίδιο υπόβαθρο 13 Περιφερειών με τον υπάρχοντα χάρτη της έρευνας.
   Τα επιμέρους δεδομένα μικρών ομάδων δεν μεταφέρονται στον φυλλομετρητή.</p>
 </section>;
}
