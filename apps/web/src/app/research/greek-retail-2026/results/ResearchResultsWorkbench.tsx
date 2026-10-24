"use client";

import { useMemo,useState } from "react";
import Link from "next/link";
import { PUBLIC_RESULTS_CHAPTERS,PUBLIC_RESULTS_METRICS,publicMetricLabel } from "../../../../lib/research-public-results-sections";
import { demoResultPoints,type SafeParticipationGeography,type SafePublicResultPoint } from "../../../../lib/research-public-results-data";
import { ResearchPublicationMap } from "./ResearchPublicationMap";
import { ResearchVoiceOfGreece } from "./ResearchVoiceOfGreece";
import type { PublicVoiceData } from "../../../../lib/research-public-voices-data";
import { GREECE_REGIONS } from "../../../../lib/research-geographic-core";
import { GREECE_PREFECTURES } from "../../../../lib/research-prefectures";
import styles from "./ResultsWorkbench.module.css";

type GroupBy="overall"|"sectorCode"|"sizeBand"|"regionCode"|"prefectureCode";
type Menu="chapters"|"graphs"|"map"|"voices";
type SortMode="high"|"low"|"label";
const options:ReadonlyArray<Readonly<{id:GroupBy;title:string}>>=[
 {id:"overall",title:"Σύνολο Ελλάδας"},
 {id:"sectorCode",title:"Κατά κλάδο"},
 {id:"sizeBand",title:"Κατά μέγεθος"},
 {id:"regionCode",title:"Περιφέρειες"},
 {id:"prefectureCode",title:"Νομοί"}
];
const regionLabels:Record<string,string>=Object.fromEntries(GREECE_REGIONS.map(r=>[r.key,r.label]));
const prefectureLabels:Record<string,string>=Object.fromEntries(GREECE_PREFECTURES.map(r=>[r.key,r.label]));
const sectorLabels:Record<string,string>={
 food_groceries:"Τρόφιμα & παντοπωλεία",fashion_footwear:"Ένδυση & υπόδηση",
 home_living:"Σπίτι & είδη οικιακής χρήσης",retail_intermediation:"Εμπορικοί διαμεσολαβητές",
 health_beauty:"Υγεία & ομορφιά"
};
const sizeLabels:Record<string,string>={"1":"1 εργαζόμενος","2_4":"2–4 εργαζόμενοι",
 "5_9":"5–9 εργαζόμενοι","10_19":"10–19 εργαζόμενοι",
 "20_49":"20–49 εργαζόμενοι","50_plus":"50+ εργαζόμενοι"};
const groupLabel=(value:string,key:GroupBy)=>key==="sectorCode"
 ? sectorLabels[value]??value.replaceAll("_"," "):key==="sizeBand"
 ? sizeLabels[value]??value:key==="regionCode"?(regionLabels[value]??value):key==="prefectureCode"?(prefectureLabels[value]??value):"Σύνολο";
const format=(point:SafePublicResultPoint)=>point.format==="proportion"
 ?new Intl.NumberFormat("el-GR",{style:"percent",maximumFractionDigits:1}).format(point.value)
 :new Intl.NumberFormat("el-GR",{maximumFractionDigits:1}).format(point.value);
const pct=(v:number)=>new Intl.NumberFormat("el-GR",{maximumFractionDigits:1}).format(v);
const matches=(p:SafePublicResultPoint,dimension:GroupBy,level:string)=>
 dimension==="overall"?Object.keys(p.segment).length===0:
 Object.keys(p.segment).length===1&&typeof p.segment[dimension]==="string"&&(!level||p.segment[dimension]===level);
function csvValue(s:string){const safe=/^[=+@\\-\\t\\r]/.test(s)?"'"+s:s;return '"'+safe.replaceAll('"','""')+'"';}

