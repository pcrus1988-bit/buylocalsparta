/**
 * Canonical MAZI Fund monthly calendar.
 * Informational calendar only: an active funded cycle, paid membership,
 * legal approval and actual eligible dates still control all submissions.
 */
const steps=[
 {title:"Αιτήσεις",range:"01–10",detail:"Υποβολή πραγματικών αναγκών και ελάχιστου χρήσιμου ποσού",start:1,end:10},
 {title:"Έλεγχος",range:"11–15",detail:"ΓΕΜΗ, νομιμότητα, δικαιολογητικά και αιτιολογημένη έγκριση",start:11,end:15},
 {title:"Ψηφοφορία",range:"16–23",detail:"Ένα ψηφοδέλτιο ανά επιλέξιμη επιχείρηση, πολλά έργα",start:16,end:23},
 {title:"Ενστάσεις",range:"24–27",detail:"Έλεγχος ψήφων, σύγκρουσης συμφερόντων και οριστικοποίηση",start:24,end:27},
 {title:"Συμφωνίες",range:"28–τέλος",detail:"Ατομική αποδοχή, επαλήθευση και νόμιμες πληρωμές",start:28,end:31}
] as const;
export default function FundCycleSteps({fundedCycleExists=false}:{fundedCycleExists?:boolean}){
 const today=Number(new Intl.DateTimeFormat("en-US",{day:"numeric",timeZone:"Europe/Athens"}).format(new Date()));
 return <section aria-label="Στάδια μηνιαίου χρηματοδοτικού κύκλου"
  style={{margin:"22px 0 35px"}}>
  <div style={{display:"flex",gap:18,alignItems:"end",justifyContent:"space-between",flexWrap:"wrap",marginBottom:21}}>
   <div><span style={{fontSize:11,letterSpacing:".15em",color:"#718a75",fontWeight:800}}>
    ΚΑΝΟΝΙΣΜΟΣ / ΜΗΝΙΑΙΟ ΗΜΕΡΟΛΟΓΙΟ</span>
    <h2 style={{fontSize:26,letterSpacing:"-.035em",margin:"9px 0 0"}}>Πέντε στάδια. Κοινές προθεσμίες.</h2></div>
   <span style={{fontSize:12,color:"#647e6d",maxWidth:280}}>
    Ώρα Ελλάδας · Ημερομηνίες σύμφωνα με τον ειδικό κανονισμό του Ταμείου.</span>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:9}}>
   {steps.map((step,index)=>{
    const current=fundedCycleExists&&today>=step.start&&today<=step.end;
    return <article key={step.title} style={{
     padding:"17px 18px 20px",background:current?"#1b4a35":"#fff",
     color:current?"#fff":"#173c2f",border:current?"1px solid #1b4a35":"1px solid #d3dfd2",
     borderTop:current?"4px solid #caa589":"4px solid #c6d7c7",borderRadius:4
    }}>
     <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",marginBottom:14}}>
      <span style={{fontSize:11,fontWeight:800,letterSpacing:".12em",opacity:.78}}>
       {String(index+1).padStart(2,"0")} / 05</span>
      <span style={{fontSize:11,fontWeight:800,background:current?"#d8e4d2":"#e7eee3",
       color:"#204833",padding:"5px 9px",borderRadius:3}}>{step.range}</span>
     </div>
     <strong style={{fontSize:18,display:"block",letterSpacing:"-.015em"}}>{step.title}</strong>
     <p style={{fontSize:12,lineHeight:1.7,margin:"12px 0 0",opacity:.89}}>{step.detail}</p>
     {current?<p style={{fontWeight:800,fontSize:11,letterSpacing:".1em",margin:"16px 0 0",color:"#eed3b5"}}>
      ΤΡΕΧΟΝ ΗΜΕΡΟΛΟΓΙΑΚΟ ΣΤΑΔΙΟ</p>:null}
    </article>;
   })}
  </div>
  <p style={{fontSize:12,lineHeight:1.7,color:"#617769",marginTop:16}}>
   Το ημερολόγιο δεν αποδεικνύει ότι ένας κύκλος έχει οικονομικά ενεργοποιηθεί.
   Η πραγματική κατάσταση μέλους, χρηματοδότησης και ψηφοφορίας ελέγχεται χωριστά.
  </p>
 </section>;
}
