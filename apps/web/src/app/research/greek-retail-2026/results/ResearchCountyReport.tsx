"use client";

import { useMemo, useState } from "react";
import { GREECE_PREFECTURES } from "../../../../lib/research-prefectures";
import { PUBLIC_RESULTS_CHAPTERS, publicMetricLabel } from "../../../../lib/research-public-results-sections";
import type { InternalResearchGeographicCoverage, SafePublicResultPoint, SafeCountyAvailability } from "../../../../lib/research-public-results-data";
import styles from "./ResultsWorkbench.module.css";

type CountyMetricComparison = {
  key:string;
  county:SafePublicResultPoint;
  national:SafePublicResultPoint;
  difference:number;
};
const percent = (v:number)=>new Intl.NumberFormat("el-GR",{style:"percent",maximumFractionDigits:1}).format(v);
const number = (v:number)=>new Intl.NumberFormat("el-GR",{maximumFractionDigits:1}).format(v);
const count = (v:number)=>new Intl.NumberFormat("el-GR").format(v);
const showValue = (p:SafePublicResultPoint)=>p.format==="proportion"?percent(p.value):number(p.value);
const diffValue = (r:CountyMetricComparison)=>{
  const n=r.difference*(r.county.format==="proportion"?100:1);
  return (n>0?"+":"")+number(n)+(r.county.format==="proportion"?" π.μ.":" μον.");
};
const isOverall=(p:SafePublicResultPoint)=>Object.keys(p.segment).length===0;
const isSingleCounty=(p:SafePublicResultPoint,key:string)=>
  Object.keys(p.segment).length===1&&p.segment.prefectureCode===key;
/** Do not compare unlike questions, dissimilar units or reconstructed cross-tabs. */
export function buildCountyMetricComparisons(
  points:readonly SafePublicResultPoint[],prefectureCode:string
):CountyMetricComparison[]{
  if(!prefectureCode)return [];
  const nationwide=new Map(points.filter(isOverall).map(p=>[p.metricKey,p]));
  return points.filter(p=>isSingleCounty(p,prefectureCode)).flatMap(p=>{
    const national=nationwide.get(p.metricKey);
    if(!national||national.format!==p.format||!Number.isFinite(p.value)||!Number.isFinite(national.value)
      ||p.n<1||national.n<1)return [];
    return [{key:p.metricKey,county:p,national,difference:p.value-national.value}];
  });
}
function scaleBar(p:SafePublicResultPoint,reference:SafePublicResultPoint){
  const upper=p.format==="proportion"?1:Math.max(p.value,reference.value,1);
  return Math.min(100,Math.max(0,p.value/upper*100));
}

