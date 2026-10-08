"use client";

import { useMemo, useState } from "react";
import {
  DRIVER_ROWS, DRIVERS_SOURCES, DRIVER_SERIES, DRIVER_SERIES_IDS,
  indexedDrivers, pearsonCorrelation, spendingDriversCsv, spendingIncomePairs,
  type DriversSeriesId, type PairedObservation
} from "../lib/research-spending-drivers";
import styles from "./ResearchSpendingDrivers.module.css";

const COLORS: Record<DriversSeriesId,string>={
  spending:"#bb7649",realSpending:"#245e4a",income:"#6178a7",realIncome:"#78578d",priceIndex:"#b44e65"
};
const fmt=new Intl.NumberFormat("el-GR",{maximumFractionDigits:1});
const fmt2=new Intl.NumberFormat("el-GR",{maximumFractionDigits:2});
const euro=new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR",maximumFractionDigits:2});
const years=[2019,2020,2021,2022,2023,2024,2025];
const INDEX_W=880,INDEX_H=305,IL=67,IR=22,IT=18,IB=40;
const toCsvDownload=(content:string,name:string)=>{
  const blob=new Blob(["\uFEFF",content],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url);
};
function IndexOverlay({from,to,selected}:{from:number;to:number;selected:DriversSeriesId[]}){
  const traces=selected.map(id=>({id,label:DRIVER_SERIES[id].label,color:COLORS[id],points:indexedDrivers(id,from,to)})).filter(s=>s.points.length);
  const values=traces.flatMap(s=>s.points.map(p=>p.value));
  if(!values.length)return <p className={styles.empty}>Επιλέξτε σειρές και ένα διαθέσιμο χρονικό διάστημα.</p>;
  const min=Math.min(90,...values),max=Math.max(110,...values);
  const span=Math.max(max-min,8),low=min-span*.13,high=max+span*.13;
  const X=(y:number)=>IL+(y-2019)*(INDEX_W-IL-IR)/6;
  const Y=(v:number)=>IT+(high-v)/(high-low)*(INDEX_H-IT-IB);
  const ticks=Array.from({length:5},(_,i)=>low+(high-low)*i/4);
  return <div className={styles.chartScroll}><svg viewBox={"0 0 "+INDEX_W+" "+INDEX_H} className={styles.indexSvg} role="img" aria-label={"Διάγραμμα κοινής αφετηρίας 2019 ίσον 100 για "+traces.length+" χρονοσειρές"}>
    {ticks.map((v,i)=><g key={i}><line x1={IL} x2={INDEX_W-IR} y1={Y(v)} y2={Y(v)} stroke="#dae5dc" strokeDasharray="3 5"/><text x={IL-10} y={Y(v)+4} textAnchor="end" className={styles.axis}>{fmt.format(v)}</text></g>)}
    {years.filter(y=>y>=from&&y<=to).map(y=><text key={y} x={X(y)} y={INDEX_H-13} textAnchor="middle" className={styles.axis}>{y}</text>)}
    {traces.map(s=><g key={s.id}>
      <path d={s.points.map((p,i)=>(i?"L":"M")+X(p.year)+","+Y(p.value)).join(" ")} stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {s.points.map(p=><circle key={p.year} cx={X(p.year)} cy={Y(p.value)} r="4.8" fill={s.color} stroke="#fff" strokeWidth="2"><title>{s.label+" · "+p.year+" · "+fmt2.format(p.value)+" (2019=100)"}</title></circle>)}
    </g>)}
    {from<=2019&&to>=2019&&<text x={IL+7} y={IT+14} className={styles.reference}>Κοινή βάση 2019 = 100</text>}
  </svg></div>;
}
function Scatter({pairs,correlation}:{pairs:PairedObservation[];correlation:number|null}){
  const W=660,H=315,L=76,R=30,T=24,B=58;
  if(pairs.length<2)return <div className={styles.empty}>Δεν υπάρχουν αρκετά κοινά έτη για διάγραμμα σχέσης.</div>;
  const xs=pairs.map(p=>p.income),ys=pairs.map(p=>p.spending);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const sx=Math.max(maxX-minX,1)*.1,sy=Math.max(maxY-minY,1)*.14;
  const x0=minX-sx,x1=maxX+sx,y0=minY-sy,y1=maxY+sy;
  const X=(v:number)=>L+(v-x0)/(x1-x0)*(W-L-R);
  const Y=(v:number)=>T+(y1-v)/(y1-y0)*(H-T-B);
  const mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;
  const sumSq=xs.reduce((a,x)=>a+(x-mx)**2,0);
  const slope=sumSq>0?xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/sumSq:0;
  const regression=(x:number)=>my+slope*(x-mx);
  return <div className={styles.chartScroll}><svg viewBox={"0 0 "+W+" "+H} className={styles.scatterSvg} role="img" aria-label={"Διάγραμμα διασποράς εισοδήματος και δαπανών, "+pairs.length+" έτη, συντελεστής συσχέτισης "+(correlation===null?"μη διαθέσιμος":fmt2.format(correlation))}>
    {Array.from({length:4},(_,i)=>{const v=y0+(y1-y0)*i/3;return <g key={i}><line x1={L} x2={W-R} y1={Y(v)} y2={Y(v)} stroke="#dde7de" strokeDasharray="4 5"/><text x={L-9} y={Y(v)+4} textAnchor="end" className={styles.axis}>{fmt.format(v)}</text></g>})}
    {Array.from({length:4},(_,i)=>{const v=x0+(x1-x0)*i/3;return <text key={i} x={X(v)} y={H-33} textAnchor="middle" className={styles.axis}>{fmt.format(v)}</text>})}
    {correlation!==null&&<line x1={X(minX)} x2={X(maxX)} y1={Y(regression(minX))} y2={Y(regression(maxX))} stroke="#ba8562" strokeDasharray="7 6" strokeWidth="2"/>}
    {pairs.map(p=><g key={p.incomeYear}><circle cx={X(p.income)} cy={Y(p.spending)} r="6.4" fill="#275e4a" stroke="white" strokeWidth="2"><title>{"Εισόδημα "+p.incomeYear+": "+fmt2.format(p.income)+"€ · Δαπάνη "+p.spendingYear+": "+fmt2.format(p.spending)+"€"}</title></circle><text x={X(p.income)+9} y={Y(p.spending)-7} className={styles.axis}>{p.incomeYear}</text></g>)}
    <text x={W/2} y={H-6} textAnchor="middle" className={styles.axis}>Εισόδημα ανά ισοδύναμο άτομο / έτος (€)</text>
    <text transform={"translate(15 "+H/2+") rotate(-90)"} textAnchor="middle" className={styles.axis}>Δαπάνη ανά νοικοκυριό / μήνα (€)</text>
  </svg></div>;
}

