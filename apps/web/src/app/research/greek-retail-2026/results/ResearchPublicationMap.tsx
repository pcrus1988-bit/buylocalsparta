"use client";

import { useEffect,useMemo,useState } from "react";
import { GREECE_REGIONS } from "../../../../lib/research-geographic-core";
import { GREECE_PREFECTURES,PREFECTURE_NAMES } from "../../../../lib/research-prefectures";
import type { SafePublicResultPoint,SafeParticipationGeography,InternalResearchGeographicCoverage } from "../../../../lib/research-public-results-data";
import { PUBLIC_MAP_QUESTIONS,mapAnswers,mapLegendDomain,mapColorStrength,safeMapSelection } from "../../../../lib/research-public-map-questions";
import styles from "./ResultsWorkbench.module.css";
import {
 nationalAnswerEstimate,nationalParticipationTotal,regionalParticipationShare,
 mapNationalDifference,nationalCoverageNote
} from "../../../../lib/research-public-map-comparison";

type Feature={properties:{name:string;name_greek?:string};geometry:{type:string;coordinates:unknown}};
type MapData={type:string;features:Feature[]};
const regionNames=new Map<string,string>(GREECE_REGIONS.map(r=>[r.key,r.label]));
function polygonPath(geometry:Feature["geometry"]):string{
 const draw=(ring:number[][])=>ring.length?
  "M"+ring.map(([lon,lat])=>`${(55+(lon-19)*65).toFixed(1)},${(18+(42-lat)*78).toFixed(1)}`).join("L")+"Z":"";
 if(geometry.type==="Polygon")return (geometry.coordinates as number[][][]).map(draw).join(" ");
 if(geometry.type==="MultiPolygon")return (geometry.coordinates as number[][][][]).flatMap(p=>p.map(draw)).join(" ");
 return "";
}
const fmt=(n:number)=>n.toLocaleString("el-GR",{maximumFractionDigits:1});
function demoValue(key:string,prefecture:string,base:number,isProportion:boolean){
 let hash=2166136261;for(const ch of key+":"+prefecture)hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;
 const signed=((hash%2001)/1000)-1;
 return isProportion?Math.max(.015,Math.min(.985,base+signed*.13)):Math.max(0,base+signed*(base>10?17:.8));
}
const compactRegion:Record<string,string>={
 "EAST MACEDONIA AND THRACE":"Αν. Μακ. & Θράκη","CENTRAL MACEDONIA":"Κ. Μακεδονία",
 "THESSALY":"Θεσσαλία","NORTH AEGEAN":"Β. Αιγαίο","SOUTH AEGEAN":"Ν. Αιγαίο",
 "CENTRAL GREECE":"Στερεά","WESTERN GREECE":"Δ. Ελλάδα","PELOPONNESE":"Πελοπόννησος",
 "ATTICA":"Αττική","WEST MACEDONIA":"Δ. Μακεδονία","EPIRUS":"Ήπειρος",
 "IONIAN ISLANDS":"Ιόνια","CRETE":"Κρήτη"
};
/** Anchor labels inside the largest polygon, not a bbox covering outlying islands. */
function featureAnchor(geometry:Feature["geometry"]):{x:number;y:number}{
 const rings=geometry.type==="Polygon"?(geometry.coordinates as number[][][]): 
  geometry.type==="MultiPolygon"?(geometry.coordinates as number[][][][]).flatMap(p=>p):[];
 const ring=[...rings].sort((a,b)=>area(b)-area(a))[0]??[];
 if(!ring.length)return{x:400,y:325};
 let twice=0,cx=0,cy=0;
 for(let i=0;i<ring.length;i++){
  const p=ring[i]!,q=ring[(i+1)%ring.length]!;
  const cross=p[0]!*q[1]!-q[0]!*p[1]!;
  twice+=cross;cx+=(p[0]!+q[0]!)*cross;cy+=(p[1]!+q[1]!)*cross;
 }
 const lon=Math.abs(twice)>0.0000001?cx/(3*twice):ring[0]![0]!;
 const lat=Math.abs(twice)>0.0000001?cy/(3*twice):ring[0]![1]!;
 return{x:55+(lon-19)*65,y:18+(42-lat)*78};
}
function area(ring:number[][]){let total=0;for(let i=0;i<ring.length;i++){const a=ring[i]!,b=ring[(i+1)%ring.length]!;total+=a[0]!*b[1]!-b[0]!*a[1]!;}return Math.abs(total);}

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
 points,geography,isDemo,internalCoverage
}:{
 points:readonly SafePublicResultPoint[];
 geography?:SafeParticipationGeography;
 isDemo:boolean;
 internalCoverage?:InternalResearchGeographicCoverage;
}){
 const [geo,setGeo]=useState<MapData|null>(null);
 const [granularity,setGranularity]=useState<"prefecture"|"region">(isDemo||internalCoverage?"prefecture":"region");
 const [failed,setFailed]=useState(false);
 const [mode,setMode]=useState<"answers"|"participation">(internalCoverage?"participation":"answers");
 const [questionId,setQuestionId]=useState("Q09");
 const [answerKey,setAnswerKey]=useState("customer_acquisition_sources.share.word_of_mouth");
 const [selected,setSelected]=useState("");
 const [sort,setSort]=useState("high");
 const [showLabels,setShowLabels]=useState(true);
 const [sector,setSector]=useState("");
 const [zoom,setZoom]=useState(1);
 const [search,setSearch]=useState("");
 useEffect(()=>{
  const c=new AbortController();
  setGeo(null);setFailed(false);
  fetch(granularity==="prefecture"?"/research/greece-prefectures.geojson":"/research/greece-regions.geojson",{signal:c.signal}).then(r=>{
   if(!r.ok)throw Error("map unavailable");return r.json();
  }).then((x:MapData)=>{if(x.type!=="FeatureCollection"||!Array.isArray(x.features))throw Error("invalid geography");setGeo(x);})
   .catch((e:Error)=>{if(e.name!=="AbortError")setFailed(true);});
  return ()=>c.abort();
 },[granularity]);
 const {question,answer}=safeMapSelection(questionId,answerKey);
 const hasMetric=mode==="answers";
 const selectedKey=hasMetric?answer:"participation";
 const visibleAnswers=mapAnswers(question);
 const sectors=[...new Set(points.flatMap(p=>p.segment.sectorCode?[p.segment.sectorCode]:[]))].sort();
 const hasApprovedCrossSections=points.some(p=>p.segment.sectorCode&&p.segment.regionCode);
 const regionalApproved=new Set(points.filter(p=>typeof p.segment.regionCode==="string").map(p=>p.metricKey));
 const regionValues=useMemo(()=>{
  const byKey=new Map(internalCoverage?internalCoverage.regions.filter(x=>x.eligibleN!==null).map(x=>[x.key,x.eligibleN!] as const):(geography?.regions.map(x=>[x.key,x.started] as const)??[]));
  const regionPoints=points.filter(p=>p.metricKey===selectedKey&&typeof p.segment.regionCode==="string"&&
   (sector?p.segment.sectorCode===sector:!p.segment.sectorCode));
  const byOutcome=new Map(regionPoints.map(p=>[p.segment.regionCode,p.value]));
  const byN=new Map(regionPoints.map(p=>[p.segment.regionCode,p.n]));
  return GREECE_REGIONS.map(region=>({
   key:region.key,label:region.label,
   value:selectedKey==="participation"?byKey.get(region.key):byOutcome.get(region.key),
   n:selectedKey==="participation"?byKey.get(region.key):byN.get(region.key)
  }));
 },[geography,internalCoverage,points,selectedKey,sector]);
 const prefectureValues=useMemo(()=>{
  const nationwide=points.find(p=>p.metricKey===selectedKey&&Object.keys(p.segment).length===0);
  const participated=new Map(internalCoverage?internalCoverage.prefectures.filter(p=>p.eligibleN!==null).map(p=>[p.key,p.eligibleN!] as const):(geography?.prefectures?.map(p=>[p.key,p.started] as const)??[]));
  return GREECE_PREFECTURES.map(prefecture=>{
   const published=points.find(p=>p.metricKey===selectedKey&&p.segment.prefectureCode===prefecture.key&&
    (sector?p.segment.sectorCode===sector:!p.segment.sectorCode));
   const synthetic=isDemo&&selectedKey!=="participation"&&nationwide&&!sector?
    demoValue(selectedKey,prefecture.key,nationwide.value,nationwide.format==="proportion"):undefined;
   return {key:prefecture.key,label:prefecture.label,
    value:selectedKey==="participation"&&!sector?participated.get(prefecture.key):published?.value??synthetic,
    n:selectedKey==="participation"&&!sector?participated.get(prefecture.key):published?.n??(synthetic!==undefined?80:undefined)};
  });
 },[points,selectedKey,isDemo,sector,geography,internalCoverage]);
 const currentValues=granularity==="prefecture"?prefectureValues:regionValues;
 const sampleBands=internalCoverage?(granularity==="prefecture"?internalCoverage.prefectures:internalCoverage.regions):[];
 const coverageByKey=new Map(sampleBands.map(item=>[item.key,item] as const));
 const anyQA=sampleBands.filter(x=>x.band!=="none").length;
 const lowQA=sampleBands.filter(x=>x.band==="under10").length;
 const coverageDescription=(key:string)=>{
  const c=coverageByKey.get(key);
  if(!c)return "";
  if(c.band==="under10")return "Συμμετοχή · n<10 · χωρίς αριθμητικά ευρήματα";
  if(c.band==="10to29")return "Μικρό δείγμα · n="+c.eligibleN+" · ενδεικτικό";
  if(c.band==="30plus")return "Επαρκέστερο n="+c.eligibleN;
  return "Χωρίς QA-επιλέξιμη συμμετοχή";
 };
 const names=granularity==="prefecture"?PREFECTURE_NAMES:regionNames;
 const available=currentValues.filter(v=>v.value!==undefined&&v.n!==undefined);
 const nationalPoint=hasMetric&&!sector?nationalAnswerEstimate(points,selectedKey):undefined;
 const nationalStarted=internalCoverage?.includedTotal??nationalParticipationTotal(geography);
 const nationalValue=nationalPoint?.value;
 const regionalVisibleStarts=!hasMetric?regionValues.reduce((total,r)=>total+(r.value??0),0):undefined;
 const regionalCoverage=regionValues.filter(r=>r.value!==undefined&&r.n!==undefined).length;
 const questionPoint=points.find(p=>p.metricKey===selectedKey);
 const isProportion=hasMetric&&questionPoint?.format==="proportion";
 const domain=hasMetric?
   mapLegendDomain(selectedKey,isProportion?"proportion":"mean",available.map(x=>x.value!)):
   {minimum:0,maximum:Math.max(1,...available.map(x=>x.value??0)),unit:"ενάρξεις"};
 const palette=paletteFor(hasMetric?question.id:"participation");
 const coverage=available.length;
 const legendValue=(value:number)=>isProportion?fmt(value*100)+"%":
   hasMetric?fmt(value)+(domain.unit?" "+domain.unit:""):Math.round(value).toLocaleString("el-GR");
 const sorted=currentValues.filter(x=>names.has(x.key)&&x.label.toLocaleLowerCase("el").includes(search.toLocaleLowerCase("el")))
  .sort((a,b)=>{
   if(sort==="name")return a.label.localeCompare(b.label,"el");
   if(a.value===undefined)return b.value===undefined?0:1;
   if(b.value===undefined)return -1;
   return sort==="low"?a.value-b.value:b.value-a.value;
  });
 const display=(v:number|undefined)=>v===undefined?"Δεν υπάρχουν εγκεκριμένα δεδομένα":legendValue(v);
 const nationalDisplay=hasMetric?display(nationalValue):nationalStarted!==undefined?"100%":"Μη διαθέσιμο";
 const regionalParticipationValue=(v:number|undefined)=>regionalParticipationShare(v,nationalStarted);
 const showGeoValue=(cell:{value:number|undefined;key?:string})=>
  cell.value===undefined?(cell.key&&internalCoverage?coverageDescription(cell.key):"Χωρίς δημοσιεύσιμα στοιχεία"):
  hasMetric?display(cell.value):
  regionalParticipationValue(cell.value)!==undefined?fmt(regionalParticipationValue(cell.value)!*100)+"%":"Χωρίς εθνική βάση";
 const nationalDiff=(value:number|undefined)=>hasMetric?
  mapNationalDifference(value,nationalValue,isProportion):undefined;
 const formatDiff=(value:number|undefined)=>value===undefined?"—":
  (value>0?"+":"")+fmt(value)+(isProportion?" μ.π.":" "+domain.unit);
 const focused=currentValues.find(v=>v.key===selected);
 const density=!internalCoverage&&granularity==="region"&&selectedKey==="participation"&&geography?.densityImage?geography.densityImage:undefined;
 return <section aria-label="Διαδραστικός χάρτης Ελλάδας" className={styles.mapPanel}>
  <div className={styles.mapFilters}>
   <label>Γεωγραφικό επίπεδο<select value={granularity} onChange={e=>{setGranularity(e.target.value as typeof granularity);setSelected("");}}><option value="prefecture">Νομοί (55 ιστορικές ενότητες)</option><option value="region">Περιφέρειες (13)</option></select></label>
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
   {hasMetric&&<label>Κλάδος (όπου έχει εγκριθεί διασταύρωση)<select value={sector} onChange={e=>{setSector(e.target.value);setSelected("");}}>
     <option value="">Όλοι οι κλάδοι</option>{sectors.map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}
    </select></label>}
   <label>Ταξινόμηση περιοχών
    <select value={sort} onChange={e=>setSort(e.target.value)}>
     <option value="high">Υψηλότερες τιμές</option><option value="low">Χαμηλότερες τιμές</option>
     <option value="name">Αλφαβητικά</option>
    </select>
   </label>
   <label>Εστίαση σε {granularity==="prefecture"?"Νομό":"Περιφέρεια"}
    <select value={selected} onChange={e=>setSelected(e.target.value)}>
     <option value="">Όλη η Ελλάδα</option>{(granularity==="prefecture"?GREECE_PREFECTURES:GREECE_REGIONS).map(r=>
       <option value={r.key} key={r.key}>{r.label}</option>)}
    </select>
   </label>
  </div>
  <div aria-live="polite" className={styles.mapQuestionSummary}>
   <div><span className={styles.mapQuestionCode}>{hasMetric?question.id:"ΚΑΛΥΨΗ"}</span>
    <strong>{hasMetric?question.fullLabel:"Πού ξεκίνησαν τα ερωτηματολόγια;"}</strong>
    <p>{hasMetric?question.note:internalCoverage?"Κάλυψη QA-επιλέξιμων ολοκληρωμένων απαντήσεων, ομαδοποιημένων ιδιωτικά μέσω Τ.Κ. Δεν πρόκειται για τελικές εκτιμήσεις.":"Η γεωγραφική κάλυψη καταγράφει ενάρξεις, όχι απαντήσεις ή τελικά ευρήματα."}</p>
   </div>
   <div className={styles.mapQuestionStats}>
    <b>{internalCoverage?anyQA:coverage} / {granularity==="prefecture"?GREECE_PREFECTURES.length:13}</b>
    <span>{internalCoverage?"Με QA-επιλέξιμη συμμετοχή":"Με διαθέσιμη τιμή"}</span>
    {internalCoverage&&<small>{coverage} με αριθμητική τιμή · {lowQA} με n<10</small>}
   </div>
  </div>
  {hasMetric&&<div className={styles.mapSelectedAnswer}>
   <span>ΕΠΙΛΕΓΜΕΝΗ ΑΠΑΝΤΗΣΗ / ΔΕΙΚΤΗΣ</span>
   <strong>{visibleAnswers.find(x=>x.key===selectedKey)?.label??"Μη διαθέσιμη επιλογή"}</strong>
   <small>{isProportion?"Ποσοστό επιχειρήσεων ανά γεωγραφική ενότητα":"Μέση τιμή ανά γεωγραφική ενότητα · "+domain.unit}</small>
  </div>}
  <section className={styles.mapNationalOverview} aria-label="Σύνολο Ελλάδας και 13 Περιφέρειες" aria-live="polite">
   <div className={styles.nationalHeadline}>
    <span className={styles.nationalFlag}>ΕΛΛΑΔΑ · ΣΥΝΟΛΟ</span>
    <strong>{nationalDisplay}</strong>
    <span>{hasMetric?"Πανελλαδική τιμή της επιλεγμένης απάντησης":internalCoverage?"100% των QA-επιλέξιμων απαντήσεων":"100% των καταγεγραμμένων ενάρξεων"}</span>
    <small>{hasMetric?nationalPoint?"Εθνική σταθμισμένη εκτίμηση · n="+nationalPoint.n.toLocaleString("el-GR"):
     "Δεν υπάρχει εγκεκριμένη πανελλαδική εκτίμηση για αυτή την επιλογή":
     nationalStarted!==undefined?(internalCoverage?"Επιλέξιμες ολοκληρωμένες: ":"Σύνολο ενάρξεων: ")+nationalStarted.toLocaleString("el-GR"):
      "Μη διαθέσιμη επαληθευμένη εθνική βάση"}</small>
    {hasMetric&&nationalPoint?.ciLower!==null&&nationalPoint?.ciLower!==undefined&&
     nationalPoint.ciUpper!==null&&nationalPoint.ciUpper!==undefined&&
     <small>95% ΔΕ: {legendValue(nationalPoint.ciLower)} – {legendValue(nationalPoint.ciUpper)}</small>}
   </div>
   <div className={styles.nationalDetails}>
    <span className={styles.nationalTag}>ΔΙΑΣΠΑΣΗ ΑΝΑ ΠΕΡΙΦΕΡΕΙΑ</span>
    <strong>{regionalCoverage} / 13 Περιφέρειες με εγκεκριμένες τιμές</strong>
    <p>{hasMetric?"Κάθε ποσοστό βασίζεται στις απαντήσεις της αντίστοιχης Περιφέρειας, όχι σε μερίδιο του εθνικού συνόλου. Δεν αθροίζονται σε 100%.":
     nationalCoverageNote(regionalCoverage,regionalVisibleStarts,nationalStarted)}</p>
    {hasMetric&&nationalValue!==undefined&&<p>Η σύγκριση γίνεται με την ξεχωριστά σταθμισμένη εθνική εκτίμηση. Δεν αποτελεί από μόνη της έλεγχο στατιστικής σημαντικότητας.</p>}
    <div className={styles.allRegionsGrid}>
     {regionValues.map(cell=><div key={cell.key} className={styles.allRegionsRow}>
      <span>{cell.label}</span><strong>{showGeoValue(cell)}</strong>
      {cell.value!==undefined&&hasMetric&&<small>n={cell.n??"—"} · Δ Ελλάδα {formatDiff(nationalDiff(cell.value))}</small>}
      {cell.value!==undefined&&!hasMetric&&<small>{Math.round(cell.value).toLocaleString("el-GR")} {internalCoverage?"QA απαντήσεις":"ενάρξεις"}</small>}
     </div>)}
    </div>
   </div>
  </section>
  {isDemo&&<div className={styles.demoStrip}>ΔΕΙΓΜΑ ΠΡΟΕΠΙΣΚΟΠΗΣΗΣ — Δεν απεικονίζονται πραγματικές συμμετοχές ή αποτελέσματα.</div>}
  <div className={styles.mapLayout}>
   <div className={styles.mapCanvas}>
    <div className={styles.mapToolbar}><strong>{hasMetric?"Περιφερειακή εικόνα · "+question.id:"Πυκνότητα συμμετοχής"}</strong>
     <label className={styles.mapLabelToggle}><input type="checkbox" checked={showLabels} onChange={e=>setShowLabels(e.target.checked)}/> Τιμές πάνω στον χάρτη</label>
     <div className={styles.mapZoom}>
      <button type="button" aria-label="Σμίκρυνση" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z/1.4))}>−</button>
      <button type="button" aria-label="Μεγέθυνση" disabled={zoom>=3.5} onClick={()=>setZoom(z=>Math.min(3.5,z*1.4))}>+</button>
      <button type="button" onClick={()=>setZoom(1)}>Επαναφορά</button>
     </div>
    </div>
    {failed?<p role="alert">Ο γεωγραφικός χάρτης δεν φορτώθηκε. Τα περιφερειακά δεδομένα εμφανίζονται στον πίνακα.</p>:
     !geo?<p role="status">Φόρτωση γεωγραφικού υποβάθρου…</p>:
     <svg viewBox={`${405-405/zoom} ${325-325/zoom} ${810/zoom} ${650/zoom}`}
      role="img" aria-label={"Χάρτης Ελλάδας: "+(granularity==="prefecture"?"55 νομοί":"13 Περιφέρειες")+"· επιλέξτε περιοχή στον χάρτη ή στον πίνακα"}
      className={styles.mapSvg}>
      <defs>
       <clipPath id="results-greece-land">{geo.features.map(f=><path key={f.properties.name} d={polygonPath(f.geometry)} fillRule="evenodd"/>)}</clipPath>
      </defs>
      {geo.features.map(feature=>{
       const region=currentValues.find(x=>x.key===feature.properties.name);
       const status=coverageByKey.get(feature.properties.name);
       const fill=region&&region.value!==undefined?heat(region.value,domain,palette):
        status?.band==="under10"?"#eadbb6":status&&status.band!=="none"?"#d1dfd1":"#e4e8e1";
       return <path key={feature.properties.name} d={polygonPath(feature.geometry)}
        fill={density?"#eaf0e5":fill} stroke="#8ca99a" strokeWidth={1.1/zoom}
        opacity={selected&&selected!==feature.properties.name?.95:1}
        fillRule="evenodd" className={styles.mapRegion}
        onClick={()=>setSelected(s=>s===feature.properties.name?"":feature.properties.name)}>
        <title>{names.get(feature.properties.name)??feature.properties.name}: {region?.value!==undefined?legendValue(region.value):coverageDescription(feature.properties.name)||display(undefined)}</title>
       </path>;
      })}
      {density&&<image href={density} x="0" y="0" width="810" height="650" preserveAspectRatio="none"
        clipPath="url(#results-greece-land)" pointerEvents="none"/>}
      {showLabels&&geo.features.map(feature=>{
       const cell=currentValues.find(r=>r.key===feature.properties.name);
       if(!cell||cell.value===undefined||cell.n===undefined)return null;
       const anchor=featureAnchor(feature.geometry);
       return <g key={"label:"+feature.properties.name} transform={"translate("+anchor.x+" "+anchor.y+")"}
         className={styles.mapValueOverlay} pointerEvents="none" aria-hidden="true">
        <rect x={granularity==="prefecture"?-33:-48} y={granularity==="prefecture"?-15:-19} width={granularity==="prefecture"?66:96} height={granularity==="prefecture"?30:38} rx="8" fill="#fffdf6" fillOpacity=".95" stroke="#9cb7a0" strokeWidth=".8"/>
        <text textAnchor="middle" y={granularity==="prefecture"?-4:-6} fontSize={granularity==="prefecture"?7:9} fontWeight="700" fill="#315d43">{granularity==="prefecture"?cell.label.slice(0,11):compactRegion[cell.key]??cell.label}</text>
        <text textAnchor="middle" y={granularity==="prefecture"?8:9} fontSize={granularity==="prefecture"?11:14} fontWeight="900" fill="#164f32">{!hasMetric?showGeoValue(cell):legendValue(cell.value)}</text>
        <title>{cell.label}: {legendValue(cell.value)} · n={cell.n}</title>
       </g>;
      })}
     </svg>}
    <div className={styles.legend}><span>{legendValue(domain.minimum)}</span>
     <span className={styles.colorRamp}
       style={{background:"linear-gradient(90deg,"+rgb(palette.from)+","+rgb(palette.to)+")"}}/>
     <span>{legendValue(domain.maximum)}</span><span className={styles.legendNoData}>■ χωρίς δημοσιεύσιμα δεδομένα</span>
    </div>
    {focused&&<div className={styles.regionFocus}><strong>{focused.label}</strong>
     <span>{showGeoValue(focused)}
       {!hasMetric&&focused.value!==undefined?" · "+Math.round(focused.value).toLocaleString("el-GR")+(internalCoverage?" QA απαντήσεις":" ενάρξεις"):""}
       {hasMetric&&focused.n!==undefined?" · n="+focused.n:""}
       {hasMetric&&nationalDiff(focused.value)!==undefined?" · Δ έναντι Ελλάδας "+formatDiff(nationalDiff(focused.value)):""}
      </span></div>}
   </div>
   <div className={styles.mapSide}>
    <label>Αναζήτηση {granularity==="prefecture"?"νομού":"Περιφέρειας"}<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={granularity==="prefecture"?"π.χ. Λακωνία":"π.χ. Πελοπόννησος"}/></label>
    <div className={styles.regionList}>
     <div className={styles.regionListHeader}><span>{granularity==="prefecture"?"Νομός":"Περιφέρεια"}</span><span>{hasMetric?"Επιλεγμένος δείκτης":"Μερίδιο ενάρξεων"}</span></div>
     {sorted.map(region=><button type="button" key={region.key} aria-pressed={selected===region.key}
       className={selected===region.key?styles.selectedRegion:styles.regionButton}
       onClick={()=>setSelected(s=>s===region.key?"":region.key)}>
      <span><i style={{background:region.value===undefined?"#d9dfd6":heat(region.value,domain,palette)}}/>{region.label}</span>
      <span className={styles.regionalNumbers}><strong>{showGeoValue(region)}</strong>
        {hasMetric&&region.value!==undefined&&<small>n={region.n??"—"} · Ελλάδα {formatDiff(nationalDiff(region.value))}</small>}
        {!hasMetric&&region.value!==undefined&&<small>{Math.round(region.value).toLocaleString("el-GR")} {internalCoverage?"QA απαντήσεις":"ενάρξεις"}</small>}
      </span>
     </button>)}
    </div>
   </div>
  </div>
  {hasMetric&&<p className={styles.note}>Το «Σύνολο Ελλάδας» προκύπτει μόνο από ξεχωριστή εγκεκριμένη πανελλαδική εκτίμηση, όχι από μέσο όρο των Περιφερειών. Τα ποσοστά ανά Περιφέρεια έχουν διαφορετικούς παρονομαστές και δεν αθροίζονται σε 100%.</p>}
  {hasMetric?<p className={styles.note}>
   Η επιλογή διαφορετικής ερώτησης ή απάντησης επαναχρωματίζει τον χάρτη, ενημερώνει
   την κλίμακα και αναταξινομεί τις Περιφέρειες από τον συγκεκριμένο δείκτη.
   Οι τιμές εμφανίζονται απευθείας πάνω στις διαθέσιμες γεωγραφικές ενότητες.
   Τα ποσοστά χρησιμοποιούν σταθερή κλίμακα 0–100%, οι βαθμολογίες την επιστημονική τους κλίμακα.
   {sector&&!hasApprovedCrossSections?" Δεν υπάρχει εγκεκριμένη περιφερειακή διασταύρωση για αυτόν τον κλάδο.":""}
   Στις Περιφέρειες εμφανίζονται εγκεκριμένες συγκεντρωτικές εκτιμήσεις με n≥30, στους νομούς μόνο πρόσθετα εγκεκριμένα στοιχεία με n≥50. Η προεπισκόπηση νομών χρησιμοποιεί αποκλειστικά τεχνητές τιμές.
   Δεν χρησιμοποιούνται ιστορικοί κωδικοί νομών ως Περιφέρειες.
   {available.length===0?" Δεν υπάρχουν ακόμη δημοσιεύσιμα περιφερειακά αποτελέσματα για αυτή την απάντηση.":""}
  </p>:<p className={styles.note}>
   Η συμμετοχή αποτυπώνει ενάρξεις ερωτηματολογίων και όχι απαντήσεις ή αποτελέσματα.
   Τα δεδομένα προέρχονται από δημοσίως διαθέσιμα γεωγραφικά συγκεντρωτικά στοιχεία, όχι από θέσεις συσκευών.
   {available.length===0?" Δεν διατίθενται προς το παρόν επαρκή δημοσιεύσιμα γεωγραφικά στοιχεία.":""}
  </p>}
  <p className={styles.note}>Τα όρια των 55 ιστορικών νομών απεικονίζονται χωριστά από τις 13 διοικητικές Περιφέρειες. Καμία περιφερειακή τιμή δεν επιμερίζεται τεχνητά στους νομούς. Οι περιοχές χωρίς εγκεκριμένα δεδομένα μένουν γκρίζες.
   Τα επιμέρους δεδομένα μικρών ομάδων δεν μεταφέρονται στον φυλλομετρητή.</p>
 </section>;
}
