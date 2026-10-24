"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
const EMPTY_CATEGORIES:readonly PublishedVoiceCategory[]=[];
const EMPTY_QUOTES:readonly PublishedVoice[]=[];
const EMPTY_GEOGRAPHY:readonly PublishedVoiceGeography[]=[];
export function ResearchVoiceOfGreece({isDemo,data,isLivePreview=false}:{isDemo:boolean;data?:PublicVoices;isLivePreview?:boolean}){
 const dataset=isDemo?DEMO:data;
 const categories=dataset?.categories??EMPTY_CATEGORIES;
 const eligible=useMemo(()=>dataset?.quotes.filter(q=>q.text.trim().length>0&&categories.some(c=>c.key===q.category))??EMPTY_QUOTES,[dataset,categories]);
 const [playing,setPlaying]=useState(true);
 const [index,setIndex]=useState(0);
 const [round,setRound]=useState(0);
 const [filter,setFilter]=useState("");
 const [order,setOrder]=useState<PublishedVoice[]>([]);
 const previousRound=useRef(round);
 useEffect(()=>{
   // Preserve already-revealed quotes across 60-second data refreshes.
   // New valid Q18 answers are shuffled into the unrevealed tail.
   const restarted=previousRound.current!==round;
   previousRound.current=round;
   setOrder(before=>{
     if(restarted || before.length===0) return shuffle(eligible);
     const latest=new Map(eligible.map(quote=>[quote.id,quote] as const));
     const retained=before.flatMap(quote=>{
       const current=latest.get(quote.id);
       return current?[current]:[];
     });
     const seen=new Set(retained.map(q=>q.id));
     const added=eligible.filter(quote=>!seen.has(quote.id));
     return added.length===0 && retained.length===before.length
       ? retained : [...retained,...shuffle(added)];
   });
 },[eligible,round]);
 useEffect(()=>{setIndex(value=>Math.min(value,order.length));},[order.length]);
 useEffect(()=>{
  if(!playing||order.length===0||index>=order.length)return;
  const handle=window.setTimeout(()=>setIndex(n=>Math.min(n+1,order.length)),950);
  return ()=>window.clearTimeout(handle);
 },[playing,index,order]);
 const revealed=order.slice(0,index).filter(v=>!filter||v.category===filter);
 const shownCategories=categories.filter(c=>!filter||c.key===filter);
 const geo=(dataset?.geography??EMPTY_GEOGRAPHY).filter(g=>g.eligibleN>=30&&g.count>=30&&(!filter||g.category===filter));
 return <section className={styles.voicePage} aria-label="Η φωνή της Ελλάδας">
  <div className={styles.voiceHeader}>
   <div><span className={styles.eyebrow}>Q18 · ΠΟΙΟΤΙΚΗ ΑΝΑΛΥΣΗ</span><h3>Η φωνή της Ελλάδας</h3>
    <p>{isLivePreview?"Οι πραγματικές απαντήσεις Q18 εμφανίζονται μία προς μία, με τυχαία σειρά, στις θεματικές κατηγορίες που χρησιμοποιούνται ήδη στη διαχείριση. Πρόκειται για περιορισμένη εσωτερική προεπισκόπηση, όχι για εγκεκριμένα δημόσια αποσπάσματα.":"Οι λέξεις αποκτούν χώρο. Κάθε θεματική γεμίζει καθώς εμφανίζονται, μία προς μία, οι εγκεκριμένες και ανωνυμοποιημένες ελεύθερες απαντήσεις."}</p>
   </div>
   <div className={styles.voiceActions}>
    <button type="button" onClick={()=>setPlaying(v=>!v)} disabled={order.length===0}>{playing?"Παύση":"Αναπαραγωγή"}</button>
    <button type="button" onClick={()=>{setIndex(0);setRound(r=>r+1);setPlaying(true);}} disabled={order.length===0}>Νέα τυχαία σειρά ↻</button>
   </div>
  </div>
  {isDemo&&<p className={styles.warning}>DEMO: Όλα τα εμφανιζόμενα κείμενα και πλήθη είναι αποκλειστικά κατασκευασμένα παραδείγματα. Καμία πραγματική απάντηση Q18 δεν φορτώνεται.</p>}
  <div className={styles.voiceControls}><label>Θεματική ενότητα
    <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Όλες οι θεματικές</option>{categories.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select>
   </label><span aria-live="polite">{fmt(index)} / {fmt(order.length)} {isLivePreview?"θεματικές εμφανίσεις από πραγματικές Q18 απαντήσεις":"εγκεκριμένα αποσπάσματα που εμφανίστηκαν"}</span></div>
  {!dataset||categories.length===0?<div className={styles.voiceUnavailable} role="status">
    <strong>{isLivePreview?"Δεν υπάρχουν διαθέσιμα επιλέξιμα κείμενα για την εσωτερική προεπισκόπηση.":"Αναμένεται η ελεγμένη ανώνυμη έκδοση της Q18."}</strong>
    <p>{isLivePreview?"Η εσωτερική προβολή απαιτεί τον ίδιο περιορισμένο ρόλο που έχει πρόσβαση στις ακατέργαστες ελεύθερες απαντήσεις. Ανεπαρκείς ή μη διαθέσιμες εγγραφές δεν αντικαθίστανται με δεδομένα επίδειξης.":"Οι κατηγορίες και τα αποσπάσματα ενεργοποιούνται μόνο μετά από έλεγχο επιλεξιμότητας, συναίνεσης όπου απαιτείται, ανωνυμοποίησης και έγκρισης δημοσίευσης. Δεν εμφανίζουμε τις ιδιωτικές απαντήσεις της διαχείρισης."}</p>
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
  <p className={styles.note}>{isLivePreview?"Τα κείμενα είναι πραγματικές, προσωρινές απαντήσεις που προβάλλονται μόνο σε εξουσιοδοτημένους διαχειριστές. Δεν έχουν λάβει ανθρώπινη έγκριση δημοσίευσης. ":""}Δεν συνδέουμε ποτέ εμφανιζόμενο απόσπασμα με νομό, κλάδο ή άλλο χαρακτηριστικό επιχείρησης. Οι γεωγραφικοί πίνακες επιτρέπονται μόνο ως ανεξάρτητα εγκεκριμένα συγκεντρωτικά σύνολα, με τουλάχιστον 30 επιλέξιμες απαντήσεις και 30 αναφορές στο εμφανιζόμενο κελί. Το πλήθος αναφορών δεν ισούται υποχρεωτικά με πλήθος συμμετεχόντων.</p>
 </section>;
}
