"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RESEARCH_RELATIONSHIP_PRESETS } from "../lib/research-geographic-relations-core";
import type {
  RelationshipQuestion, RelationshipChoice, RelationshipFilters
} from "../lib/research-geographic-relations-runtime";

function urlFor(root:string,filters:RelationshipFilters,override:Record<string,string>={}) {
  const values={...filters,...override};
  const params=new URLSearchParams();
  for(const [k,v] of Object.entries(values))if(v)params.set(k,v);
  return root+"?"+params.toString();
}

export function ResearchRelationshipExplorer({ root, filters, questions, sectors, kads }: {
  root:string; filters:RelationshipFilters;
  questions:readonly RelationshipQuestion[]; sectors:readonly RelationshipChoice[];
  kads:readonly RelationshipChoice[];
}){
  const router=useRouter();
  const [pending, startTransition]=useTransition();
  const [sourceQ,setSourceQ]=useState(filters.a);
  const [targetQ,setTargetQ]=useState(filters.b);
  const source=questions.find(q=>q.code===sourceQ);
  const target=questions.find(q=>q.code===targetQ);
  const [sourceValue,setSourceValue]=useState(filters.preset==="custom"?filters.av:"");
  const [targetValue,setTargetValue]=useState(filters.preset==="custom"?filters.bv:"");

  const active=filters.preset;
  const [topic, setTopic]=useState("Όλα");
  const [topicSearch, setTopicSearch]=useState("");
  const topics=["Όλα", ...new Set(RESEARCH_RELATIONSHIP_PRESETS.map(p=>p.group))];
  const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const visiblePresets=RESEARCH_RELATIONSHIP_PRESETS.filter(p=>
    (topic==="Όλα"||p.group===topic)&&
    (!topicSearch.trim()||normalize(p.label+" "+p.insight+" "+p.aLabel+" "+p.bLabel)
      .includes(normalize(topicSearch.trim()))));
  const launch=(updates:Record<string,string>)=>startTransition(()=>router.push(urlFor(root,filters,updates)));
  const presetButton=(p:typeof RESEARCH_RELATIONSHIP_PRESETS[number])=><Link
    prefetch={false} href={urlFor(root,filters,{preset:p.id,region:"",a:"",av:"",b:"",bv:""})}
    key={p.id} aria-current={active===p.id?"page":undefined}
    className={"research-relation-chip"+(active===p.id?" is-active":"")}>
    <span>{p.label}</span>
    {active===p.id&&<span aria-hidden="true">✓</span>}
  </Link>;

  return <div className="research-relation-controls">
    <div className="research-relation-control-header">
      <div>
        <strong>1. Επιλέξτε τι θέλετε να συγκρίνετε</strong>
        <p>Έτοιμες συνδέσεις ερωτήσεων — επιλέξτε με ένα πάτημα.</p>
      </div>
      {pending&&<small role="status">Ενημέρωση χάρτη…</small>}
    </div>
    <label className="research-relation-topic-search">Αναζήτηση θέματος
      <input type="search" value={topicSearch} onChange={e=>setTopicSearch(e.target.value)}
        placeholder="π.χ. μικρές επιχειρήσεις, τοπικοί πελάτες" />
    </label>
    <div className="research-relation-topic-tabs" role="group" aria-label="Θεματικές κατηγορίες">
      {topics.map(group=><button key={group} type="button"
        aria-pressed={topic===group} className={topic===group?"is-active":""}
        onClick={()=>setTopic(group)}>{group}</button>)}
    </div>
    <div className="research-relation-presets">
      {visiblePresets.map(presetButton)}
      {!visiblePresets.length&&<div className="workspace-inline-note" role="status">
        Δεν βρέθηκε σχετικό θέμα. Αλλάξτε την αναζήτηση ή επιλέξτε «Όλα».
      </div>}
    </div>
    <details className="research-relation-more">
      <summary>Δημιουργήστε τον δικό σας συσχετισμό δύο ερωτήσεων</summary>
      <section aria-label="Προσαρμοσμένη σχέση ερωτήσεων" className="research-relation-custom">
        <h3>Συνδυάστε δύο ερωτήσεις</h3>
        <p>Εμφάνιση: από όσους πληρούν την πρώτη συνθήκη, τι ποσοστό δίνει τη δεύτερη απάντηση;</p>
        <form method="get" action={root}>
          <input type="hidden" name="preset" value="custom" />
          <input type="hidden" name="mode" value={filters.mode} />
          <input type="hidden" name="phase" value={filters.phase} />
          <input type="hidden" name="sector" value={filters.sector} />
          <input type="hidden" name="kad" value={filters.kad} />
          <input type="hidden" name="view" value={filters.view} />
          <input type="hidden" name="compare" value={filters.compare} />
          <div className="research-relation-filter-grid">
            <label>Ομάδα επιχειρήσεων · Α
              <select name="a" value={sourceQ} onChange={e=>{
                const next=e.target.value;
                setSourceQ(next);setSourceValue("");
                if(next===targetQ){setTargetQ(questions.find(q=>q.code!==next)?.code??"");setTargetValue("");}
              }}>
                {questions.map(q=><option key={q.code} value={q.code}>{q.code} · {q.label}</option>)}
              </select>
            </label>
            <label>Απάντηση για την ομάδα Α
              <select name="av" value={sourceValue} onChange={e=>setSourceValue(e.target.value)} required>
                <option value="">Επιλέξτε απάντηση</option>
                {source?.options.filter(o=>o.key!=="unknown").map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
            <label>Συγκρινόμενη ερώτηση · Β
              <select name="b" value={targetQ} onChange={e=>{setTargetQ(e.target.value);setTargetValue("");}}>
                {questions.filter(q=>q.code!==sourceQ).map(q=><option key={q.code} value={q.code}>{q.code} · {q.label}</option>)}
              </select>
            </label>
            <label>Απάντηση-αποτέλεσμα · Β
              <select name="bv" value={targetValue} onChange={e=>setTargetValue(e.target.value)} required>
                <option value="">Επιλέξτε απάντηση</option>
                {target?.options.filter(o=>o.key!=="unknown").map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
          </div>
          <div className="workspace-action-bar" style={{gap:10,flexWrap:"wrap"}}>
            <button type="button" className="button button-secondary" onClick={()=>{
              setSourceQ(targetQ);setTargetQ(sourceQ);
              setSourceValue(targetValue);setTargetValue(sourceValue);
            }}>⇄ Αντιστροφή Α ↔ Β</button>
            <button type="submit" className="button" disabled={!sourceValue||!targetValue||sourceQ===targetQ}>
              Δείτε τη συσχέτιση
            </button>
          </div>
          {sourceQ===targetQ&&<small role="status">Επιλέξτε δύο διαφορετικές ερωτήσεις.</small>}
        </form>
      </section>
    </details>
    <div className="research-relation-divider" aria-hidden="true" />
    <div className="research-relation-control-header">
      <div>
        <strong>2. Φιλτράρετε τα αποτελέσματα</strong>
        <p>Οι επιλογές ενημερώνουν τα ποσοστά και τον χάρτη.</p>
      </div>
    </div>
    <div className="research-relation-filter-grid">
      <fieldset className="research-relation-mode">
        <legend>Κατάσταση απαντήσεων</legend>
        <div className="research-relation-choice-row">
          <Link prefetch={false} href={urlFor(root,filters,{mode:"all",region:""})}
            aria-current={filters.mode==="all"?"page":undefined}
            className={filters.mode==="all"?"is-active":""}>Όλες οι απαντήσεις</Link>
          <Link prefetch={false} href={urlFor(root,filters,{mode:"draft",region:""})}
            aria-current={filters.mode==="draft"?"page":undefined}
            className={filters.mode==="draft"?"is-active":""}>Σε εξέλιξη</Link>
          <Link prefetch={false} href={urlFor(root,filters,{mode:"completed",region:""})}
            aria-current={filters.mode==="completed"?"page":undefined}
            className={filters.mode==="completed"?"is-active":""}>Οριστικές</Link>
        </div>
      </fieldset>
      <label>Κλάδος / ΚΑΔ
        <select value={filters.sector} onChange={e=>launch({sector:e.target.value,region:""})}>
          <option value="">Όλοι οι κλάδοι</option>
          {sectors.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
      <label>Ακριβής ΚΑΔ (ΓΕΜΗ)
        <select value={filters.kad} onChange={e=>launch({kad:e.target.value,region:""})}>
          <option value="">Όλοι οι ΚΑΔ</option>
          {kads.map(k=><option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </label>
      <label>Φάση
        <select value={filters.phase} onChange={e=>launch({phase:e.target.value,region:""})}>
          <option value="main">Κύρια έρευνα</option><option value="pilot">Πιλοτική</option>
        </select>
      </label>
    </div>
    <p className="research-relation-disclaimer">
      {filters.mode==="all"
        ? "Συμπεριλαμβάνονται όλες οι καταγεγραμμένες απαντήσεις από οριστικά και μη οριστικά ερωτηματολόγια. Καμία απάντηση δεν διαγράφεται ή αλλάζει κατάσταση."
        : filters.mode==="draft"
        ? "Μόνο καταγεγραμμένες απαντήσεις ερωτηματολογίων σε εξέλιξη· δεν λογίζονται ως επίσημες υποβολές."
        : "Μόνο οριστικά υποβληθείσες απαντήσεις. Τα ποσοστά είναι περιγραφικά και μη σταθμισμένα."}
    </p>
  </div>;
}