export function ResearchResultsWorkbench({
 mode,points:publishedPoints=[],geography,voices
}:{
 mode:"preview"|"live"|"published"|"unpublished";
 points?:readonly SafePublicResultPoint[];
 geography?:SafeParticipationGeography;
 voices?:PublicVoiceData;
}){
 const demo=mode==="preview";
 const points=useMemo(()=>demo?demoResultPoints():publishedPoints,[demo,publishedPoints]);
 const [menu,setMenu]=useState<Menu>("chapters");
 const [chapterId,setChapterId]=useState(PUBLIC_RESULTS_CHAPTERS[0]!.id);
 const [subId,setSubId]=useState(PUBLIC_RESULTS_CHAPTERS[0]!.subchapters[0]!.id);
 const [group,setGroup]=useState<GroupBy>("overall");
 const [level,setLevel]=useState("");
 const [compareTo,setCompareTo]=useState("");
 const [crossSector,setCrossSector]=useState("");
 const [crossRegion,setCrossRegion]=useState("");
 const [crossRegionB,setCrossRegionB]=useState("");
 const [crossGeography,setCrossGeography]=useState<"regionCode"|"prefectureCode">("regionCode");
 const [minN,setMinN]=useState(30);
 const [search,setSearch]=useState("");
 const [graphKey,setGraphKey]=useState("digital_readiness.mean");
 const [graphDimension,setGraphDimension]=useState<GroupBy>("sectorCode");
 const [graphCompareA,setGraphCompareA]=useState("");
 const [graphCompareB,setGraphCompareB]=useState("");
 const [graphKind,setGraphKind]=useState<"bars"|"dots"|"table">("bars");
 const [graphOrder,setGraphOrder]=useState<SortMode>("high");
 const chapter=PUBLIC_RESULTS_CHAPTERS.find(c=>c.id===chapterId)??PUBLIC_RESULTS_CHAPTERS[0]!;
 const sub=chapter.subchapters.find(s=>s.id===subId)??chapter.subchapters[0]!;
 const levels=useMemo(()=>[...new Set(points.flatMap(p=>typeof p.segment[group]==="string"?[p.segment[group]]:[]))].sort(),[points,group]);
 const sectorValues=useMemo(()=>[...new Set(points.flatMap(p=>p.segment.sectorCode?[p.segment.sectorCode]:[]))].sort(),[points]);
 const regionValues=useMemo(()=>GREECE_REGIONS.filter(r=>points.some(p=>p.segment.regionCode===r.key)).map(r=>r.key),[points]);
 const prefectureValues=useMemo(()=>GREECE_PREFECTURES.filter(r=>points.some(p=>p.segment.prefectureCode===r.key)).map(r=>r.key),[points]);
 const areas=crossGeography==="prefectureCode"?prefectureValues:regionValues;
 const activeMetricKeys=sub.metrics.filter(k=>publicMetricLabel(k).toLowerCase().includes(search.toLowerCase())||k.toLowerCase().includes(search.toLowerCase()));
 const chapterRows=activeMetricKeys.map(key=>points.find(p=>p.metricKey===key&&matches(p,group,level)&&p.n>=minN))
  .filter((p):p is SafePublicResultPoint=>Boolean(p));
 const graphRows=useMemo(()=>points.filter(p=>p.metricKey===graphKey&&matches(p,graphDimension,"")&&p.n>=minN).sort((a,b)=>
  graphOrder==="label"?groupLabel(a.segment[graphDimension]??"",graphDimension).localeCompare(groupLabel(b.segment[graphDimension]??"",graphDimension),"el"):
  graphOrder==="high"?b.value-a.value:a.value-b.value
 ).slice(0,40),[points,graphKey,graphDimension,graphOrder,minN]);
 const graphMaximum=graphRows.length?Math.max(...graphRows.map(r=>r.value),.0001):1;
 const comparable=group!=="overall"&&Boolean(level)&&Boolean(compareTo)&&level!==compareTo;
 const comparison=activeMetricKeys.flatMap(key=>{
  if(!comparable)return [];
  const left=points.find(p=>p.metricKey===key&&matches(p,group,level)&&p.n>=minN);
  const right=points.find(p=>p.metricKey===key&&matches(p,group,compareTo)&&p.n>=minN);
  return left&&right&&left.format===right.format?[{key,left,right}]:[];
 });
 const crossRows=activeMetricKeys.flatMap(key=>{
  if(!crossSector||!crossRegion)return [];
  const find=(region:string)=>points.find(p=>p.metricKey===key&&p.n>=Math.max(50,minN)&&
   p.segment[crossGeography]===region&&p.segment.sectorCode===crossSector);
  const left=find(crossRegion),right=crossRegionB?find(crossRegionB):undefined;
  return left?[{key,left,right}]:[];
 });
 const graphLevels=graphRows.map(row=>row.segment[graphDimension]??"");
 const graphLeft=graphRows.find(row=>graphCompareA&&row.segment[graphDimension]===graphCompareA);
 const graphRight=graphRows.find(row=>graphCompareB&&row.segment[graphDimension]===graphCompareB);
 const difference=(a:SafePublicResultPoint,b:SafePublicResultPoint)=>a.format==="proportion"
  ?pct((a.value-b.value)*100)+" ποσοστιαίες μονάδες":pct(a.value-b.value)+" μονάδες";
 const switchChapter=(id:string)=>{
  const next=PUBLIC_RESULTS_CHAPTERS.find(c=>c.id===id);
  if(!next)return;
  setChapterId(id);setSubId(next.subchapters[0]!.id);setSearch("");
 };
 const exportData=()=>{
  const lines=[["Θέμα","Ομάδα","Τιμή","Μη σταθμισμένο n","95% κάτω όριο","95% άνω όριο"].map(csvValue).join(";")];
  for(const p of graphRows) lines.push([publicMetricLabel(p.metricKey),groupLabel(p.segment[graphDimension]??"",graphDimension),
   String(p.value),String(p.n),p.ciLower===null?"":String(p.ciLower),p.ciUpper===null?"":String(p.ciUpper)].map(csvValue).join(";"));
  const blob=new Blob(["\uFEFF"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=demo?"research-demo-graph.csv":mode==="live"?"greek-retail-2026-live-preview.csv":"greek-retail-2026-approved-graph.csv";a.click();URL.revokeObjectURL(url);
 };
 return <section id="research-workbench" className={styles.shell}>
  <header className={styles.heading}>
   <div><span className={styles.eyebrow}>KONTA MOY RESEARCH · INTERACTIVE EXPLORER</span>
    <h2>Εξερευνήστε την έρευνα σε βάθος.</h2>
    <p>18 υποενότητες, δείκτες με τεκμηρίωση, αντιπαραβολή κλάδων και περιοχών, χάρτης και θεματικές φωνές της αγοράς.</p>
   </div>
   <span className={demo?styles.demoFlag:styles.dataFlag}>{demo?"DEMO · ΕΝΔΕΙΚΤΙΚΑ":mode==="live"?"LIVE · ΠΡΟΚΑΤΑΡΚΤΙΚΑ":mode==="published"?"ΕΓΚΕΚΡΙΜΕΝΗ ΕΚΔΟΣΗ":"ΑΝΑΜΟΝΗ ΑΠΟΤΕΛΕΣΜΑΤΩΝ"}</span>
  </header>
  <nav className={styles.menu} aria-label="Μενού αποτελεσμάτων">
   {([{id:"chapters",name:"Ερευνητικές ενότητες",icon:"01",detail:"6 κεφάλαια · 18 υποενότητες"},
      {id:"graphs",name:"Graph Explorer",icon:"02",detail:"Γραφήματα & πίνακες"},
      {id:"map",name:"Heatmap Ελλάδας",icon:"03",detail:"Διαδραστικός χάρτης"},
      {id:"voices",name:"Η φωνή της Ελλάδας",icon:"04",detail:"Q18 · Θεματικές & μαρτυρίες"}] as const).map(tab=>
    <button key={tab.id} type="button" aria-current={menu===tab.id?"page":undefined}
     aria-pressed={menu===tab.id} onClick={()=>setMenu(tab.id)}
     className={menu===tab.id?styles.menuActive:styles.menuButton}>
      <b>{tab.icon}</b><span><strong>{tab.name}</strong><small>{tab.detail}</small></span>
    </button>)}
  </nav>
  {demo&&<div className={styles.warning}><strong>ΔΕΔΟΜΕΝΑ ΕΠΙΔΕΙΞΗΣ.</strong> Όλοι οι αριθμοί, οι συσχετισμοί και οι γεωγραφικές κατανομές παρακάτω είναι αποκλειστικά παραδείγματα σχεδίασης και όχι στοιχεία της έρευνας.</div>}
  {menu==="chapters"&&<>
   <div className={styles.chapterGrid} role="group" aria-label="Επιλογή κεφαλαίου">
    {PUBLIC_RESULTS_CHAPTERS.map(c=><button type="button" key={c.id} onClick={()=>switchChapter(c.id)}
      aria-pressed={c.id===chapter.id} className={c.id===chapter.id?styles.chapterActive:styles.chapterButton}>
      <span>{c.number}</span><strong>{c.name}</strong>
    </button>)}
   </div>
   <div className={styles.chapterIntro}><span>ΚΕΦΑΛΑΙΟ {chapter.number} / 06</span><h3>{chapter.name}</h3><p>{chapter.subtitle}</p></div>
   <div className={styles.subchapterMenu} role="group" aria-label="Υποενότητες του κεφαλαίου">
    {chapter.subchapters.map((s,i)=><button type="button" key={s.id} aria-pressed={s.id===sub.id}
      onClick={()=>{setSubId(s.id);setSearch("");}} className={s.id===sub.id?styles.subActive:styles.subButton}>
      <span>{chapter.number}.{i+1}</span>{s.title}
    </button>)}
   </div>
   <div className={styles.subHeading}><div><h4>{sub.title}</h4><span>Ερωτήσεις {sub.questionCodes.join(" · ")}</span></div></div>
   <div className={styles.filters}>
    <label>Επίπεδο ανάλυσης<select value={group} onChange={e=>{setGroup(e.target.value as GroupBy);setLevel("");setCompareTo("");}}>
     {options.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}
    </select></label>
    {group!=="overall"&&<label>1η ομάδα / φίλτρο<select value={level} onChange={e=>setLevel(e.target.value)}>
     <option value="">Επιλέξτε ομάδα</option>{levels.map(v=><option key={v} value={v}>{groupLabel(v,group)}</option>)}
    </select></label>}
    {group!=="overall"&&<label>2η ομάδα / σύγκριση<select value={compareTo} onChange={e=>setCompareTo(e.target.value)}>
     <option value="">Χωρίς σύγκριση</option>{levels.filter(v=>v!==level).map(v=><option key={v} value={v}>{groupLabel(v,group)}</option>)}
    </select></label>}
    <label>Ελάχιστη βάση n<select value={minN} onChange={e=>setMinN(Number(e.target.value))}>
     <option value="30">30</option><option value="50">50</option><option value="100">100</option><option value="200">200</option>
    </select></label>
    <label>Αναζήτηση δείκτη<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="π.χ. κόστος"/></label>
   </div>
   {group!=="overall"&&!level&&<p className={styles.info}>Επιλέξτε κλάδο, γεωγραφική περιοχή ή μέγεθος και προαιρετικά δεύτερη ομάδα για άμεση σύγκριση. Οι ταυτόχρονες τομές κλάδου × νομού θα διατίθενται μόνο εφόσον υπάρχει ξεχωριστή ελεγμένη και δημοσιεύσιμη εκτίμηση, όχι με συνδυασμό ανεξάρτητων ποσοστών.</p>}
   <div className={styles.metricGrid}>
    {chapterRows.length>0&& (group==="overall"||level)?chapterRows.map(p=><article key={p.metricKey} className={styles.metricCard}>
     <span>{publicMetricLabel(p.metricKey)}</span><strong>{format(p)}</strong>
     <small>n = {p.n.toLocaleString("el-GR")}</small>
     <small>{p.ciLower!==null&&p.ciUpper!==null?
      "95% ΔΕ: "+(p.format==="proportion"?pct(p.ciLower*100)+"–"+pct(p.ciUpper*100)+"%":pct(p.ciLower)+"–"+pct(p.ciUpper)):
      "Διάστημα αβεβαιότητας μη διαθέσιμο"}</small>
    </article>):<p role="status" className={styles.empty}>Δεν υπάρχουν δημοσιεύσιμες εκτιμήσεις με τα επιλεγμένα φίλτρα. Η απουσία τιμής δεν σημαίνει μηδενικό αποτέλεσμα.</p>}
   </div>
   {comparable&&<section className={styles.comparePanel} aria-label="Σύγκριση δύο ομάδων">
    <div className={styles.graphHeading}><h3>Σύγκριση ομάδων</h3><p>{groupLabel(level,group)} έναντι {groupLabel(compareTo,group)} · Ίδιος δείκτης και ίδια μονάδα μέτρησης.</p></div>
    {comparison.length?<div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Δείκτης</th><th>{groupLabel(level,group)}</th><th>{groupLabel(compareTo,group)}</th><th>Διαφορά Α − Β</th></tr></thead><tbody>
     {comparison.map(({key,left,right})=><tr key={key}><td>{publicMetricLabel(key)}</td><td>{format(left)} · n={left.n}</td><td>{format(right)} · n={right.n}</td><td>{difference(left,right)}</td></tr>)}
    </tbody></table></div>:<p className={styles.empty}>Δεν υπάρχουν επαρκή, εγκεκριμένα κοινώς συγκρίσιμα στοιχεία για αυτό το ζεύγος.</p>}
    <p className={styles.note}>Οι διαφορές είναι περιγραφικές, όχι αυτόματες δοκιμές σημαντικότητας. Δεν υπολογίζονται συσχετίσεις ή κοινές διασταυρώσεις από περιθωριακά αποτελέσματα.</p>
   </section>}
   <section className={styles.crossFilterPanel} aria-label="Διασταύρωση κλάδου και περιοχής">
    <div className={styles.graphHeading}><h3>Κλάδος × γεωγραφία</h3><p>Εξειδικευμένη ανάλυση του ίδιου δείκτη ανά κλάδο και περιφέρεια, μόνο όταν η συγκεκριμένη διασταύρωση έχει εγκριθεί ανεξάρτητα.</p></div>
    <div className={styles.filters}>
     <label>Γεωγραφική μονάδα<select value={crossGeography} onChange={e=>{setCrossGeography(e.target.value as typeof crossGeography);setCrossRegion("");setCrossRegionB("");}}><option value="regionCode">Περιφέρεια</option><option value="prefectureCode">Νομός</option></select></label>
     <label>Κλάδος<select value={crossSector} onChange={e=>setCrossSector(e.target.value)}><option value="">Επιλέξτε κλάδο</option>{sectorValues.map(v=><option key={v} value={v}>{groupLabel(v,"sectorCode")}</option>)}</select></label>
     <label>Περιοχή Α<select value={crossRegion} onChange={e=>setCrossRegion(e.target.value)}><option value="">Επιλέξτε περιοχή</option>{areas.map(v=><option key={v} value={v}>{groupLabel(v,crossGeography)}</option>)}</select></label>
     <label>Περιοχή Β (σύγκριση)<select value={crossRegionB} onChange={e=>setCrossRegionB(e.target.value)}><option value="">Καμία</option>{areas.filter(v=>v!==crossRegion).map(v=><option key={v} value={v}>{groupLabel(v,crossGeography)}</option>)}</select></label>
    </div>
    {crossSector&&crossRegion&&(crossRows.length?<div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Δείκτης</th><th>{groupLabel(crossRegion,crossGeography)}</th><th>{crossRegionB?groupLabel(crossRegionB,crossGeography):"Βάση"}</th><th>Διαφορά</th></tr></thead><tbody>
     {crossRows.map(({key,left,right})=><tr key={key}><td>{publicMetricLabel(key)}</td><td>{format(left)} · n={left.n}</td><td>{right?format(right)+" · n="+right.n:"n="+left.n}</td><td>{right&&right.format===left.format?difference(left,right):"—"}</td></tr>)}
    </tbody></table></div>:<p className={styles.empty}>Δεν υπάρχει εγκεκριμένη εκτίμηση για τον επιλεγμένο συνδυασμό. Δεν ανασυνθέτουμε κλαδικές και γεωγραφικές τομές από ανεξάρτητα ποσοστά.</p>)}
    <p className={styles.note}>Για δημοσίευση διπλής διασταύρωσης απαιτούνται ρητή επιστημονική έγκριση και n≥50 σε κάθε εμφανιζόμενο κελί· τυχόν μικρές ομάδες παραμένουν απόρρητες.</p>
   </section>
   <div className={styles.analysisGrid}>
    <article><span className={styles.articleTag}>ΠΡΟΤΕΙΝΟΜΕΝΗ ΔΙΑΣΤΑΥΡΩΣΗ</span><h4>{sub.relation}</h4>
      <p>Η σχέση απαιτεί κοινή βάση ερωτώμενων και ξεχωριστό επιστημονικό υπολογισμό. Δεν μπορεί να εξαχθεί από δύο ανεξάρτητα ποσοστά.</p>
      <button type="button" onClick={()=>{setMenu("graphs");setGraphKey(sub.metrics[0]??"digital_readiness.mean");}}>
       Προβολή σχετικών αριθμών <span aria-hidden="true">↗</span>
      </button>
    </article>
    <article><span className={styles.articleTag}>ΕΠΙΣΤΗΜΟΝΙΚΗ ΑΝΑΓΝΩΣΗ</span><h4>Τι μπορεί να συμπεράνει ο αναγνώστης;</h4>
      <p>{sub.interpretation}</p><p>Διαθεσιμότητα: {chapterRows.length} / {activeMetricKeys.length} δείκτες στην επιλεγμένη ομάδα, με βάση τουλάχιστον n={minN}. Κάθε μέγεθος δείγματος και 95% ΔΕ εξετάζεται χωριστά.</p><p>Οι διαφορές παρουσιάζονται περιγραφικά· η στατιστική σημαντικότητα απαιτεί ξεχωριστό έλεγχο και όχι απλή επικάλυψη διαστημάτων.</p>
    </article>
   </div>
  </>}
  {menu==="graphs"&&<section className={styles.graphPane} aria-labelledby="graph-explorer-heading">
   <div className={styles.graphHeading}><span className={styles.eyebrow}>ΕΥΕΛΙΚΤΗ ΟΠΤΙΚΟΠΟΙΗΣΗ</span>
    <h3 id="graph-explorer-heading">Graph Explorer</h3>
    <p>Δείτε έναν εγκεκριμένο δείκτη ανά διαθέσιμη ομάδα. Οι διαφορετικές κλίμακες δεν αναμειγνύονται στο ίδιο γράφημα.</p>
   </div>
   <div className={styles.filters}>
    <label>Δείκτης<select value={graphKey} onChange={e=>setGraphKey(e.target.value)}>
     {PUBLIC_RESULTS_METRICS.map(k=><option key={k} value={k}>{publicMetricLabel(k)}</option>)}
    </select></label>
    <label>Ομαδοποίηση<select value={graphDimension} onChange={e=>{setGraphDimension(e.target.value as GroupBy);setGraphCompareA("");setGraphCompareB("");}}>
     {options.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}
    </select></label>
    <label>Ταξινόμηση<select value={graphOrder} onChange={e=>setGraphOrder(e.target.value as SortMode)}>
     <option value="high">Υψηλότερα πρώτα</option><option value="low">Χαμηλότερα πρώτα</option><option value="label">Αλφαβητικά</option>
    </select></label>
    <label>Απεικόνιση<select value={graphKind} onChange={e=>setGraphKind(e.target.value as typeof graphKind)}>
     <option value="bars">Οριζόντιες μπάρες</option><option value="dots">Γράφημα κουκκίδων</option><option value="table">Πίνακας δεδομένων</option>
    </select></label>
    <label>Ελάχιστο n<select value={minN} onChange={e=>setMinN(Number(e.target.value))}>
     {[30,50,100,200].map(n=><option key={n} value={n}>{n}</option>)}
    </select></label>
   </div>
   <div className={styles.filters}><label>Εστίαση Α<select value={graphCompareA} onChange={e=>setGraphCompareA(e.target.value)}><option value="">Όλες οι ομάδες</option>{graphLevels.map(v=><option key={v} value={v}>{groupLabel(v,graphDimension)}</option>)}</select></label><label>Εστίαση Β<select value={graphCompareB} onChange={e=>setGraphCompareB(e.target.value)}><option value="">Καμία</option>{graphLevels.filter(v=>v!==graphCompareA).map(v=><option key={v} value={v}>{groupLabel(v,graphDimension)}</option>)}</select></label></div>
   {graphLeft&&graphRight&&graphLeft!==graphRight&&<p className={styles.compareInsight}>Α: <strong>{format(graphLeft)}</strong> (n={graphLeft.n}) · Β: <strong>{format(graphRight)}</strong> (n={graphRight.n}) · Διαφορά Α − Β: <strong>{difference(graphLeft,graphRight)}</strong></p>}
   <div className={styles.graphSummary}><strong>{publicMetricLabel(graphKey)}</strong><span>{graphRows.length} διαθέσιμες ομάδες</span>
    <button type="button" onClick={exportData} disabled={graphRows.length===0}>Εξαγωγή συγκεντρωτικών CSV ↓</button>
   </div>
   {graphRows.length===0?<div className={styles.empty} role="status">Δεν υπάρχουν εγκεκριμένοι συγκεντρωτικοί αριθμοί με αυτά τα φίλτρα.</div>:
    graphKind==="table"?<div className={styles.tableScroll}><table className={styles.table}>
      <thead><tr><th>Ομάδα</th><th>Εκτίμηση</th><th>n</th><th>95% ΔΕ</th></tr></thead>
      <tbody>{graphRows.map((p,i)=><tr key={i}><td>{groupLabel(p.segment[graphDimension]??"",graphDimension)}</td>
       <td>{format(p)}</td><td>{p.n.toLocaleString("el-GR")}</td>
       <td>{p.ciLower!==null&&p.ciUpper!==null?
        p.format==="proportion"?pct(p.ciLower*100)+"% – "+pct(p.ciUpper*100)+"%":
          pct(p.ciLower)+" – "+pct(p.ciUpper):"—"}</td></tr>)}</tbody></table></div>:
    <div className={styles.graphChart} role="img" aria-label={"Γράφημα: "+publicMetricLabel(graphKey)}>
     {graphRows.filter(p=>!graphCompareA&&!graphCompareB||p.segment[graphDimension]===graphCompareA||p.segment[graphDimension]===graphCompareB).map((p,i)=><div className={styles.graphRow} key={i}>
      <span>{groupLabel(p.segment[graphDimension]??"",graphDimension)}</span>
      <div className={styles.graphTrack}>
       {graphKind==="dots"?<i className={styles.graphDot} style={{left:Math.min(98,p.value/graphMaximum*98)+"%"}}/>:
        <i className={styles.graphBar} style={{width:Math.min(100,p.value/graphMaximum*100)+"%"}}/>}
      </div><strong>{format(p)}</strong><small>n={p.n}</small>
     </div>)}
    </div>}
   <p className={styles.note}>{mode==="live"?"Προκαταρκτικό, μη σταθμισμένο γράφημα πραγματικών απαντήσεων.":"Περιγραφικό γράφημα από δημοσιευμένα αποτελέσματα."} Η επιλογή ομάδας δεν ανασυνθέτει διασταυρώσεις που δεν έχουν εκτιμηθεί. Στοιχεία με ανεπαρκή βάση δεν αποστέλλονται στο UI.</p>
  </section>}
  {menu==="map"&&<section className={styles.mapSection}>
   <div className={styles.graphHeading}><span className={styles.eyebrow}>ΓΕΩΓΡΑΦΙΚΟ ΠΑΡΑΤΗΡΗΤΗΡΙΟ</span>
    <h3>Heatmap Ελλάδας</h3><p>Εξερευνήστε τη χωρική κάλυψη ή επιλέξτε διαθέσιμους εγκεκριμένους περιφερειακούς δείκτες. Με το ίδιο γεωγραφικό υπόβαθρο της έρευνας.</p></div>
   <ResearchPublicationMap points={points} geography={geography} isDemo={demo}/>
  </section>}
  {menu==="voices"&&(mode==="live"
    ? <section className={styles.voiceOpenLink} aria-label="Η φωνή της Ελλάδας — ζωντανή εσωτερική προεπισκόπηση">
      <p>Οι πραγματικές απαντήσεις Q18 εμφανίζονται μόνο στη χωριστή, προστατευμένη εσωτερική σελίδα.</p>
      <Link href="/research/greek-retail-2026/results/Preview/voices">Άνοιγμα ζωντανής «Φωνής της Ελλάδας» ↗</Link>
     </section>
    : <><div className={styles.voiceOpenLink}><Link href={demo?"/research/greek-retail-2026/results/Preview/voices":"/research/greek-retail-2026/results/voices"}>Άνοιγμα της «Φωνής της Ελλάδας» σε ξεχωριστή πλήρη σελίδα ↗</Link></div><ResearchVoiceOfGreece isDemo={demo} data={voices}/></>)}
  <footer className={styles.scientificFooter}>
   Η τελική έκδοση προβάλλει μόνο ελεγμένες συγκεντρωτικές εκτιμήσεις (ελάχιστο n 30).
   {mode==="live"?" Αυτή η εσωτερική προεπισκόπηση χρησιμοποιεί πραγματικές απαντήσεις, χωρίς τελική στάθμιση ή επιστημονικά διαστήματα εμπιστοσύνης.":" Η πιλοτική προεπισκόπηση χρησιμοποιεί αποκλειστικά κατασκευασμένα παραδείγματα."}
   Το ιδιωτικό πείραμα επιλογής πλατφόρμας δεν περιλαμβάνεται στο δημόσιο υλικό.
  </footer>
 </section>;
}
