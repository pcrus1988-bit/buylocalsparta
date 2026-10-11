"use client";
import { useState, type FormEvent } from "react";
type Result={id:string;type:string;excerpt:string;citation_url:string;authority:string|null;category:string|null};
type SearchReply={status?:string;results?:Result[];error?:string};
const care=[
 {name:"Εύθραυστα νύχια",tips:["Προτίμησε ήπια περιποίηση και περιόρισε το έντονο λιμάρισμα.","Προστάτευσε τα χέρια κατά την παρατεταμένη επαφή με νερό."]},
 {name:"Ξεφλούδισμα",tips:["Μην αφαιρείς επιστρώσεις τραβώντας τες με δύναμη.","Περιόρισε την καταπόνηση κατά την αφαίρεση προϊόντων."]},
 {name:"Ξηρά επωνύχια",tips:["Ενυδάτωνε απαλά την επιδερμίδα γύρω από τα νύχια.","Μην κόβεις ή τραβάς ερεθισμένο δέρμα."]},
 {name:"Αδύναμα νύχια",tips:["Κράτησε πρακτικό μήκος και απόφυγε μηχανική πίεση.","Δώσε προτεραιότητα στην ήπια αφαίρεση επιστρώσεων."]}
];
export default function Home(){
 const [tab,setTab]=useState<"search"|"care">("search");
 const [q,setQ]=useState("");const [data,setData]=useState<SearchReply>({});
 const [busy,setBusy]=useState(false);const [selected,setSelected]=useState(0);
 async function submit(e:FormEvent){e.preventDefault();if(!q.trim())return;setBusy(true);
 try{const r=await fetch("/api/search?q="+encodeURIComponent(q.trim()),{cache:"no-store"});
 const payload=await r.json() as SearchReply;
 setData(r.ok?payload:{error:r.status===429?"Πολλά αιτήματα. Δοκίμασε ξανά αργότερα.":"Η αναζήτηση δεν είναι διαθέσιμη.",results:[]});
 }catch{setData({error:"Αποτυχία σύνδεσης. Δοκίμασε ξανά.",results:[]});}finally{setBusy(false);}
 }
 return <main className="shell">
 <header className="header"><a className="logo" href="/">NYXI<span className="dot">.</span></a><span className="tag">NAIL INTELLIGENCE · BETA</span></header>
 <section className="hero"><div className="eyebrow">Γνώση με πηγές</div><h1>Τα νύχια σου.<br/><em>Η δική σου επιλογή.</em></h1><p>Εξερεύνησε πληροφορίες για συστατικά, προϊόντα και περιποίηση. Τα αποτελέσματα εμφανίζονται μόνο μετά από ανεξάρτητο έλεγχο τεκμηρίωσης.</p></section>
 <nav className="tabs" aria-label="Εργαλεία NYXI"><button type="button" className={tab==="search"?"active":""} onClick={()=>setTab("search")}>Αναζήτηση</button><button type="button" className={tab==="care"?"active":""} onClick={()=>setTab("care")}>Nail Problem Solver</button></nav>
 {tab==="search"?<section className="panel"><h2>Τι θέλεις να μάθεις;</h2><p className="muted">Η δημοσίευση τεκμηρίωσης προϋποθέτει ανεξάρτητη έγκριση.</p>
 <form className="searchform" onSubmit={submit}><label htmlFor="query" className="sr-only">Αναζήτηση</label><input id="query" value={q} maxLength={100} onChange={e=>setQ(e.target.value)} placeholder="π.χ. INCI, gel polish"/><button disabled={busy}>{busy?"Αναζήτηση…":"Αναζήτηση"}</button></form>
 <div className="results" aria-live="polite" aria-busy={busy}>
 {data.error&&<p className="notice warning">{data.error}</p>}
 {data.status==="no_approved_evidence"&&<p className="notice">Η βιβλιοθήκη βρίσκεται υπό έλεγχο. Δεν υπάρχουν ακόμη εγκεκριμένα στοιχεία προς δημοσίευση.</p>}
 {data.status==="no_matches"&&<p className="notice">Δεν βρέθηκαν εγκεκριμένα αποτελέσματα.</p>}
 {data.results?.map(x=><article className="result" key={x.id}><div className="resultmeta">{x.authority||"Πρωτογενής πηγή"}{x.category?" · "+x.category:""}</div><p>{x.excerpt}</p><a href={x.citation_url} target="_blank" rel="noopener noreferrer">Πηγή ↗</a></article>)}
 </div></section>:<section className="panel"><h2>Nail Problem Solver</h2><p className="muted">Γενικές προτάσεις ήπιας περιποίησης — όχι διάγνωση.</p>
 <div className="choices">{care.map((x,i)=><button type="button" key={x.name} className={selected===i?"chosen":""} onClick={()=>setSelected(i)}>{x.name}</button>)}</div>
 <div className="carecard"><h3>{care[selected].name}</h3><ul>{care[selected].tips.map(x=><li key={x}>{x}</li>)}</ul><p className="disclaimer">Αν υπάρχει πόνος, πρήξιμο, φλεγμονή ή επίμονη αλλαγή, απευθύνσου σε επαγγελματία υγείας. Δεν προτείνουμε θεραπεία ή συγκεκριμένο προϊόν χωρίς τεκμηρίωση.</p></div>
 </section>}
 <footer><span>NYXI · Ερευνητική έκδοση</span><span>Οι πληροφορίες δεν αντικαθιστούν επαγγελματική συμβουλή.</span></footer>
 </main>;
}
