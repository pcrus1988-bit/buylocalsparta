"use client";

import { useEffect,useMemo,useState } from "react";
import { GREECE_REGIONS } from "../../../../lib/research-geographic-core";
import type { SafePublicResultPoint,SafeParticipationGeography } from "../../../../lib/research-public-results-data";
import { PUBLIC_MAP_QUESTIONS,mapAnswers,mapLegendDomain,mapColorStrength,safeMapSelection } from "../../../../lib/research-public-map-questions";
import styles from "./ResultsWorkbench.module.css";
import {
 nationalAnswerEstimate,nationalParticipationTotal,regionalParticipationShare,
 mapNationalDifference,nationalCoverageNote
} from "../../../../lib/research-public-map-comparison";

type Feature={properties:{name:string};geometry:{type:string;coordinates:unknown}};
type MapData={type:string;features:Feature[]};
const names=new Map<string,string>(GREECE_REGIONS.map(r=>[r.key,r.label]));
function polygonPath(geometry:Feature["geometry"]):string{
 const draw=(ring:number[][])=>ring.length?
  "M"+ring.map(([lon,lat])=>`${(55+(lon-19)*65).toFixed(1)},${(18+(42-lat)*78).toFixed(1)}`).join("L")+"Z":"";
 if(geometry.type==="Polygon")return (geometry.coordinates as number[][][]).map(draw).join(" ");
 if(geometry.type==="MultiPolygon")return (geometry.coordinates as number[][][][]).flatMap(p=>p.map(draw)).join(" ");
 return "";
}
const fmt=(n:number)=>n.toLocaleString("el-GR",{maximumFractionDigits:1});
type Palette=Readonly<{from:readonly number[];to:readonly number[];label:string}>;
const PALETTES:Readonly<Record<string,Palette>>={
 economy:{from:[252,234,211],to:[161,64,43],label:"Οικονομία"},
 digital:{from:[219,235,248],to:[26,98,161],label:"Ψηφιακές δυνατότητες"},
 customers:{from:[219,239,220],to:[18,111,67],label:"Πελάτες"},
 operations:{from:[240,230,248],to:[102,65,148],label:"Λειτουργία"},
 investment:{from:[250,237,209],to:[155,103,21],label:"Επενδύσεις"},
 indices:{from:[220,236,235],to:[6,103,119],label:"Δείκτες"},
 participation:{from:[223,235,246],to:[23,95,159],label:"Κάλυψη συμμετοχής"}
};
const paletteFor=(id:string):Palette=>{
 if(id==="participation")return PALETTES.participation!;
 if(["Q03","Q04","Q05","Q06","Q24"].includes(id))return PALETTES.digital!;
 if(["Q07","Q08"].includes(id))return PALETTES.operations!;
 if(["Q16","Q17","Q19","Q20"].includes(id))return PALETTES.investment!;
 if(["Q21","Q27"].includes(id))return PALETTES.economy!;
 if(id==="indices")return PALETTES.indices!;
 return PALETTES.customers!;
};
const rgb=(channels:readonly number[])=>"rgb("+channels.join(",")+")";
function heat(value:number|undefined,domain:{minimum:number;maximum:number},palette:Palette){
 if(value===undefined)return "#e4e8e1";
 const strength=mapColorStrength(value,domain);
 return "rgb("+palette.from.map((v,i)=>Math.round(v+(palette.to[i]!-v)*strength)).join(",")+")";
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
 const [mode,setMode]=useState<"answers"|"participation">("answers");
 const [questionId,setQuestionId]=useState("Q09");
 const [answerKey,setAnswerKey]=useState("customer_acquisition_sources.share.word_of_mouth");
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
 const {question,answer}=safeMapSelection(questionId,answerKey);
 const hasMetric=mode==="answers";
 const selectedKey=hasMetric?answer:"participation";
 const visibleAnswers=mapAnswers(question);
 const regionalApproved=new Set(points.filter(p=>typeof p.segment.regionCode==="string").map(p=>p.metricKey));
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
 const nationalPoint=hasMetric?nationalAnswerEstimate(points,selectedKey):undefined;
 const nationalStarted=nationalParticipationTotal(geography);
 const nationalValue=hasMetric?nationalPoint?.value:undefined;
 const regionalVisibleStarts=hasMetric?undefined:available.reduce((total,r)=>total+(r.value??0),0);
 const questionPoint=points.find(p=>p.metricKey===selectedKey);
 const isProportion=hasMetric&&questionPoint?.format==="proportion";
 const domain=hasMetric?
   mapLegendDomain(selectedKey,isProportion?"proportion":"mean",available.map(x=>x.value!)):
   {minimum:0,maximum:Math.max(1,...available.map(x=>x.value??0)),unit:"ενάρξεις"};
 const palette=paletteFor(hasMetric?question.id:"participation");
 const coverage=available.length;
 const legendValue=(value:number)=>isProportion?fmt(value*100)+"%":
   hasMetric?fmt(value)+(domain.unit?" "+domain.unit:""):Math.round(value).toLocaleString("el-GR");
 const sorted=regionValues.filter(x=>names.has(x.key)&&x.label.toLocaleLowerCase("el").includes(search.toLocaleLowerCase("el")))
  .sort((a,b)=>{
   if(sort==="name")return a.label.localeCompare(b.label,"el");
   if(a.value===undefined)return b.value===undefined?0:1;
   if(b.value===undefined)return -1;
   return sort==="low"?a.value-b.value:b.value-a.value;
  });
 const display=(v:number|undefined)=>v===undefined?"Δεν υπάρχουν εγκεκριμένα δεδομένα":legendValue(v);
 const nationalDisplay=hasMetric?display(nationalValue):nationalStarted!==undefined?"100%":"Μη διαθέσιμο";
 const showRegionalValue=(region:{value:number|undefined})=>region.value===undefined?"Χωρίς δημοσιεύσιμα στοιχεία":
  hasMetric?display(region.value):
  regionalParticipationShare(region.value,nationalStarted)!==undefined
   ?fmt(regionalParticipationShare(region.value,nationalStarted)!*100)+"%": "Χωρίς εθνική βάση";
 const nationalDiff=(value:number|undefined)=>hasMetric?
  mapNationalDifference(value,nationalValue,isProportion):undefined;
 const formatDiff=(value:number|undefined)=>value===undefined?"—":
  (value>0?"+":"")+fmt(value)+(isProportion?" μ.π.":" "+domain.unit);
 const focused=regionValues.find(v=>v.key===selected);
 const density=selectedKey==="participation"&&geography?.densityImage?geography.densityImage:undefined;
 return <section aria-label="Διαδραστικός χάρτης Ελλάδας" className={styles.mapPanel}>
  <div className={styles.mapFilters}>
   <label>Επίπεδο οπτικοποίησης
    <select value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setSelected("");}}>
     <option value="answers">Απαντήσεις και δείκτες</option><option value="participation">Κάλυψη συμμετοχής</option>
    </select>
   </label>
   {hasMetric&&<label>1 · Επιλέξτε ερώτηση
    <select value={question.id} onChange={e=>{
      const next=PUBLIC_MAP_QUESTIONS.find(q=>q.id===e.target.value);
      if(next){setQuestionId(next.id);setAnswerKey(next.metricKeys[0]??"");setSelected("");}
    }}>{PUBLIC_MAP_QUESTIONS.filter(q=>q.metricKeys.length>0).map(q=>
      <option value={q.id} key={q.id}>{q.fullLabel}</option>)}</select>
   </label>}
   {hasMetric&&<label>2 · Επιλέξτε απάντηση / δείκτη
    <select value={selectedKey} onChange={e=>{setAnswerKey(e.target.value);setSelected("");}}>
     {visibleAnswers.map(item=><option value={item.key} key={item.key}>
       {item.label}{!regionalApproved.has(item.key)&&!isDemo?" · χωρίς περιφερειακά στοιχεία":""}
     </option>)}
    </select>
   </label>}
   <label>Ταξινόμηση Περιφερειών
    <select value={sort} onChange={e=>setSort(e.target.value)}>
     <option value="high">Υψηλότερες τιμές</option><option value="low">Χαμηλότερες τιμές</option>
     <option value="name">Αλφαβητικά</option>
    </select>
   </label>
   <label>Εστίαση σε Περιφέρεια
    <select value={selected} onChange={e=>setSelected(e.target.value)}>
     <option value="">Όλη η Ελλάδα</option>{GREECE_REGIONS.map(r=>
       <option value={r.key} key={r.key}>{r.label}</option>)}
    </select>
   </label>
  </div>
  <div aria-live="polite" className={styles.mapQuestionSummary}>
   <div><span className={styles.mapQuestionCode}>{hasMetric?question.id:"ΚΑΛΥΨΗ"}</span>
    <strong>{hasMetric?question.fullLabel:"Πού ξεκίνησαν τα ερωτηματολόγια;"}</strong>
    <p>{hasMetric?question.note:"Η γεωγραφική κάλυψη καταγράφει ενάρξεις, όχι απαντήσεις ή τελικά ευρήματα."}</p>
   </div>
   <div className={styles.mapQuestionStats}><b>{coverage} / 13</b><span>Περιφέρειες με διαθέσιμη τιμή</span></div>
  </div>
  {hasMetric&&<div className={styles.mapSelectedAnswer}>
   <span>ΕΠΙΛΕΓΜΕΝΗ ΑΠΑΝΤΗΣΗ / ΔΕΙΚΤΗΣ</span>
   <strong>{visibleAnswers.find(x=>x.key===selectedKey)?.label??"Μη διαθέσιμη επιλογή"}</strong>
   <small>{isProportion?"Ποσοστό επιχειρήσεων ανά Περιφέρεια":"Μέση τιμή ανά Περιφέρεια · "+domain.unit}</small>
  </div>}
  <section className={styles.mapNationalOverview} aria-label="Πανελλαδική εκτίμηση και κατανομή ανά Περιφέρεια" aria-live="polite">
   <div className={styles.nationalHeadline}>
    <span className={styles.nationalFlag}>ΕΛΛΑΔΑ · ΣΥΝΟΛΟ</span>
    <strong>{nationalDisplay}</strong>
    <span>{hasMetric?"Πανελλαδική τιμή επιλεγμένης απάντησης":"100% των καταγεγραμμένων ενάρξεων πανελλαδικά"}</span>
    <small>{hasMetric?
      nationalPoint?"Εθνική σταθμισμένη εκτίμηση · n="+nationalPoint.n.toLocaleString("el-GR"):
        "Δεν υπάρχει εγκεκριμένη πανελλαδική εκτίμηση για αυτή την επιλογή":
      nationalStarted!==undefined?"Σύνολο ενάρξεων: "+nationalStarted.toLocaleString("el-GR"):
        "Δεν υπάρχει επαληθευμένος εθνικός αριθμός ενάρξεων"}</small>
    {hasMetric&&nationalPoint?.ciLower!==null&&nationalPoint?.ciLower!==undefined&&
      nationalPoint.ciUpper!==null&&nationalPoint.ciUpper!==undefined&&
      <small>95% ΔΕ: {legendValue(nationalPoint.ciLower)} – {legendValue(nationalPoint.ciUpper)}</small>}
   </div>
   <div className={styles.nationalDetails}>
    <span className={styles.nationalTag}>ΔΙΑΣΠΑΣΗ ΑΝΑ ΠΕΡΙΦΕΡΕΙΑ</span>
    <strong>{coverage} από 13 Περιφέρειες με δημοσιεύσιμα δεδομένα</strong>
    <p>{hasMetric?
     "Κάθε περιφερειακό ποσοστό είναι το ποσοστό των επιχειρήσεων αυτής της Περιφέρειας που έδωσαν την επιλεγμένη απάντηση. Δεν είναι μερίδιο του εθνικού συνόλου και δεν αθροίζεται σε 100%.":
     nationalCoverageNote(coverage,regionalVisibleStarts,nationalStarted)}</p>
    {hasMetric&&nationalValue!==undefined&&<p>Οι περιφερειακές αποκλίσεις μετρώνται από το ξεχωριστά σταθμισμένο πανελλαδικό αποτέλεσμα. Δεν τεκμηριώνουν αυτομάτως στατιστικά σημαντική διαφορά.</p>}
   </div>
  </section>
  {isDemo&&<div className={styles.demoStrip}>ΔΕΙΓΜΑ ΠΡΟΕΠΙΣΚΟΠΗΣΗΣ — Δεν απεικονίζονται πραγματικές συμμετοχές ή αποτελέσματα.</div>}
  <div className={styles.mapLayout}>
   <div className={styles.mapCanvas}>
    <div className={styles.mapToolbar}><strong>{hasMetric?"Περιφερειακή εικόνα · "+question.id:"Πυκνότητα συμμετοχής"}</strong>
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
       const fill=region&&region.value!==undefined?heat(region.value,domain,palette):"#e4e8e1";
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
    <div className={styles.legend}><span>{legendValue(domain.minimum)}</span>
     <span className={styles.colorRamp}
       style={{background:"linear-gradient(90deg,"+rgb(palette.from)+","+rgb(palette.to)+")"}}/>
     <span>{legendValue(domain.maximum)}</span><span className={styles.legendNoData}>■ χωρίς δημοσιεύσιμα δεδομένα</span>
    </div>
    {focused&&<div className={styles.regionFocus}><strong>{focused.label}</strong>
     <span>{hasMetric?display(focused.value):showRegionalValue(focused)}
       {focused.value!==undefined&&!hasMetric?" · "+Math.round(focused.value).toLocaleString("el-GR")+" ενάρξεις":""}
       {hasMetric&&focused.n!==undefined?" · n="+focused.n:""}
       {hasMetric&&nationalDiff(focused.value)!==undefined?" · Δ έναντι Ελλάδας "+formatDiff(nationalDiff(focused.value)):""}
     </span></div>}
   </div>
   <div className={styles.mapSide}>
    <label>Αναζήτηση Περιφέρειας<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="π.χ. Πελοπόννησος"/></label>
    <div className={styles.regionList}>
     <div className={styles.regionListHeader}><span>Περιφέρεια</span>
      <span>{hasMetric?"Επιλεγμένη απάντηση":"Μερίδιο ενάρξεων"}</span></div>
     {sorted.map(region=><button type="button" key={region.key} aria-pressed={selected===region.key}
       className={selected===region.key?styles.selectedRegion:styles.regionButton}
       onClick={()=>setSelected(s=>s===region.key?"":region.key)}>
      <span><i style={{background:region.value===undefined?"#d9dfd6":heat(region.value,domain,palette)}}/>{region.label}</span>
      <span className={styles.regionalNumbers}>
       <strong>{showRegionalValue(region)}</strong>
       {region.value!==undefined&&hasMetric&&
         <small>{region.n!==undefined?"n="+region.n+" · ":""}
         {nationalDiff(region.value)!==undefined?"Ελλάδα "+formatDiff(nationalDiff(region.value)):"Εθνική σύγκριση μη διαθέσιμη"}</small>}
       {region.value!==undefined&&!hasMetric&&<small>{Math.round(region.value).toLocaleString("el-GR")} ενάρξεις</small>}
      </span>
     </button>)}
    </div>
   </div>
  </div>
  {hasMetric&&<p className={styles.note}>
    <strong>Πώς διαβάζονται τα ποσοστά:</strong> Το «Σύνολο Ελλάδας» προκύπτει μόνο από την εγκεκριμένη εθνική εκτίμηση.
    Δεν υπολογίζεται από άθροισμα ή απλό μέσο όρο περιφερειακών ποσοστών.
    Τα ποσοστά των 13 Περιφερειών αναφέρονται στη δική τους βάση απαντήσεων και δεν αθροίζουν σε 100%.
   </p>}
    {hasMetric?<p className={styles.note}>
   Η επιλογή διαφορετικής ερώτησης ή απάντησης επαναχρωματίζει τον χάρτη, ενημερώνει
   την κλίμακα και αναταξινομεί τις Περιφέρειες από τον συγκεκριμένο δείκτη.
   Τα ποσοστά χρησιμοποιούν σταθερή κλίμακα 0–100%, οι βαθμολογίες την επιστημονική τους κλίμακα.
   Εμφανίζονται μόνο εγκεκριμένες συγκεντρωτικές εκτιμήσεις ανά Περιφέρεια με n≥30.
   Δεν χρησιμοποιούνται ιστορικοί κωδικοί νομών ως Περιφέρειες.
   {available.length===0?" Δεν υπάρχουν ακόμη δημοσιεύσιμα περιφερειακά αποτελέσματα για αυτή την απάντηση.":""}
  </p>:<p className={styles.note}>
   Η συμμετοχή αποτυπώνει ενάρξεις ερωτηματολογίων και όχι απαντήσεις ή αποτελέσματα.
   Τα δεδομένα προέρχονται από δημοσίως διαθέσιμα γεωγραφικά συγκεντρωτικά στοιχεία, όχι από θέσεις συσκευών.
   {available.length===0?" Δεν διατίθενται προς το παρόν επαρκή δημοσιεύσιμα γεωγραφικά στοιχεία.":""}
  </p>}
  <p className={styles.note}>Γεωγραφικά όρια: ίδιο υπόβαθρο 13 Περιφερειών με τον υπάρχοντα χάρτη της έρευνας.
   Τα επιμέρους δεδομένα μικρών ομάδων δεν μεταφέρονται στον φυλλομετρητή.</p>
 </section>;
}
