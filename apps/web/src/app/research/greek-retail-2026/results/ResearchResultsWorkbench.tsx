"use client";

import { useMemo,useState } from "react";
import { PUBLIC_RESULTS_CHAPTERS,PUBLIC_RESULTS_METRICS,publicMetricLabel } from "../../../../lib/research-public-results-sections";
import { demoResultPoints,type SafeParticipationGeography,type SafePublicResultPoint } from "../../../../lib/research-public-results-data";
import { ResearchPublicationMap } from "./ResearchPublicationMap";
import styles from "./ResultsWorkbench.module.css";

type GroupBy="overall"|"sectorCode"|"sizeBand"|"regionCode";
type Menu="chapters"|"graphs"|"map";
type SortMode="high"|"low"|"label";
const options:ReadonlyArray<Readonly<{id:GroupBy;title:string}>>=[
 {id:"overall",title:"Σύνολο Ελλάδας"},
 {id:"sectorCode",title:"Κατά κλάδο"},
 {id:"sizeBand",title:"Κατά μέγεθος"},
 {id:"regionCode",title:"Γεωγραφική ομάδα"}
];
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
 ? sizeLabels[value]??value:key==="regionCode"?value:"Σύνολο";
const format=(point:SafePublicResultPoint)=>point.format==="proportion"
 ?new Intl.NumberFormat("el-GR",{style:"percent",maximumFractionDigits:1}).format(point.value)
 :new Intl.NumberFormat("el-GR",{maximumFractionDigits:1}).format(point.value);
const pct=(v:number)=>new Intl.NumberFormat("el-GR",{maximumFractionDigits:1}).format(v);
const matches=(p:SafePublicResultPoint,dimension:GroupBy,level:string)=>
 dimension==="overall"?Object.keys(p.segment).length===0:
 Object.keys(p.segment).length===1&&typeof p.segment[dimension]==="string"&&(!level||p.segment[dimension]===level);
function csvValue(s:string){return '"'+s.replaceAll('"','""').replace(/^[=+@-]/,"'\$&")+'"';}