export function ResearchSpendingDrivers(){
  const [selected,setSelected]=useState<DriversSeriesId[]>(["spending","realSpending","realIncome","priceIndex"]);
  const [from,setFrom]=useState(2019),[to,setTo]=useState(2025);
  const [real,setReal]=useState(true),[lag,setLag]=useState<0|1>(0);
  const pairs=useMemo(()=>spendingIncomePairs({from,to,lag,real}),[from,to,lag,real]);
  const correlation=useMemo(()=>pearsonCorrelation(pairs),[pairs]);
  const latest=DRIVER_ROWS[DRIVER_ROWS.length-1];
  const income24=DRIVER_ROWS.find(r=>r.year===2024);
  const income23=DRIVER_ROWS.find(r=>r.year===2023);
  const real24=income24?.realIncome??null,real23=income23?.realIncome??null;
  const realIncomeGrowth=real24!==null&&real23!==null?100*(real24/real23-1):null;
  return <section id="income-spending-relations" className={styles.shell} aria-labelledby="income-research-heading">
    <div className={styles.hero}>
      <div><span className={styles.eyebrow}>Εισόδημα · πληθωρισμός · αγοραστική δύναμη</span>
        <h2 id="income-research-heading">Τι μπορεί να εξηγεί τις μεταβολές της κατανάλωσης;</h2>
        <p>Συνδυάστε μέση δαπάνη νοικοκυριών, ισοδύναμο διαθέσιμο εισόδημα και ετήσιο δείκτη τιμών. Συγκρίνετε ονομαστικές και αποπληθωρισμένες αξίες και διερευνήστε πιθανές συσχετίσεις — χωρίς να συγχέετε μετρήσεις ή ημερολογιακά έτη.</p>
      </div><a className={styles.anchor} href="#external-studies">Μελέτες και πηγές ↗</a>
    </div>
    <div className={styles.insights}>
      <article><span>Δαπάνη νοικοκυριού · 2025</span><strong>+{fmt2.format(latest.nominalSpendingYoY??0)}%</strong><p>Ονομαστική μεταβολή από το 2024, περιλαμβάνει αλλαγές τιμών και ποσότητας.</p></article>
      <article><span>Δαπάνη · τιμές 2019</span><strong>{(latest.realSpendingYoY??0)>0?"+":""}{fmt2.format(latest.realSpendingYoY??0)}%</strong><p>Ενδεικτική μεταβολή 2025/2024 μετά από προσαρμογή στον γενικό ΕνΔΤΚ.</p></article>
      <article><span>Ισοδύναμο διαθέσιμο εισόδημα · 2024</span><strong>{euro.format(income24?.income??0)}</strong><p>Εισοδηματικό έτος 2024, δημοσίευση EU-SILC 2025. Εκτιμώμενη πραγματική μεταβολή από το 2023: {realIncomeGrowth===null?"—":(realIncomeGrowth>=0?"+":"")+fmt2.format(realIncomeGrowth)+"%"}.</p></article>
    </div>
    <div className={styles.workbench}>
      <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Χρονοσειρές · κοινή κλίμακα</span><h3>Ποιοι δείκτες κινούνται μαζί;</h3><p>Όλες οι γραμμές επαναβασίζονται σε <strong>2019 = 100</strong> ώστε να μπορεί να συγκριθεί η *μεταβολή*, όχι τα ποσά σε ευρώ.</p></div></div>
      <div className={styles.selectionGrid}>
        <div className={styles.controls}>
          <span className={styles.smallLabel}>Επιλέξτε μεταβλητές (έως 5)</span>
          <div className={styles.checks}>{DRIVER_SERIES_IDS.map(id=><label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={event=>setSelected(previous=>event.target.checked?[...previous,id]:previous.filter(i=>i!==id))}/><i style={{background:COLORS[id]}}/><span><strong>{DRIVER_SERIES[id].label}</strong><small>{DRIVER_SERIES[id].description}</small></span></label>)}</div>
          <div className={styles.yearControls}><label>Από<select value={from} onChange={event=>setFrom(Math.min(Number(event.target.value),to))}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label><label>Έως<select value={to} onChange={event=>setTo(Math.max(Number(event.target.value),from))}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label></div>
        </div>
        <div className={styles.plotPanel}>
          <div className={styles.plotHeading}><strong>Μεταβολή από το 2019</strong><span>Δείκτης βάσης 2019 = 100</span></div>
          <IndexOverlay selected={selected} from={from} to={to}/>
          <div className={styles.legend}>{selected.map(id=><span key={id}><i style={{background:COLORS[id]}}/>{DRIVER_SERIES[id].label}</span>)}</div>
          <p className={styles.caution}>Για το εισόδημα η περίοδος σταματά στο <strong>2024</strong>: η τελευταία διαθέσιμη έρευνα EU-SILC 2025 αφορά τα εισοδήματα του 2024. Η αντίστοιχη ΕΟΠ καλύπτει δαπάνες έως το 2025. Κενά στοιχεία παραμένουν κενά.</p>
        </div>
      </div>
      <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Διερεύνηση συσχέτισης · εθνικές ετήσιες συγκεντρώσεις</span><h3>Όταν αλλάζει το εισόδημα, πώς κινείται η δαπάνη;</h3><p>Διάγραμμα διασποράς με ακριβή αντιστοίχιση του <strong>εισοδηματικού έτους</strong> και του έτους δαπάνης. Δοκιμάστε και υστέρηση ενός έτους.</p></div></div>
      <div className={styles.relationControls}>
        <label><span>Αξίες</span><select value={real?"real":"nominal"} onChange={e=>setReal(e.target.value==="real")}><option value="real">Σε σταθερές τιμές 2019</option><option value="nominal">Σε τρέχουσες τιμές</option></select></label>
        <label><span>Χρονική σύζευξη</span><select value={lag} onChange={e=>setLag(Number(e.target.value)===1?1:0)}><option value={0}>Εισόδημα και δαπάνη ίδιου έτους</option><option value={1}>Εισόδημα έτους t → δαπάνη έτους t+1</option></select></label>
        <div className={styles.rCard}><span>Συντελεστής Pearson</span><strong>{correlation===null?"—":fmt2.format(correlation)}</strong><small>n = {pairs.length} συγκρίσιμα ζεύγη</small></div>
      </div>
      <Scatter pairs={pairs} correlation={correlation}/>
      <div className={styles.method}><strong>Τι σημαίνει η συσχέτιση;</strong>
        <p>Το r περιγράφει τη γραμμική συνδιακύμανση των ετήσιων μέσων τιμών· <strong>δεν αποδεικνύει αιτιότητα, ούτε ατομική συμπεριφορά</strong>. Το εισόδημα αφορά ισοδύναμο άτομο/έτος και η δαπάνη μέσο νοικοκυριό/μήνα, από διαφορετικές έρευνες και πληθυσμούς. Μόνο {pairs.length} ετήσια σημεία είναι διαθέσιμα, ενώ κοινές χρονικές τάσεις, αλλαγές σύνθεσης νοικοκυριών και άλλοι παράγοντες μπορούν να προκαλέσουν πλασματική συσχέτιση. Χρησιμοποιείτε τα αποτελέσματα για ερευνητικές υποθέσεις, όχι ως πρόβλεψη ή αιτιολογική εκτίμηση.</p>
      </div>
      <details className={styles.dataTable}><summary>Αναλυτικός πίνακας: δαπάνες, εισόδημα και πληθωρισμός ανά έτος</summary><div className={styles.tableScroll}><table><thead><tr><th>Έτος</th><th>Δαπάνη €/μήνα</th><th>Δαπάνη σε € 2019</th><th>Εισόδημα €/έτος*</th><th>Εισόδημα σε € 2019*</th><th>ΕνΔΤΚ</th><th>Μέση ετήσια αύξηση τιμών</th></tr></thead><tbody>{DRIVER_ROWS.filter(p=>p.year>=from&&p.year<=to).map(p=><tr key={p.year}><td>{p.year}</td><td>{euro.format(p.spending)}</td><td>{euro.format(p.realSpending)}</td><td>{p.income==null?"Δεν έχει δημοσιευτεί":euro.format(p.income)}</td><td>{p.realIncome==null?"—":euro.format(p.realIncome)}</td><td>{fmt.format(p.priceIndex)}</td><td>{p.inflation==null?"—":fmt2.format(p.inflation)+"%"}</td></tr>)}</tbody></table></div><p className={styles.tableNote}>* Έτος εισοδήματος, όχι έτος διεξαγωγής έρευνας. Ο αποπληθωρισμός με ΕνΔΤΚ γενικού καλαθιού είναι ενδεικτικός και χρησιμοποιεί στρογγυλοποιημένες ετήσιες τιμές.</p></details>
      <div className={styles.actions}><button type="button" onClick={()=>toCsvDownload(spendingDriversCsv(from,to,lag,real),"kontamou-income-inflation-spending.csv")} disabled={!pairs.length}>Λήψη συγκρίσιμων ζευγών CSV ↓</button><span>Περιλαμβάνονται έτη αναφοράς, μεθοδολογία και σύνδεσμοι πηγών.</span></div>
      <div className={styles.sources}><span>Αρχικές δημοσιεύσεις</span><a href={DRIVERS_SOURCES.silc} target="_blank" rel="noopener noreferrer">ΕΛΣΤΑΤ · EU-SILC ↗</a><a href={DRIVERS_SOURCES.hbs} target="_blank" rel="noopener noreferrer">ΕΛΣΤΑΤ · Δαπάνες νοικοκυριών ↗</a><a href={DRIVERS_SOURCES.prices} target="_blank" rel="noopener noreferrer">Eurostat · ΕνΔΤΚ ↗</a></div>
    </div>
  </section>;
}
