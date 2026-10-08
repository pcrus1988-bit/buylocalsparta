"use client";

import { useMemo, useRef, useState } from "react";
import {
  EXTERNAL_GROUPS, EXTERNAL_STUDIES, externalChange, externalCsv, externalCsvCell,
  type ExternalGroup, type ExternalPoint, type ExternalSeries
} from "../lib/research-external-analysis";
import styles from "./ResearchExternalAnalysis.module.css";

const COLORS = ["#2e6351", "#bf7d3b", "#3b7299", "#a14d5c", "#7b6a9b", "#879553"];
const MONTHS = ["Ιαν","Φεβ","Μαρ","Απρ","Μάι","Ιουν","Ιουλ","Αυγ","Σεπ","Οκτ","Νοε","Δεκ"];
const locale = new Intl.NumberFormat("el-GR",{maximumFractionDigits:2});
type ChartLine = { id: string; label: string; points: ExternalPoint[]; color: string };
type ParsedCsv = { lines: ExternalSeries[]; unit: ExternalGroup["unit"]; message: string };
const csvTemplate = 'series,year,period,value,unit,source\n"Δική μου μέτρηση",2024,2024,12.5,index,"Πηγή και μέθοδος"\n"Δική μου μέτρηση",2025,2025,13.7,index,"Πηγή και μέθοδος"\n';
function csvRows(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [], cell = "", quote = false;
  for (let i=0;i<text.length;i++){
    const char=text[i];
    if(char === '"'){if(quote && text[i+1] === '"'){cell+='"';i++;} else quote=!quote;}
    else if(char === "," && !quote){row.push(cell);cell="";}
    else if((char === "\n" || char === "\r") && !quote){
      if(char === "\r" && text[i+1]==="\n")i++;
      row.push(cell);if(row.some(x=>x.trim()))lines.push(row);row=[];cell="";
    }else cell+=char;
  }
  if(quote)throw Error("Υπάρχουν εισαγωγικά που δεν έχουν κλείσει.");
  row.push(cell);if(row.some(x=>x.trim()))lines.push(row);
  return lines;
}
function importRows(text: string): ParsedCsv {
  const rows=csvRows(text);if(rows.length<2)throw Error("Το αρχείο δεν περιέχει εγγραφές.");
  if(rows.length>1001)throw Error("Το αρχείο πρέπει να έχει έως 1.000 γραμμές.");
  const header=rows[0].map(v=>v.trim().toLowerCase().replace(/^\uFEFF/,""));
  const required=["series","year","period","value","unit","source"];
  if(required.some(x=>!header.includes(x)))throw Error("Αναμενόμενες στήλες: "+required.join(", "));
  const idx=(name:string)=>header.indexOf(name);
  const grouped=new Map<string,ExternalPoint[]>();
  const units=new Set<string>();let sourceCount=0;
  for(const row of rows.slice(1)){
    const series=(row[idx("series")]??"").trim().slice(0,80);
    const year=Number(row[idx("year")]);const period=(row[idx("period")]??"").trim();
    const value=Number((row[idx("value")]??"").trim().replace(",","."));
    const unit=(row[idx("unit")]??"").trim();
    const source=(row[idx("source")]??"").trim();
    if(!series||!Number.isInteger(year)||year<1990||year>2026||!period||!Number.isFinite(value)||Math.abs(value)>1000000000)throw Error("Μη έγκυρη σειρά, χρονολογία ή αριθμητική τιμή.");
    if(!["index","balance","percent","euro"].includes(unit))throw Error("Η μονάδα πρέπει να είναι index, balance, percent ή euro.");
    if(!source)throw Error("Κάθε εγγραφή χρειάζεται πεδίο source.");
    if(unit==="percent" && Math.abs(value)>100)throw Error("Ποσοστό εκτός ορίων −100 έως 100.");
    units.add(unit);sourceCount++;
    const current=grouped.get(series)??[];
    if(current.some(p=>p.period===period && p.year===year))throw Error("Διπλή τιμή για ίδια σειρά και περίοδο.");
    current.push({year,period:period===String(year)?period:year+"-"+period,value,source});grouped.set(series,current);
  }
  if(units.size!==1)throw Error("Για ένα γράφημα χρειάζεται κοινή μονάδα. Χωρίστε διαφορετικές μονάδες σε διαφορετικά αρχεία.");
  if(grouped.size>6)throw Error("Επιτρέπονται έως έξι σειρές ανά γράφημα.");
  return {lines:[...grouped].map(([label,points],i)=>({id:"import-"+i,label,points:points.sort((a,b)=>a.year-b.year||a.period.localeCompare(b.period,undefined,{numeric:true}))})),unit:[...units][0] as ParsedCsv["unit"],message:"Φορτώθηκαν "+sourceCount+" ιδιωτικές εγγραφές. Οι πηγές δεν έχουν επαληθευτεί."};
}