export function ResearchResultsWorkbench({
 mode,points:publishedPoints=[],geography
}:{
 mode:"preview"|"published"|"unpublished";
 points?:readonly SafePublicResultPoint[];
 geography?:SafeParticipationGeography;
}){
 const demo=mode==="preview";
 const points=useMemo(()=>demo?demoResultPoints():publishedPoints,[demo,publishedPoints]);
 const [menu,setMenu]=useState<Menu>("chapters");
 const [chapterId,setChapterId]=useState(PUBLIC_RESULTS_CHAPTERS[0]!.id);
 const [subId,setSubId]=useState(PUBLIC_RESULTS_CHAPTERS[0]!.subchapters[0]!.id);
 const [group,setGroup]=useState<GroupBy>("overall");
 const [level,setLevel]=useState("");
 const [minN,setMinN]=useState(30);
 const [search,setSearch]=useState("");
 const [graphKey,setGraphKey]=useState("digital_readiness.mean");
 const [graphDimension,setGraphDimension]=useState<GroupBy>("sectorCode");
 const [graphKind,setGraphKind]=useState<"bars"|"dots"|"table">("bars");
 const [graphOrder,setGraphOrder]=useState<SortMode>("high");
 const chapter=PUBLIC_RESULTS_CHAPTERS.find(c=>c.id===chapterId)??PUBLIC_RESULTS_CHAPTERS[0]!;
 const sub=chapter.subchapters.find(s=>s.id===subId)??chapter.subchapters[0]!;
 const levels=useMemo(()=>[...new Set(points.flatMap(p=>typeof p.segment[group]==="string"?[p.segment[group]]:[]))].sort(),[points,group]);
 const activeMetricKeys=sub.metrics.filter(k=>publicMetricLabel(k).toLowerCase().includes(search.toLowerCase())||k.toLowerCase().includes(search.toLowerCase()));
 const chapterRows=activeMetricKeys.map(key=>points.find(p=>p.metricKey===key&&matches(p,group,level)&&p.n>=minN))
  .filter((p):p is SafePublicResultPoint=>Boolean(p));
 const graphRows=useMemo(()=>points.filter(p=>p.metricKey===graphKey&&matches(p,graphDimension,"")&&p.n>=minN).sort((a,b)=>
  graphOrder==="label"?groupLabel(a.segment[graphDimension]??"",graphDimension).localeCompare(groupLabel(b.segment[graphDimension]??"",graphDimension),"el"):
  graphOrder==="high"?b.value-a.value:a.value-b.value
 ).slice(0,40),[points,graphKey,graphDimension,graphOrder,minN]);
 const graphMaximum=graphRows.length?Math.max(...graphRows.map(r=>r.value),.0001):1;
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
  const a=document.createElement("a");a.href=url;a.download=demo?"research-demo-graph.csv":"greek-retail-2026-approved-graph.csv";a.click();URL.revokeObjectURL(url);
 };
 return <section id="research-workbench" className={styles.shell}>
  <header className={styles.heading}>
   <div><span className={styles.eyebrow}>KONTA MOY RESEARCH · INTERACTIVE EXPLORER</span>
    <h2>Εξερευνήστε την έρευνα σε βάθος.</h2>
    <p>18 υποενότητες, δυναμικά γραφήματα, συγκρίσεις εγκεκριμένων ομάδων και θερμικός χάρτης Ελλάδας.</p>
   </div>
   <span className={demo?styles.demoFlag:styles.dataFlag}>{demo?"DEMO · ΕΝΔΕΙΚΤΙΚΑ":mode==="published"?"ΕΓΚΕΚΡΙΜΕΝΗ ΕΚΔΟΣΗ":"ΑΝΑΜΟΝΗ ΑΠΟΤΕΛΕΣΜΑΤΩΝ"}</span>
  </header>
  <nav className={styles.menu} aria-label="Μενού αποτελεσμάτων">
   {([{id:"chapters",name:"Ερευνητικές ενότητες",icon:"01",detail:"6 κεφάλαια · 18 υποενότητες"},
      {id:"graphs",name:"Graph Explorer",icon:"02",detail:"Γραφήματα & πίνακες"},
      {id:"map",name:"Heatmap Ελλάδας",icon:"03",detail:"Διαδραστικός χάρτης"}] as const).map(tab=>
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
    <label>Επίπεδο ανάλυσης<select value={group} onChange={e=>{setGroup(e.target.value as GroupBy);setLevel("");}}>
     {options.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}
    </select></label>
    {group!=="overall"&&<label>Επιλογή ομάδας<select value={level} onChange={e=>setLevel(e.target.value)}>
     <option value="">Επιλέξτε ομάδα</option>{levels.map(v=><option key={v} value={v}>{groupLabel(v,group)}</option>)}
    </select></label>}
    <label>Ελάχιστη βάση n<select value={minN} onChange={e=>setMinN(Number(e.target.value))}>
     <option value="30">30</option><option value="50">50</option><option value="100">100</option><option value="200">200</option>
    </select></label>
    <label>Αναζήτηση δείκτη<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="π.χ. κόστος"/></label>
   </div>
   {group!=="overall"&&!level&&<p className={styles.info}>Επιλέξτε μία συγκεκριμένη ομάδα για να εμφανιστούν οι εγκεκριμένοι αριθμοί της. Συνδυασμός κλάδου και μεγέθους δεν υπολογίζεται από ανεξάρτητα περιθώρια.</p>}
   <div className={styles.metricGrid}>
    {chapterRows.length>0&& (group==="overall"||level)?chapterRows.map(p=><article key={p.metricKey} className={styles.metricCard}>
     <span>{publicMetricLabel(p.metricKey)}</span><strong>{format(p)}</strong>
     <small>n = {p.n.toLocaleString("el-GR")}</small>
     <small>{p.ciLower!==null&&p.ciUpper!==null?
      "95% ΔΕ: "+(p.format==="proportion"?pct(p.ciLower*100)+"–"+pct(p.ciUpper*100)+"%":pct(p.ciLower)+"–"+pct(p.ciUpper)):
      "Διάστημα αβεβαιότητας μη διαθέσιμο"}</small>
    </article>):<p role="status" className={styles.empty}>Δεν υπάρχουν δημοσιεύσιμες εκτιμήσεις με τα επιλεγμένα φίλτρα. Η απουσία τιμής δεν σημαίνει μηδενικό αποτέλεσμα.</p>}
   </div>
   <div className={styles.analysisGrid}>
    <article><span className={styles.articleTag}>ΠΡΟΤΕΙΝΟΜΕΝΗ ΔΙΑΣΤΑΥΡΩΣΗ</span><h4>{sub.relation}</h4>
      <p>Η σχέση απαιτεί κοινή βάση ερωτώμενων και ξεχωριστό επιστημονικό υπολογισμό. Δεν μπορεί να εξαχθεί από δύο ανεξάρτητα ποσοστά.</p>
      <button type="button" onClick={()=>{setMenu("graphs");setGraphKey(sub.metrics[0]??"digital_readiness.mean");}}>
       Προβολή σχετικών αριθμών <span aria-hidden="true">↗</span>
      </button>
    </article>
    <article><span className={styles.articleTag}>ΕΠΙΣΤΗΜΟΝΙΚΗ ΑΝΑΓΝΩΣΗ</span><h4>Τι μπορεί να συμπεράνει ο αναγνώστης;</h4>
      <p>{sub.interpretation}</p><p>Οποιεσδήποτε διαφορές παρουσιάζονται περιγραφικά· η στατιστική σημαντικότητα δηλώνεται μόνο εφόσον έχει τεκμηριωθεί.</p>
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
    <label>Ομαδοποίηση<select value={graphDimension} onChange={e=>setGraphDimension(e.target.value as GroupBy)}>
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
   <div className={styles.graphSummary}><strong>{publicMetricLabel(graphKey)}</strong><span>{graphRows.length} διαθέσιμες ομάδες</span>
    <button type="button" onClick={exportData} disabled={graphRows.length===0}>Εξαγωγή συγκεντρωτικών CSV ↓</button>
   </div>
   {graphRows.length===0?<div className={styles.empty} role="status">Δεν υπάρχουν εγκεκριμένοι συγκεντρωτικοί αριθμοί με αυτά τα φίλτρα.</div>:
    graphKind==="table"?<div className={styles.tableScroll}><table className={styles.table}>
      <thead><tr><th>Ομάδα</th><th>Εκτίμηση</th><th>n</th><th>95% ΔΕ</th></tr></thead>
      <tbody>{graphRows.map((p,i)=><tr key={i}><td>{groupLabel(p.segment[graphDimension]??"",graphDimension)}</td>
       <td>{format(p)}</td><td>{p.n.toLocaleString("el-GR")}</td>
       <td>{p.ciLower!==null&&p.ciUpper!==null?pct(p.ciLower)+" – "+pct(p.ciUpper):"—"}</td></tr>)}</tbody></table></div>:
    <div className={styles.graphChart} role="img" aria-label={"Γράφημα: "+publicMetricLabel(graphKey)}>
     {graphRows.map((p,i)=><div className={styles.graphRow} key={i}>
      <span>{groupLabel(p.segment[graphDimension]??"",graphDimension)}</span>
      <div className={styles.graphTrack}>
       {graphKind==="dots"?<i className={styles.graphDot} style={{left:Math.min(98,p.value/graphMaximum*98)+"%"}}/>:
        <i className={styles.graphBar} style={{width:Math.min(100,p.value/graphMaximum*100)+"%"}}/>}
      </div><strong>{format(p)}</strong><small>n={p.n}</small>
     </div>)}
    </div>}
   <p className={styles.note}>Περιγραφικό γράφημα από δημοσιευμένα αποτελέσματα. Η επιλογή ομάδας δεν ανασυνθέτει διασταυρώσεις που δεν έχουν εκτιμηθεί. Στοιχεία με ανεπαρκή βάση δεν αποστέλλονται στο UI.</p>
  </section>}
  {menu==="map"&&<section className={styles.mapSection}>
   <div className={styles.graphHeading}><span className={styles.eyebrow}>ΓΕΩΓΡΑΦΙΚΟ ΠΑΡΑΤΗΡΗΤΗΡΙΟ</span>
    <h3>Heatmap Ελλάδας</h3><p>Εξερευνήστε τη χωρική κάλυψη ή επιλέξτε διαθέσιμους εγκεκριμένους περιφερειακούς δείκτες. Με το ίδιο γεωγραφικό υπόβαθρο της έρευνας.</p></div>
   <ResearchPublicationMap points={points} geography={geography} isDemo={demo}/>
  </section>}
  <footer className={styles.scientificFooter}>
   Η τελική έκδοση προβάλλει μόνο ελεγμένες συγκεντρωτικές εκτιμήσεις (ελάχιστο n 30).
   Η πιλοτική προεπισκόπηση χρησιμοποιεί αποκλειστικά κατασκευασμένα παραδείγματα.
   Το ιδιωτικό πείραμα επιλογής πλατφόρμας δεν περιλαμβάνεται στο δημόσιο υλικό.
  </footer>
 </section>;
}
