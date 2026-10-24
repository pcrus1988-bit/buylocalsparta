"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./ResultsWorkbench.module.css";

/** Public-only, explicitly cleared Q18 editorial output.
 * Never pass raw Q18 answers, participant identifiers, or response↔location joins.
 * Geography is supplied only as independently suppressed category totals.
 */
export type PublishedVoice = Readonly<{ id:string; category:string; text:string }>;
export type PublishedVoiceCategory = Readonly<{ key:string; label:string; count:number }>;
export type PublishedVoiceGeography = Readonly<{ area:string; category:string; count:number; eligibleN:number }>;
export type PublicVoices = Readonly<{
  quotes:readonly PublishedVoice[];
  categories:readonly PublishedVoiceCategory[];
  geography:readonly PublishedVoiceGeography[];
}>;
const DEMO:PublicVoices={
 categories:[
  {key:"cost",label:"Κόστος και ρευστότητα",count:48},
  {key:"digital",label:"Τεχνολογία και ψηφιακές πωλήσεις",count:27},
  {key:"customers",label:"Πελάτες και τοπική αγορά",count:39},
  {key:"regulation",label:"Γραφειοκρατία και κανόνες",count:22},
  {key:"future",label:"Προοπτικές και προτάσεις",count:34}
 ],
 quotes:[
  {id:"d1",category:"cost",text:"Ενδεικτικό κείμενο για λειτουργικό κόστος."},
  {id:"d2",category:"customers",text:"Ενδεικτικό κείμενο για τη μικρή τοπική αγορά."},
  {id:"d3",category:"digital",text:"Ενδεικτικό κείμενο για ηλεκτρονικές πωλήσεις."},
  {id:"d4",category:"future",text:"Ενδεικτικό κείμενο για το επόμενο έτος."},
  {id:"d5",category:"regulation",text:"Ενδεικτικό κείμενο για τη γραφειοκρατία."},
  {id:"d6",category:"cost",text:"Ενδεικτικό κείμενο για πρόσβαση σε ρευστότητα."},
  {id:"d7",category:"customers",text:"Ενδεικτικό κείμενο για την κίνηση στο κατάστημα."},
  {id:"d8",category:"digital",text:"Ενδεικτικό κείμενο για ψηφιακές δεξιότητες."}
 ],
 geography:[]
};
function shuffle<T>(items:readonly T[]):T[]{
 const result=[...items];
 for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j]!,result[i]!];}
 return result;
}
const fmt=(value:number)=>value.toLocaleString("el-GR");
export function ResearchVoiceOfGreece({isDemo,data}:{isDemo:boolean;data?:PublicVoices}){
 const dataset=isDemo?DEMO:data;
 const categories=dataset?.categories??[];
 const eligible=useMemo(()=>dataset?.quotes.filter(q=>q.text.trim().length>0&&categories.some(c=>c.key===q.category))??[],[dataset,categories]);
 const [playing,setPlaying]=useState(true);
 const [index,setIndex]=useState(0);
 const [round,setRound]=useState(0);
 const [filter,setFilter]=useState("");
 const [order,setOrder]=useState<PublishedVoice[]>([]);
 useEffect(()=>{setOrder(shuffle(eligible));setIndex(0);},[eligible,round]);
 useEffect(()=>{
  if(!playing||order.length===0||index>=order.length)return;
  const handle=window.setTimeout(()=>setIndex(n=>Math.min(n+1,order.length)),950);
  return ()=>window.clearTimeout(handle);
 },[playing,index,order]);
 const revealed=order.slice(0,index).filter(v=>!filter||v.category===filter);
 const shownCategories=categories.filter(c=>!filter||c.key===filter);
 const geo=dataset?.geography.filter(g=>g.eligibleN>=30&&g.count>=30&&(!filter||g.category===filter))??[];
 return <section className={styles.voicePage} aria-label="Η φωνή της Ελλάδας">
  <div className={styles.voiceHeader}>
   <div><span className={styles.eyebrow}>Q18 · ΠΟΙΟΤΙΚΗ ΑΝΑΛΥΣΗ</span><h3>Η φωνή της Ελλάδας</h3>
    <p>Οι λέξεις αποκτούν χώρο. Κάθε θεματική γεμίζει καθώς εμφανίζονται, μία προς μία, οι εγκεκριμένες και ανωνυμοποιημένες ελεύθερες απαντήσεις.</p>
   </div>
   <div className={styles.voiceActions}>
    <button type="button" onClick={()=>setPlaying(v=>!v)} disabled={order.length===0}>{playing?"Παύση":"Αναπαραγωγή"}</button>
    <button type="button" onClick={()=>{setRound(r=>r+1);setPlaying(true);}} disabled={order.length===0}>Νέα τυχαία σειρά ↻</button>
   </div>
  </div>
  {isDemo&&<p className={styles.warning}>DEMO: Όλα τα εμφανιζόμενα κείμενα και πλήθη είναι αποκλειστικά κατασκευασμένα παραδείγματα. Καμία πραγματική απάντηση Q18 δεν φορτώνεται.</p>}
  <div className={styles.voiceControls}><label>Θεματική ενότητα
    <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Όλες οι θεματικές</option>{categories.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select>
   </label><span aria-live="polite">{fmt(index)} / {fmt(order.length)} εγκεκριμένα αποσπάσματα που εμφανίστηκαν</span></div>
  {!dataset||categories.length===0?<div className={styles.voiceUnavailable} role="status">
    <strong>Αναμένεται η ελεγμένη ανώνυμη έκδοση της Q18.</strong>
    <p>Οι κατηγορίες και τα αποσπάσματα ενεργοποιούνται μόνο μετά από έλεγχο επιλεξιμότητας, συναίνεσης όπου απαιτείται, ανωνυμοποίησης και έγκρισης δημοσίευσης. Δεν εμφανίζουμε τις ιδιωτικές απαντήσεις της διαχείρισης.</p>
   </div>:
   <div className={styles.voiceWall}>
    {shownCategories.map((cat,i)=><article key={cat.key} className={styles.voiceBucket}>
     <div className={styles.voiceBucketHeader}><span>0{i+1}</span><h4>{cat.label}</h4><strong>{fmt(cat.count)} θεματικές αναφορές</strong></div>
     <div className={styles.voiceStream} aria-label={"Αποσπάσματα: "+cat.label}>
      {revealed.filter(q=>q.category===cat.key).map(q=><blockquote key={q.id} className={styles.voiceBubble}>{q.text}</blockquote>)}
      {!revealed.some(q=>q.category===cat.key)&&<span className={styles.voicePending}>Οι φωνές εμφανίζονται σταδιακά…</span>}
     </div>
    </article>)}
   </div>}
  {geo.length>0&&<div className={styles.voiceGeography}><h4>Θεματικές ανά νομό · μόνο συγκεντρωτικά στοιχεία</h4>
   <div className={styles.voiceGeoGrid}>{geo.map((g,i)=><div key={i}><strong>{g.area}</strong><span>{categories.find(c=>c.key===g.category)?.label??g.category}</span><b>{fmt(g.count)} αναφορές</b></div>)}</div>
  </div>}
  <p className={styles.note}>Δεν συνδέουμε ποτέ εμφανιζόμενο απόσπασμα με νομό, κλάδο ή άλλο χαρακτηριστικό επιχείρησης. Οι γεωγραφικοί πίνακες επιτρέπονται μόνο ως ανεξάρτητα εγκεκριμένα συγκεντρωτικά σύνολα, με τουλάχιστον 30 επιλέξιμες απαντήσεις και 30 αναφορές στο εμφανιζόμενο κελί. Το πλήθος αναφορών δεν ισούται υποχρεωτικά με πλήθος συμμετεχόντων.</p>
 </section>;
}
