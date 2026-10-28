"use client";
import {useState} from "react";
import {useFormStatus} from "react-dom";
import {castMaziFundBallot} from "../../actions";
type Candidate={
 id:string;title:string;details:string;category:string;amount_cents:number;
 first_time_support_request:boolean
};
const money=(v:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(v/100);
const categories:Record<string,string>={growth:"Ανάπτυξη",resilience:"Ανθεκτικότητα",joint:"Κοινή δράση"};
function Submit({available}:{available:boolean}){
 const {pending}=useFormStatus();
 return <button type="submit" disabled={!available||pending}
  style={{padding:"18px 28px",background:available?"#153d30":"#9fa99c",
   color:"#fff",border:0,cursor:available&&!pending?"pointer":"not-allowed",
   fontWeight:800,fontSize:15,borderRadius:4,minHeight:55}}>
  {pending?"Καταχώριση και επαλήθευση…":"Καταχώριση οριστικού ψηφοδελτίου"}
 </button>;
}
export default function FundVoteForm({
 proposals,enabled
}:{proposals:Candidate[];enabled:boolean}){
 const [selected,setSelected]=useState<string[]>([]);
 const [confirmed,setConfirmed]=useState(false);
 const chosen=proposals.filter(p=>selected.includes(p.id));
 const update=(id:string,checked:boolean)=>{
  setConfirmed(false);
  setSelected(current=>checked?
   current.includes(id)||current.length>=20?current:[...current,id]:
   current.filter(x=>x!==id));
 };
 return <form action={castMaziFundBallot} style={{display:"grid",gap:13}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
   flexWrap:"wrap",gap:14,padding:"17px 22px",background:"#e9eee6",borderRadius:5}}>
   <strong>Επιλεγμένα έργα: {selected.length} / 20</strong>
   <span style={{fontSize:13}}>Ένα ψηφοδέλτιο ανά ΓΕΜΗ · μία και μόνο οριστική καταχώριση</span>
  </div>
  {proposals.map(p=>{
   const checked=selected.includes(p.id);
   const disabled=!enabled||(!checked&&selected.length>=20);
   return <label key={p.id} style={{display:"flex",alignItems:"start",gap:17,
    background:checked?"#e8f0e4":"#fff",padding:"clamp(20px,3vw,27px)",
    border:checked?"2px solid #30744b":"1px solid #d5ded3",borderRadius:6,
    opacity:enabled?1:.72,cursor:disabled?"default":"pointer"}}>
    <input type="checkbox" name="proposal_id" value={p.id} checked={checked}
     disabled={disabled} onChange={e=>update(p.id,e.target.checked)}
     style={{width:24,height:24,flexShrink:0,marginTop:3,accentColor:"#236744"}}/>
    <span style={{flex:1}}>
     <span style={{fontSize:11,color:"#637e67",letterSpacing:".08em",fontWeight:750}}>
      {p.first_time_support_request?"ΠΡΩΤΗ ΑΙΤΗΣΗ":"ΕΠΑΝΑΛΗΠΤΙΚΗ"} · {categories[p.category]||p.category}
     </span>
     <strong style={{display:"block",fontSize:22,margin:"9px 0 12px"}}>{p.title}</strong>
     <span style={{fontSize:14,lineHeight:1.75,display:"block",whiteSpace:"pre-wrap"}}>{p.details}</span>
     <span style={{fontWeight:750,display:"block",marginTop:16,fontSize:16}}>
      Αιτούμενο: {money(p.amount_cents)}
     </span>
    </span>
   </label>;
  })}
  {enabled?<section style={{background:"#173e30",color:"#fff",padding:"clamp(22px,4vw,35px)",marginTop:15,borderRadius:6}}>
   <span style={{fontSize:12,letterSpacing:".13em",color:"#c4d9c9"}}>02 / ΠΡΙΝ ΑΠΟ ΤΗΝ ΟΡΙΣΤΙΚΗ ΨΗΦΟ</span>
   <h3 style={{fontSize:25,letterSpacing:"-.025em",margin:"15px 0 10px"}}>
    Επιβεβαίωση επιλογών</h3>
   {selected.length===0?<p style={{lineHeight:1.7}}>Επίλεξε τουλάχιστον μία πρόταση παραπάνω για να συνεχίσεις.</p>:
    <div style={{background:"#25533e",padding:18,borderRadius:4}}>
     <p style={{marginTop:0}}>Υποστηρίζεις {selected.length} {selected.length===1?"έργο":"έργα"}:</p>
     <ul style={{margin:"0 0 0 18px",padding:0,lineHeight:1.85}}>
      {chosen.map(p=><li key={p.id}>{p.title}</li>)}
     </ul>
    </div>}
   <label style={{display:"flex",alignItems:"start",gap:13,margin:"22px 0",cursor:"pointer"}}>
    <input type="checkbox" checked={confirmed} disabled={!selected.length}
     onChange={e=>setConfirmed(e.target.checked)}
     style={{marginTop:4,width:20,height:20,accentColor:"#b9d2b8",flexShrink:0}}/>
    <span style={{fontSize:14,lineHeight:1.75}}>Επιβεβαιώνω ότι εξέτασα τις επιλογές μου και γνωρίζω
     ότι το ψηφοδέλτιο είναι <strong>οριστικό και δεν τροποποιείται</strong> μετά την υποβολή.
     Η στήριξη έργων δεν αποτελεί εγγύηση χρηματοδότησης.</span>
   </label>
   <Submit available={selected.length>0&&confirmed}/>
   <p style={{fontSize:12,color:"#c9dccd",lineHeight:1.7,marginBottom:0}}>
    Η τελική επιλεξιμότητα ελέγχεται εκ νέου από την υπηρεσία και τη βάση δεδομένων.
    Ενδεχόμενη σύγκρουση συμφερόντων ή λήξη δικαιώματος ψήφου απορρίπτει την υποβολή.
   </p>
  </section>:<p style={{background:"#fff",padding:21,fontSize:14,lineHeight:1.75}}>
   Οι προτάσεις εμφανίζονται μόνο για ενημέρωση. Το ψηφοδέλτιο δεν υποβάλλεται
   εκτός της επαληθευμένης περιόδου ή χωρίς δικαίωμα ψήφου.
  </p>}
 </form>;
}