function format(value:number,unit:ExternalGroup["unit"]):string{
  return unit==="euro"?new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR",maximumFractionDigits:2}).format(value):locale.format(value)+(unit==="percent"?"%":"");
}
function xLabel(key:string,monthly:boolean):string{
  return monthly?MONTHS[Number(key)-1]??key:key;
}
function Plot({lines,monthly,unit,type,indexed}: {lines:ChartLine[];monthly:boolean;unit:ExternalGroup["unit"];type:"line"|"bar";indexed:boolean}){
  const keys=[...new Set(lines.flatMap(x=>x.points.map(p=>p.period)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const comparable=lines.map(line=>{
    const first=line.points.slice().sort((a,b)=>a.period.localeCompare(b.period,undefined,{numeric:true}))[0]?.value;
    return {...line,points:line.points.map(p=>({...p,value:indexed&&first&&first>0?100*p.value/first:p.value}))};
  });
  const values=comparable.flatMap(line=>line.points.map(p=>p.value));
  if(!keys.length||!values.length)return <div className={styles.empty}>Δεν υπάρχουν παρατηρήσεις για τους επιλεγμένους όρους.</div>;
  const W=900,H=360,L=72,R=22,T=24,B=62,inner=W-L-R,height=H-T-B;
  const min=Math.min(...values,...(type==="bar"?[0]:[])),max=Math.max(...values,...(type==="bar"?[0]:[]));
  const padding=Math.max((max-min)*.12,1.5);
  const yMin=min-padding,yMax=max+padding;
  const X=(key:string)=>L+(keys.length===1?inner/2:keys.indexOf(key)*inner/(keys.length-1));
  const Y=(v:number)=>T+(yMax-v)/(yMax-yMin)*height;
  const barBand=inner/Math.max(keys.length,1),barW=Math.min(32,Math.max(6,barBand/(comparable.length+1)));
  const showLabels=keys.length<=9;
  return <div className={styles.chartScroll}>
    <svg className={styles.chart} viewBox={"0 0 "+W+" "+H} role="img" aria-label={"Διάγραμμα "+(type==="line"?"γραμμών":"στηλών")+" με "+lines.length+" σειρές και "+keys.length+" χρονικές περιόδους"}>
      {Array.from({length:5},(_,i)=>{
        const val=yMin+(yMax-yMin)*i/4;
        return <g key={i}><line x1={L} x2={W-R} y1={Y(val)} y2={Y(val)} stroke="#dce3dd" strokeDasharray="4 6"/><text x={L-11} y={Y(val)+4} textAnchor="end" className={styles.axisText}>{locale.format(val)}</text></g>;
      })}
      {keys.map((key,i)=><g key={key}><text x={X(key)} y={H-27} textAnchor="middle" className={styles.axisText}>{showLabels||i%2===0?xLabel(key,monthly):""}</text></g>)}
      {comparable.map((line,j)=>{
        const available=keys.map(key=>line.points.find(p=>p.period===key)).filter((p):p is ExternalPoint=>Boolean(p));
        if(type==="line"){
          const path=available.map((p,i)=>(i?"L":"M")+X(p.period).toFixed(2)+","+Y(p.value).toFixed(2)).join(" ");
          return <g key={line.id}><path d={path} fill="none" stroke={line.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={j%2===1?"9 5":undefined}/>
            {available.map(p=><circle key={p.period} cx={X(p.period)} cy={Y(p.value)} r="4.6" fill={line.color} stroke="white" strokeWidth="1.6"><title>{line.label+" · "+xLabel(p.period,monthly)+" · "+locale.format(p.value)}</title></circle>)}
          </g>;
        }
        return <g key={line.id}>{available.map(p=>{
          const center=X(p.period)+(j-(comparable.length-1)/2)*barW;
          const top=Math.min(Y(p.value),Y(0)),h=Math.max(1,Math.abs(Y(p.value)-Y(0)));
          return <rect key={p.period} x={center-barW*.41} y={top} width={barW*.82} height={h} rx="3" fill={line.color}><title>{line.label+" · "+xLabel(p.period,monthly)+" · "+locale.format(p.value)}</title></rect>;
        })}</g>;
      })}
      <line x1={L} x2={W-R} y1={H-B} y2={H-B} stroke="#a8b4ac"/>
      <text x={(W+L-R)/2} y={H-6} textAnchor="middle" className={styles.axisText}>{monthly?"Μήνας · επικάλυψη αντίστοιχων μηνών":"Έτος αναφοράς"}</text>
    </svg>
  </div>;
}

export function ResearchExternalAnalysis(){
  const [groupId,setGroupId]=useState("annual-esi");
  const [chosen,setChosen]=useState<string[]>(["esi-gr","esi-eu","esi-ea"]);
  const [from,setFrom]=useState(2022),[until,setUntil]=useState(2026);
  const [chartType,setChartType]=useState<"line"|"bar">("line"),[index,setIndex]=useState(false);
  const [query,setQuery]=useState(""),[kind,setKind]=useState("all"),[archiveYear,setArchiveYear]=useState("all");
  const [leftStudy,setLeftStudy]=useState("iobe-2025"),[rightStudy,setRightStudy]=useState("iobe-2026");
  const [uploaded,setUploaded]=useState<ParsedCsv|null>(null),[uploadError,setUploadError]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);
  const group=EXTERNAL_GROUPS.find(g=>g.id===groupId)??EXTERNAL_GROUPS[0];
  const activeSeries=uploaded?uploaded.lines:group.series;
  const activeUnit=uploaded?uploaded.unit:group.unit;
  const activeYears=[...new Set(activeSeries.flatMap(s=>s.points.map(p=>p.year)))].sort((a,b)=>a-b);
  const selectedLines=useMemo(()=>activeSeries.filter(s=>chosen.includes(s.id)).map((s,i)=>({id:s.id,label:s.label,color:COLORS[activeSeries.indexOf(s)%COLORS.length],points:s.points.filter(p=>p.year>=from&&p.year<=until)})),[activeSeries,chosen,from,until]);
  const hasData=selectedLines.some(s=>s.points.length>0);
  const points=selectedLines.flatMap(s=>s.points);
  const latestYear=points.length?Math.max(...points.map(p=>p.year)):undefined;
  const latest=points.filter(p=>p.year===latestYear).sort((a,b)=>Number(a.period)-Number(b.period));
  const earliest=points.length?Math.min(...points.map(p=>p.year)):undefined;
  const firstLine=selectedLines.find(s=>s.points.length>1);
  const ordered=firstLine?.points.slice().sort((a,b)=>a.year-b.year||Number(a.period)-Number(b.period))??[];
  const delta=ordered.length>1?externalChange(ordered[0].value,ordered[ordered.length-1].value):null;
  const yearDeltas=!uploaded&&group.frequency==="annual"&&group.comparison!=="descriptive"
    ?selectedLines.flatMap(line=>{
      const sorted=[...line.points].sort((a,b)=>a.year-b.year);
      return sorted.slice(1).flatMap((point,i)=>{
        const previous=sorted[i];
        return point.year-previous.year===1?[{label:line.label,period:previous.year+" → "+point.year,change:externalChange(previous.value,point.value)}]:[];
      });
    }):[];
  const matchedMonthDeltas=!uploaded&&group.frequency==="month-of-year"
    ?selectedLines.filter(s=>s.points.some(p=>p.year===2025)).flatMap(first=>{
      const name=first.label.replace(/(?:\s*·\s*)?2025$/,"").trim();
      const counterpart=selectedLines.find(other=>other.id!==first.id&&other.points.some(p=>p.year===2026)&&other.label.replace(/(?:\s*·\s*)?2026$/,"").trim()===name);
      if(!counterpart)return [];
      const matches=first.points.filter(p=>counterpart.points.some(q=>q.period===p.period));
      const latestMatch=matches.sort((a,b)=>Number(b.period)-Number(a.period))[0];
      const newValue=counterpart.points.find(p=>p.period===latestMatch?.period);
      return latestMatch&&newValue?[{label:name||group.title,period:xLabel(latestMatch.period,true)+" · 2025 → 2026",change:externalChange(latestMatch.value,newValue.value)}]:[];
    }):[];
  const comparisonRows=[...yearDeltas,...matchedMonthDeltas];
  const sharedGroups=EXTERNAL_GROUPS.filter(g=>g.sourceIds.includes(leftStudy)&&g.sourceIds.includes(rightStudy)&&leftStudy!==rightStudy);
  const leftSource=EXTERNAL_STUDIES.find(s=>s.id===leftStudy);
  const rightSource=EXTERNAL_STUDIES.find(s=>s.id===rightStudy);
  const studyMatches=EXTERNAL_STUDIES.filter(study=>(archiveYear==="all"||String(study.year)===archiveYear)&&(kind==="all"||study.kind===kind)&&(study.issuer+" "+study.title+" "+study.detail).toLocaleLowerCase("el-GR").includes(query.toLocaleLowerCase("el-GR")));
  function chooseGroup(id:string){
    const next=EXTERNAL_GROUPS.find(g=>g.id===id)??EXTERNAL_GROUPS[0];
    setUploaded(null);setUploadError("");setGroupId(next.id);setChosen(next.series.map(s=>s.id));setFrom(2019);setUntil(2026);setIndex(false);
    setChartType(next.id==="supermarket-prices"||next.id==="holiday-survey"?"bar":"line");
  }
  function exportData(){
    const text=uploaded
      ? [ ["indicator","series","year","period","value","unit","source"].map(externalCsvCell).join(","),
          ...selectedLines.flatMap(line=>line.points.map(p=>["Ιδιωτική εισαγωγή",line.label,p.year,p.period,p.value,activeUnit,p.source??"μη επαληθευμένο"].map(externalCsvCell).join(",")))].join("\r\n")+"\r\n"
      : externalCsv(group,chosen,from,until);
    const blob=new Blob(["\uFEFF",text],{type:"text/csv;charset=utf-8"});
    const href=URL.createObjectURL(blob);
    const anchor=document.createElement("a");anchor.href=href;anchor.download="kontamou-research-"+(uploaded?"my-data":group.id)+".csv";anchor.click();URL.revokeObjectURL(href);
  }
  async function importFile(file?:File){
    if(!file)return;
    if(file.size>1024*1024){setUploadError("Το όριο αρχείου είναι 1 MB.");return;}
    try{
      const imported=importRows(await file.text());
      setUploaded(imported);setChosen(imported.lines.map(s=>s.id));setFrom(1990);setUntil(2026);setIndex(false);setChartType("line");setUploadError("");
    }catch(error){setUploadError(error instanceof Error?error.message:"Δεν ήταν δυνατό να διαβαστεί το αρχείο.");}
  }
  const canNormalize=activeUnit==="index"&&selectedLines.every(s=>s.points.every(p=>p.value>0));
  return <section className={styles.workspace} aria-labelledby="research-workbench-title">
    <header className={styles.intro}>
      <div><span className={styles.eyebrow}>Διαδραστική ανάλυση · 2019–2026</span><h2 id="research-workbench-title">Εργαστήριο δεδομένων αγοράς</h2><p>Επιλέξτε δείκτη, επικάλυψη ετών, μελέτες και τρόπο απεικόνισης. Δείτε τις πραγματικές τιμές, εξερευνήστε τις διαφορές και κατεβάστε τις επιλεγμένες παρατηρήσεις.</p></div>
      <div className={styles.introStat}><strong>{EXTERNAL_STUDIES.length}</strong><span>πηγές / εκδόσεις</span><strong>{EXTERNAL_GROUPS.length}</strong><span>αναλυτικές όψεις</span></div>
    </header>
    <div className={styles.workspaceGrid}>
      <aside className={styles.filters} aria-label="Επιλογές ανάλυσης">
        <label className={styles.field}><span>Ποιο στοιχείο θέλετε να αναλύσετε;</span><select value={groupId} disabled={Boolean(uploaded)} onChange={e=>chooseGroup(e.target.value)}>{EXTERNAL_GROUPS.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
        <div className={styles.field}><span>Σειρές προς επικάλυψη</span><div className={styles.checks}>{activeSeries.map(s=><label key={s.id}><input type="checkbox" checked={chosen.includes(s.id)} onChange={e=>setChosen(old=>e.target.checked?[...old,s.id]:old.filter(id=>id!==s.id))}/><span className={styles.swatch} style={{background:COLORS[activeSeries.indexOf(s)%COLORS.length]}}/>{s.label}</label>)}</div></div>
        <div className={styles.field}><span>Χρονικό εύρος</span><div className={styles.rangeFields}><select aria-label="Από έτος" value={from} onChange={e=>setFrom(Math.min(Number(e.target.value),until))}>{[...new Set([1990,...activeYears,2026])].filter(y=>!uploaded?y>=2019:y>=1990).sort((a,b)=>a-b).map(y=><option key={y} value={y}>{y}</option>)}</select><span>έως</span><select aria-label="Έως έτος" value={until} onChange={e=>setUntil(Math.max(Number(e.target.value),from))}>{[...new Set([1990,...activeYears,2026])].filter(y=>!uploaded?y>=2022:y>=1990).sort((a,b)=>a-b).map(y=><option key={y} value={y}>{y}</option>)}</select></div></div>
        <div className={styles.field}><span>Απεικόνιση</span><div className={styles.segment}><button type="button" aria-pressed={chartType==="line"} onClick={()=>setChartType("line")}>Γραμμές</button><button type="button" aria-pressed={chartType==="bar"} onClick={()=>setChartType("bar")}>Στήλες</button></div></div>
        <label className={styles.toggle}><input type="checkbox" disabled={!canNormalize} checked={index&&canNormalize} onChange={e=>setIndex(e.target.checked)}/><span>Κοινή αφετηρία = 100 <small>Μόνο για θετικούς δείκτες. Συγκρίνει πορεία, όχι επίπεδο.</small></span></label>
        <button className={styles.reset} type="button" onClick={()=>chooseGroup("annual-esi")}>Επαναφορά αρχικών επιλογών</button>
      </aside>
      <div className={styles.analysis}>
        <div className={styles.chartHeader}><div><span className={styles.eyebrow}>{uploaded?"Δικά σας στοιχεία · δεν έχουν επαληθευτεί":group.subtitle}</span><h3>{uploaded?"Προσωρινή ανάλυση αρχείου":group.title}</h3></div><button className={styles.export} type="button" onClick={exportData} disabled={!hasData}>Λήψη CSV ↓</button></div>
        <div className={styles.legend}>{selectedLines.map(line=><span key={line.id}><i style={{background:line.color}}/>{line.label}</span>)}{!selectedLines.length&&<span>Επιλέξτε τουλάχιστον μία σειρά.</span>}</div>
        <Plot lines={selectedLines} monthly={!uploaded&&group.frequency==="month-of-year"} unit={activeUnit} type={chartType} indexed={index&&canNormalize}/>
        <div className={styles.figureSummary}>
          <div><span>Διαθέσιμες τιμές</span><strong>{points.length}</strong></div>
          <div><span>Τελευταίο έτος</span><strong>{latestYear??"—"}</strong></div>
          <div><span>Διαφορά πρώτης / τελευταίας τιμής πρώτης σειράς</span><strong>{delta===null?"—":(delta>0?"+":"")+locale.format(delta)}</strong></div>
        </div>
        {!uploaded&&<section className={styles.changesPanel} aria-label="Μεταβολές ανά έτος">
          <div className={styles.changesHead}><strong>Μεταβολές ανά έτος</strong><span>Διαφορά τιμών · {activeUnit==="percent"?"ποσοστιαίες μονάδες":activeUnit==="euro"?"ευρώ ανά νοικοκυριό":"μονάδες δείκτη ή ισοζυγίου"}</span></div>
          {comparisonRows.length>0
            ? <div className={styles.changesRows}>{comparisonRows.map((row,i)=><div key={row.label+"-"+row.period+"-"+i}><span>{row.label}</span><small>{row.period}</small><strong className={row.change>=0?styles.positive:styles.negative}>{row.change>0?"+":""}{locale.format(row.change)}</strong></div>)}</div>
            : <p className={styles.noChange}>Δεν υπάρχουν δύο πλήρως αντίστοιχες περίοδοι για τον επιλεγμένο δείκτη. Δεν υπολογίζουμε αυθαίρετη μεταβολή.</p>}
        </section>}
        <div className={styles.methodNotice}><strong>{uploaded?"Προσωπικό αρχείο":group.comparison==="direct"?"Άμεσα συγκρίσιμη σειρά":group.comparison==="trend-only"?"Επικάλυψη τάσεων με προσοχή":"Περιγραφικά ευρήματα — όχι χρονοσειρά"}</strong><p>{uploaded?"Τα στοιχεία εισάγονται μόνο στον φυλλομετρητή σας, δεν αποθηκεύονται ούτε δημοσιεύονται. Δεν έχει ελεγχθεί η συγκρισιμότητα, οι τιμές ή η προέλευση.":group.caution}</p></div>
        <details className={styles.dataTable}><summary>Προβολή αναλυτικού πίνακα ({points.length} εγγραφές)</summary><div className={styles.tableScroll}><table><thead><tr><th>Σειρά</th><th>Έτος</th><th>Περίοδος</th><th>Τιμή</th></tr></thead><tbody>{selectedLines.flatMap(line=>line.points.map(point=><tr key={line.id+"-"+point.year+"-"+point.period}><td>{line.label}</td><td>{point.year}</td><td>{!uploaded&&group.frequency==="month-of-year"?xLabel(point.period,true):point.period}</td><td>{format(point.value,activeUnit)}</td></tr>))}</tbody></table></div></details>
        {!uploaded&&<div className={styles.sources}><strong>Αρχικές εκδόσεις & επαλήθευση</strong>{group.sourceIds.map(id=>EXTERNAL_STUDIES.find(s=>s.id===id)).filter((s):s is (typeof EXTERNAL_STUDIES)[number]=>Boolean(s)).map(s=><a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer">{s.issuer} · {s.year} ↗</a>)}</div>}
      </div>
    </div>
    <div className={styles.insights} aria-label="Κύρια ευρήματα">
      <article><span>Οικονομικό κλίμα · 2025</span><strong>107,4 / 95,8</strong><p>Ελλάδα έναντι ΕΕ-27, διαφορά 11,6 μονάδων. Ίδιος δείκτης και ίδια έκδοση στοιχείων.</p></article>
      <article><span>Προσδοκίες λιανεμπορίου · Σεπτέμβριος</span><strong>+18,2</strong><p>Μονάδες από το 2025 (97,8) στο 2026 (116,0), στον εθνικό δείκτη ΙΟΒΕ. Δεν είναι αύξηση πωλήσεων.</p></article>
      <article><span>Τιμές σούπερ μάρκετ · Σεπτέμβριος</span><strong>−1,36 μ.</strong><p>Μεταβολή του ετήσιου ρυθμού από +0,61% (2025) σε −0,75% (2026), σε ποσοστιαίες μονάδες.</p></article>
      <article><span>Δαπάνες ελληνικών νοικοκυριών · 2025</span><strong>1.820,20 €</strong><p>Μέση μηνιαία ονομαστική δαπάνη, έναντι 1.724,54 € το 2024. Δεν μετρά αποκλειστικά αύξηση κατανάλωσης.</p></article>
      <article><span>Πραγματικός όγκος λιανεμπορίου · 2025</span><strong>100,3</strong><p>Ετήσιος δείκτης ΕΛΣΤΑΤ με βάση 2021=100, έναντι 98,2 το 2024. Διαχωρίζεται από τον ονομαστικό κύκλο εργασιών.</p></article>
      <article><span>Θερινές εκπτώσεις · ΕΣΕΕ 2025</span><strong>59%</strong><p>Επιχειρήσεις του δείγματος ανέφεραν χειρότερες πωλήσεις από το 2024. Δεν αποτελεί άμεση μέτρηση εθνικού τζίρου.</p></article>
    </div>
    <section className={styles.importPanel} aria-labelledby="custom-data-title">
      <div><span className={styles.eyebrow}>Δικές σας αναλύσεις · ιδιωτική προεπισκόπηση</span><h3 id="custom-data-title">Αναλύστε και δικά σας δεδομένα.</h3><p>Εισαγάγετε αρχείο CSV με έως 1.000 γραμμές και 6 σειρές, χωρίς αποστολή σε διακομιστή. Χρειάζονται οι στήλες <code>series, year, period, value, unit, source</code>. Μονάδες: index, balance, percent ή euro.</p>
        <div className={styles.importActions}><input ref={fileRef} type="file" accept=".csv,text/csv" onChange={e=>{void importFile(e.target.files?.[0]);e.target.value="";}} aria-label="Επιλέξτε αρχείο CSV"/><button type="button" onClick={()=>{const blob=new Blob(["\uFEFF",csvTemplate],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="research-import-template.csv";a.click();URL.revokeObjectURL(url);}}>Πρότυπο CSV ↓</button>{uploaded&&<button type="button" onClick={()=>chooseGroup("annual-esi")}>Επιστροφή στα δημοσιευμένα στοιχεία</button>}</div>
        {uploadError&&<p className={styles.error} role="alert">{uploadError}</p>}{uploaded&&<p className={styles.importSuccess} role="status">{uploaded.message}</p>}
      </div>
    </section>
    <section className={styles.studyCompare} aria-labelledby="external-study-compare-title">
      <div><span className={styles.eyebrow}>Σύγκριση δύο μελετών</span><h3 id="external-study-compare-title">Τι επιτρέπεται να συγκρίνουμε;</h3><p>Επιλέξτε δύο αρχικές δημοσιεύσεις. Θα εμφανιστούν κοινά, ελέγξιμα στοιχεία, όχι τεχνητές συσχετίσεις ανάμεσα σε διαφορετικούς δείκτες.</p></div>
      <div className={styles.pairPicker}>
        <label>Πρώτη μελέτη<select aria-label="Πρώτη μελέτη" value={leftStudy} onChange={e=>setLeftStudy(e.target.value)}>{EXTERNAL_STUDIES.map(s=><option key={s.id} value={s.id}>{s.issuer} · {s.year} — {s.title}</option>)}</select></label>
        <label>Δεύτερη μελέτη<select aria-label="Δεύτερη μελέτη" value={rightStudy} onChange={e=>setRightStudy(e.target.value)}>{EXTERNAL_STUDIES.map(s=><option key={s.id} value={s.id}>{s.issuer} · {s.year} — {s.title}</option>)}</select></label>
      </div>
      <div className={styles.pairCards}>
        {[leftSource,rightSource].map((s,i)=>s&&<article key={i}><span className={styles.eyebrow}>{i===0?"Α · Πρώτη πηγή":"Β · Δεύτερη πηγή"}</span><strong>{s.title}</strong><p>{s.issuer} · {s.detail}</p><a href={s.url} target="_blank" rel="noopener noreferrer">Δείτε τη δημοσίευση ↗</a></article>)}
      </div>
      <div className={sharedGroups.length?styles.compareAllowed:styles.compareBlocked} role="status">
        <strong>{sharedGroups.length?"Υπάρχουν κοινές σειρές προς εξέταση":"Δεν υπάρχει τεκμηριωμένη κοινή αριθμητική σειρά"}</strong>
        <p>{sharedGroups.length?"Μπορούν να εξεταστούν οι παρακάτω δείκτες, με τους περιορισμούς της κάθε μεθόδου:":"Οι πηγές δεν έχουν ίδια μετρήσιμη μεταβλητή ή περίοδο. Μπορούν να παρατεθούν ως διαφορετικές οπτικές, όχι να υπολογιστεί κοινός μέσος, διαφορά ή συσχέτιση."}</p>
        {sharedGroups.map(g=><button type="button" key={g.id} onClick={()=>{chooseGroup(g.id);document.getElementById("research-workbench-title")?.scrollIntoView({behavior:"smooth",block:"start"});}}>{g.title} · {g.comparison==="direct"?"ίδιος ορισμός":"με προσοχή"} ↗</button>)}
      </div>
    </section>
    <section className={styles.catalog} id="external-studies" aria-label="Αρχείο μελετών">
      <div className={styles.catalogTop}><div><span className={styles.eyebrow}>Αρχείο φορέων · 2023–2026</span><h3>Μελέτες και αρχικές δημοσιεύσεις</h3></div><div className={styles.catalogFields}><input type="search" placeholder="Αναζήτηση φορέα ή θέματος…" aria-label="Αναζήτηση δημοσιεύσεων" value={query} onChange={e=>setQuery(e.target.value)}/><select value={archiveYear} aria-label="Έτος δημοσίευσης" onChange={e=>setArchiveYear(e.target.value)}><option value="all">Όλα τα έτη</option>{[...new Set(EXTERNAL_STUDIES.map(s=>s.year))].sort((a,b)=>b-a).map(year=><option key={year} value={year}>{year}</option>)}</select><select value={kind} aria-label="Είδος δημοσίευσης" onChange={e=>setKind(e.target.value)}><option value="all">Όλες οι πηγές</option><option value="sentiment">Κλίμα αγοράς</option><option value="survey">Έρευνες</option><option value="statistical">Στατιστικά</option></select></div></div>
      <div className={styles.catalogGrid}>{studyMatches.map(s=><article key={s.id}><span className={styles.eyebrow}>{s.issuer} · {s.year}</span><h4>{s.title}</h4><p>{s.detail}</p><a href={s.url} target="_blank" rel="noopener noreferrer">Άνοιγμα αρχικής πηγής ↗</a></article>)}{!studyMatches.length&&<p>Δεν βρέθηκαν δημοσιεύσεις με αυτά τα φίλτρα.</p>}</div>
    </section>
  </section>;
}