export function ResearchCountyReport({
  points,coverage,countyAvailability=[],mode
}:{
  points:readonly SafePublicResultPoint[];
  coverage?:InternalResearchGeographicCoverage;
  countyAvailability?:readonly SafeCountyAvailability[];
  mode:"preview"|"live"|"published"|"unpublished";
}){
  const [county,setCounty]=useState("");
  const [chapterFilter,setChapterFilter]=useState("all");
  const [onlyComparisons,setOnlyComparisons]=useState(false);
  const countyName=GREECE_PREFECTURES.find(x=>x.key===county)?.label??"";
  const countyBand=countyAvailability.find(item=>item.key===county)?.band;
  const countyBandLabel=countyBand==="under5"?"1–4":countyBand==="5to9"?"5–9":countyBand==="10to29"?"10–29":countyBand==="30plus"?"30+":null;
  const entries=useMemo(()=>buildCountyMetricComparisons(points,county),[points,county]);
  const byKey=useMemo(()=>new Map(entries.map(r=>[r.key,r])),[entries]);
  const counts=coverage?.prefectures.find(x=>x.key===county);
  const availableCountyMetrics=points.filter(p=>isSingleCounty(p,county)).length;
  const nationalMetrics=points.filter(isOverall).length;
  const sections=useMemo(()=>PUBLIC_RESULTS_CHAPTERS.map(ch=>{
    const keys=[...new Set(ch.subchapters.flatMap(s=>s.metrics))];
    return {chapter:ch,rows:keys.flatMap(key=>byKey.has(key)?[byKey.get(key)!]:[])};
  }),[byKey]);
  const comparedSections=sections.filter(s=>s.rows.length>0);
  const totalCompared=comparedSections.reduce((sum,s)=>sum+s.rows.length,0);
  const supported=entries.filter(r=>r.county.n>=30);
  const highlighted=supported.filter(r=>r.county.format==="proportion")
    .sort((a,b)=>Math.abs(b.difference)-Math.abs(a.difference)).slice(0,3);
  const countyTotal=counts?.eligibleN??null;
  const nationalTotal=coverage?.includedTotal??null;
  const isLive=mode==="live";
  const chooseCounty=(key:string)=>{setCounty(key);setChapterFilter("all");setOnlyComparisons(false);};
  return <section className={styles.countyReport} aria-label="Επιστημονική αναφορά ανά νομό">
    <header className={styles.countyReportHeader}>
      <span className={styles.eyebrow}>KONTA MOY RESEARCH · ΑΝΑΛΥΣΗ 55 ΝΟΜΩΝ</span>
      <h3>Νομός</h3>
      <p>Ενιαία επισκόπηση των έξι ερευνητικών ενοτήτων για κάθε νομό,
        σε αντιπαραβολή με τις απαντήσεις στο σύνολο της Ελλάδας.
        Κάθε σύγκριση χρησιμοποιεί <strong>τον ίδιο δείκτη, την ίδια κλίμακα και το πραγματικό n</strong>.</p>
    </header>
    <div className={styles.countyPicker}>
      <label htmlFor="results-county-select">Επιλέξτε νομό
        <select id="results-county-select" value={county} onChange={e=>chooseCounty(e.target.value)}>
          <option value="">— Επιλέξτε έναν από τους 55 νομούς —</option>
          {GREECE_PREFECTURES.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </label>
      <p>Οι ταχυδρομικοί κώδικες χρησιμοποιούνται μόνο εσωτερικά για την αντιστοίχιση και δεν εμφανίζονται στην αναφορά.</p>
    </div>
    {!county?<div className={styles.countyEmpty}>
      <strong>55 νομοί · μία κοινή μεθοδολογία</strong>
      <p>Επιλέξτε νομό για να δημιουργηθεί αυτόματα η ερευνητική σύνοψη, οι διαφορές από το σύνολο Ελλάδας,
      οι αναλυτικοί πίνακες ανά κεφάλαιο και η επιστημονική αξιολόγηση των περιορισμών.</p>
    </div>:<>
      <div className={styles.countyOverview}>
        <div>
          <span>ΕΠΙΛΕΓΜΕΝΟΣ ΝΟΜΟΣ</span><strong>{countyName}</strong>
          <small>{isLive?"Ζωντανή εσωτερική ανάλυση · προκαταρκτικά στοιχεία":
            mode==="published"?"Εγκεκριμένα δημοσιευμένα στοιχεία":"Προεπισκόπηση διαθεσιμότητας"}</small>
        </div>
        <div><span>ΑΠΑΝΤΗΣΕΙΣ ΝΟΜΟΥ</span><strong>{countyTotal===null?"—":count(countyTotal)}</strong>
          <small>{countyTotal===null?(countyBandLabel?`Ερευνητική βάση ${countyBandLabel} · χωρίς ατομικά αποτελέσματα`:"Δεν διατίθεται δημόσιος αριθμός ολοκληρώσεων"):"Ολοκληρωμένες υποβολές"}</small></div>
        <div><span>ΣΥΝΟΛΟ ΕΛΛΑΔΑΣ</span><strong>{nationalTotal===null?"—":count(nationalTotal)}</strong>
          <small>{nationalTotal===null?"Διαφέρει ανά ερώτηση":"Ολοκληρωμένες υποβολές"}</small></div>
        <div><span>ΔΙΑΘΕΣΙΜΟΙ ΣΥΓΚΡΙΣΙΜΟΙ ΔΕΙΚΤΕΣ</span><strong>{count(totalCompared)}</strong>
          <small>{availableCountyMetrics} συνολικά διαθέσιμοι στον νομό · {nationalMetrics} στην Ελλάδα</small></div>
      </div>
      <section className={styles.countyScientificSummary} aria-label="Επιστημονική σύνοψη">
        <div className={styles.countySummaryHead}>
          <span className={styles.eyebrow}>ΣΥΝΟΠΤΙΚΗ ΕΠΙΣΤΗΜΟΝΙΚΗ ΑΠΟΤΙΜΗΣΗ</span>
          <h4>Τι δείχνουν οι απαντήσεις του νομού {countyName};</h4>
        </div>
        {countyBand === "under5" && <p className={styles.countyCaution}>Ο νομός περιλαμβάνεται δημόσια με τεκμηριωμένη πολύ μικρή ερευνητική βάση 1–4. Δεν δημοσιοποιούνται οι κατασταλμένες τιμές απαντήσεων, ώστε να αποφεύγεται η ταυτοποίηση των συμμετεχόντων.</p>}
        {totalCompared===0?<p>Δεν υπάρχουν αυτή τη στιγμή κοινά διαθέσιμοι, εγκεκριμένοι για εμφάνιση δείκτες
          αυτού του νομού και της Ελλάδας. Η έλλειψη δημοσιεύσιμου συγκριτικού αριθμού δεν σημαίνει μηδενικές απαντήσεις
          ούτε απουσία οικονομικών προβλημάτων.</p>:<>
          <p>Υπάρχουν <strong>{count(totalCompared)} συγκρίσιμοι δείκτες</strong> από
            <strong> {comparedSections.length} από τα 6 κεφάλαια</strong>. Οι τιμές
            αφορούν αποκλειστικά τους συμμετέχοντες που απάντησαν στην εκάστοτε ερώτηση.
            Οι διαφορές μεταξύ νομού και Ελλάδας είναι <strong>περιγραφικές</strong> και όχι από μόνες τους
            απόδειξη στατιστικής σημαντικότητας ή αιτιώδους σχέσης.</p>
          {highlighted.length>0&&<div className={styles.countyFindings}>
            <h5>Ενδεικτικές αποκλίσεις σε ποσοστιαίους δείκτες</h5>
            <p>Παρακάτω παρουσιάζονται οι μεγαλύτερες απόλυτες διαφορές μεταξύ διαθέσιμων ποσοστιαίων δεικτών
              με βάση τουλάχιστον 30 απαντήσεις ανά νομό. Η σειρά είναι περιγραφική, όχι κατάταξη επιστημονικής σημαντικότητας.</p>
            {highlighted.map(r=><div key={r.key}>
              <strong>{publicMetricLabel(r.key)}</strong>
              <span>{showValue(r.county)} νομός · {showValue(r.national)} Ελλάδα · <b>{diffValue(r)}</b></span>
              <small>n={count(r.county.n)} στον νομό · n={count(r.national.n)} στην Ελλάδα</small>
            </div>)}
          </div>}
          {supported.length===0&&<p className={styles.countyCaution}>
            Η βάση των διαθέσιμων συγκρίσεων είναι περιορισμένη (n κάτω από 30).
            Η καταγραφή τους είναι χρήσιμη για διαφάνεια, αλλά δεν δικαιολογεί ασφαλή συμπεράσματα
            για το σύνολο των επιχειρήσεων του νομού.</p>}
        </>}
      </section>
      <div className={styles.countyReportControls}>
        <label>Ερευνητική ενότητα
          <select value={chapterFilter} onChange={e=>setChapterFilter(e.target.value)}>
            <option value="all">Όλα τα κεφάλαια (6)</option>
            {PUBLIC_RESULTS_CHAPTERS.map(ch=><option key={ch.id} value={ch.id}>{ch.number} · {ch.name}</option>)}
          </select>
        </label>
        <label className={styles.countyCheck}>
          <input type="checkbox" checked={onlyComparisons} onChange={e=>setOnlyComparisons(e.target.checked)}/>
          Μόνο κεφάλαια με συγκρίσιμες τιμές
        </label>
      </div>
      <div className={styles.countyChapters}>
        {sections.filter(s=>(chapterFilter==="all"||s.chapter.id===chapterFilter)
          &&(!onlyComparisons||s.rows.length>0)).map(({chapter,rows})=><article key={chapter.id} className={styles.countyChapter}>
          <div className={styles.countyChapterHeader}>
            <span>{chapter.number}</span>
            <div><h4>{chapter.name}</h4><p>{chapter.subtitle}</p></div>
            <small>{rows.length} κοινά διαθέσιμοι δείκτες</small>
          </div>
          {!rows.length?<p className={styles.countyNoMetrics}>Δεν υπάρχει εγκεκριμένη συγκριτική τιμή στο συγκεκριμένο κεφάλαιο.
            Οι μη διαθέσιμες τιμές δεν συμπληρώνονται με τεχνητές εκτιμήσεις.</p>:
          <div className={styles.tableScroll}><table className={styles.countyTable}>
            <thead><tr><th scope="col">Δείκτης</th><th scope="col">{countyName}</th>
              <th scope="col">Σύνολο Ελλάδας</th><th scope="col">Διαφορά</th><th scope="col">Πλήθος απαντήσεων</th></tr></thead>
            <tbody>{rows.map(r=><tr key={r.key}>
              <th scope="row">{publicMetricLabel(r.key)}
                {r.county.format==="proportion"&&<div className={styles.countyPairedBars} aria-hidden="true">
                  <i style={{width:scaleBar(r.county,r.national)+"%"}}/><b style={{width:scaleBar(r.national,r.county)+"%"}}/>
                </div>}
              </th>
              <td>{showValue(r.county)}</td><td>{showValue(r.national)}</td>
              <td><span className={r.difference===0?styles.countyNeutral:styles.countyDelta}>{diffValue(r)}</span></td>
              <td><small>Νομός: {count(r.county.n)}</small><small>Ελλάδα: {count(r.national.n)}</small></td>
            </tr>)}</tbody>
          </table></div>}
          <p className={styles.countyChapterInterpretation}><strong>Ερμηνευτικό πλαίσιο:</strong> {chapter.subchapters
            .filter(s=>s.metrics.some(key=>byKey.has(key))).map(s=>s.interpretation)
            .filter((value,index,all)=>all.indexOf(value)===index).join(" ")||
            "Δεν υπάρχουν επαρκή δημοσιεύσιμα δεδομένα για τεκμηριωμένη εξειδικευμένη ερμηνεία."}</p>
        </article>)}
      </div>
      <section className={styles.countyMethodology} aria-label="Μεθοδολογία και περιορισμοί">
        <h4>Επιστημονική μεθοδολογία και όρια συμπερασμάτων</h4>
        <ol>
          <li><strong>Κοινή βάση:</strong> κάθε μέτρηση συγκρίνεται με τον ακριβώς ίδιο δείκτη στο σύνολο Ελλάδας.
            Οι παρονομαστές διαφέρουν ανά ερώτηση λόγω μη απόκρισης ή συνθηκών επιλεξιμότητας.</li>
          <li><strong>Μερική επικάλυψη:</strong> το σύνολο Ελλάδας περιλαμβάνει και τον επιλεγμένο νομό.
            Οι εμφανιζόμενες αποκλίσεις είναι περιγραφικές, όχι σύγκριση δύο ανεξάρτητων δειγμάτων.</li>
          <li><strong>Περιορισμένο πλήθος:</strong> μικρά n οδηγούν σε μεγάλη αβεβαιότητα και αστάθεια.
            Δεν υπολογίζονται αυθαίρετες τιμές p, διαστήματα εμπιστοσύνης ή αξιολογήσεις σημαντικότητας.
            Τα μη διαθέσιμα/μη εγκεκριμένα αποτελέσματα δεν συμπληρώνονται με εικασίες.</li>
          <li><strong>Γεωγραφία:</strong> αντιστοίχιση σε έναν από τους 55 νομούς με πλήρη ταχυδρομικό κώδικα, όπου υπάρχει, ή με τεκμηριωμένη προέλευση νομού από το επιχειρηματικό μητρώο,
            χωρίς δημοσίευση ταχυδρομικού κώδικα ή ατομικής απάντησης.</li>
          <li><strong>Πεδίο γενίκευσης:</strong> οι τιμές περιγράφουν τις επιχειρήσεις που απάντησαν.
            Δεν επιτρέπεται συμπέρασμα για όλες τις επιχειρήσεις της Ελλάδας ή του νομού
            χωρίς τεκμηρίωση στάθμισης και αντιπροσωπευτικότητας.</li>
        </ol>
        <p>{isLive?"Προκαταρκτικά, μη σταθμισμένα δεδομένα τρέχουσας έρευνας. Περιλαμβάνονται και ολοκληρωμένες συμμετοχές υπό ποιοτικό έλεγχο. Δεν είναι οριστική επιστημονική δημοσίευση.":mode==="published"?"Στοιχεία μόνο από τις συγκεντρωτικές τιμές που έχουν εγκριθεί για δημοσίευση.":"Χωρίς δημοσιεύσιμα συγκεντρωτικά δεδομένα δεν παράγονται πραγματικά πορίσματα."}</p>
      </section>
    </>}
  </section>;
}
