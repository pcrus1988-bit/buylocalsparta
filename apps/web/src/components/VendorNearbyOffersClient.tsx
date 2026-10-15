"use client";
import {useEffect,useState} from "react";
type Location={id:string;name:string;locality:string;eligible:boolean};
type Campaign={id:string;location_id:string;title:string;description:string;redemption_code:string|null;radius_m:number;starts_at:string;ends_at:string;status:string};
type Snapshot={locations:Location[];offers:Campaign[]};
export function VendorNearbyOffersClient(){
  const [data,setData]=useState<Snapshot>({locations:[],offers:[]});
  const [csrf,setCsrf]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [locationId,setLocationId]=useState("");
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [code,setCode]=useState("");
  const [radius,setRadius]=useState("200");
  const [from,setFrom]=useState("");
  const [until,setUntil]=useState("");
  async function refresh(){
    const result=await fetch("/api/vendor/nearby-offers",{cache:"no-store"});
    const json=await result.json() as Snapshot&{error?:string};
    if(!result.ok)throw new Error(json.error??"Αποτυχία φόρτωσης");
    setData(json);
    if(!locationId)setLocationId(json.locations.find(l=>l.eligible)?.id??"");
  }
  useEffect(()=>{
    let active=true;
    Promise.all([fetch("/api/vendor/auth-context",{cache:"no-store"}),fetch("/api/vendor/nearby-offers",{cache:"no-store"})])
      .then(async ([a,b])=>{
        if(!a.ok||!b.ok)throw new Error("Δεν έχεις πρόσβαση στη διαχείριση προσφορών.");
        const identity=await a.json() as {csrfToken?:string};
        const snapshot=await b.json() as Snapshot;
        if(!active)return;
        setCsrf(identity.csrfToken??"");setData(snapshot);
        setLocationId(snapshot.locations.find(l=>l.eligible)?.id??"");
      }).catch(error=>{if(active)setMessage(String(error));})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);
  async function create(event:React.FormEvent){
    event.preventDefault();
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/vendor/nearby-offers",{
        method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrf},
        body:JSON.stringify({locationId,title,description,redemptionCode:code,radiusM:Number(radius),
          startsAt:new Date(from).toISOString(),endsAt:new Date(until).toISOString()})
      });
      const payload=await response.json() as {error?:string};
      if(!response.ok)throw new Error(payload.error??"Αποτυχία δημιουργίας");
      await refresh();setTitle("");setDescription("");setCode("");
      setMessage("Το προσχέδιο δημιουργήθηκε. Ενεργοποίησέ το όταν είσαι έτοιμος.");
    }catch(error){setMessage(error instanceof Error?error.message:"Αποτυχία δημιουργίας");}
    finally{setBusy(false);}
  }
  async function changeStatus(id:string,status:"draft"|"active"|"paused"){
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/vendor/nearby-offers",{
        method:"PATCH",headers:{"content-type":"application/json","x-csrf-token":csrf},
        body:JSON.stringify({id,status})
      });
      const payload=await response.json() as {error?:string};
      if(!response.ok)throw new Error(payload.error??"Αποτυχία ενημέρωσης");
      await refresh();setMessage(status==="active"?"Η προσφορά ενεργοποιήθηκε.":"Η προσφορά απενεργοποιήθηκε.");
    }catch(error){setMessage(error instanceof Error?error.message:"Αποτυχία ενημέρωσης");}
    finally{setBusy(false);}
  }
  if(loading)return <p role="status">Φόρτωση κοντινών προσφορών…</p>;
  return <div className="shell" style={{paddingBottom:60}}>
    <h1>Αποκλειστικές προσφορές κοντά στο κατάστημά σου</h1>
    <p>Οι πελάτες που επιλέγουν τοπικές προσφορές ενημερώνονται μόνο όταν βρίσκονται κοντά στο επιβεβαιωμένο φυσικό κατάστημα. Δεν βλέπεις ποτέ τη θέση τους.</p>
    <section className="customer-account-panel" style={{marginTop:24}}>
      <h2>Νέα κοντινή προσφορά</h2>
      <p>Η ενεργοποίηση απαιτεί ενεργό και επιβεβαιωμένο σημείο πώλησης. Οι προσφορές έχουν διάρκεια έως 30 ημέρες και ακτίνα 100–500 μέτρα.</p>
      <form onSubmit={e=>void create(e)} style={{display:"grid",gap:12,maxWidth:560}}>
        <label>Κατάστημα
          <select required value={locationId} onChange={e=>setLocationId(e.target.value)}>
            <option value="">Επιλογή τοποθεσίας</option>
            {data.locations.map(l=><option key={l.id} value={l.id} disabled={!l.eligible}>{l.name} · {l.locality}{l.eligible?"":" (χρειάζεται επαλήθευση)"}</option>)}
          </select>
        </label>
        <label>Τίτλος προσφοράς<input required minLength={6} maxLength={110} value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label>Τι προσφέρεις επιπλέον;<textarea required minLength={10} maxLength={500} rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <label>Κωδικός εξαργύρωσης στο ταμείο (προαιρετικά)<input value={code} maxLength={32} onChange={e=>setCode(e.target.value)}/></label>
        <label>Ακτίνα σε μέτρα<select value={radius} onChange={e=>setRadius(e.target.value)}>
          {[100,150,200,300,500].map(v=><option key={v} value={v}>{v} μ.</option>)}
        </select></label>
        <label>Έναρξη<input required type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label>
        <label>Λήξη<input required type="datetime-local" value={until} onChange={e=>setUntil(e.target.value)}/></label>
        <button className="button button-primary" type="submit" disabled={busy||!locationId||!csrf}>Αποθήκευση προσχεδίου</button>
      </form>
    </section>
    {message&&<p role="status" style={{marginTop:16}}>{message}</p>}
    <section style={{marginTop:28,display:"grid",gap:16}}>
      <h2>Οι προσφορές σου</h2>
      {data.offers.length===0&&<p>Δεν υπάρχουν ακόμη προσφορές.</p>}
      {data.offers.map(o=><article className="customer-account-panel" key={o.id}>
        <p className="eyebrow">{o.status==="active"?"Ενεργή":o.status==="paused"?"Σε παύση":"Προσχέδιο"} · {o.radius_m} μ.</p>
        <h3>{o.title}</h3><p>{o.description}</p>
        <small>{new Date(o.starts_at).toLocaleString("el-GR")} – {new Date(o.ends_at).toLocaleString("el-GR")}</small>
        <div style={{display:"flex",gap:12,marginTop:12}}>
          {o.status!=="active"&&<button type="button" className="button button-primary" disabled={busy} onClick={()=>void changeStatus(o.id,"active")}>Ενεργοποίηση</button>}
          {o.status==="active"&&<button type="button" className="button button-secondary" disabled={busy} onClick={()=>void changeStatus(o.id,"paused")}>Παύση</button>}
        </div>
      </article>)}
    </section>
  </div>;
}
