"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import type {CommunityChat,CommunitySnapshot} from "../../lib/community";
type ResponseData=({ok:true}&CommunitySnapshot)|{ok:false;error:string};
export default function ChatRoom({initialMessages,initialBusinesses,currentUserId}:{initialMessages:CommunityChat[];initialBusinesses:Record<string,string>;currentUserId:string}){
 const [messages,setMessages]=useState(initialMessages);
 const [businesses,setBusinesses]=useState(initialBusinesses);
 const [body,setBody]=useState("");
 const [status,setStatus]=useState("");
 const [pending,setPending]=useState(false);
 const scrollBox=useRef<HTMLDivElement|null>(null);
 async function refresh(){
  try{
   const res=await fetch("/api/community",{credentials:"same-origin",cache:"no-store"});
   if(!res.ok)throw new Error("unavailable");
   const data=await res.json() as ResponseData;
   if(!data.ok)throw new Error(data.error);
   setMessages(data.messages);setBusinesses(data.businesses);
   setStatus("");
  }catch{setStatus("Η σύνδεση διακόπηκε. Θα γίνει νέα προσπάθεια.");}
 }
 useEffect(()=>{const timer=window.setInterval(()=>{void refresh();},5000);return ()=>window.clearInterval(timer);},[]);
 useEffect(()=>{if(scrollBox.current)scrollBox.current.scrollTop=scrollBox.current.scrollHeight;},[messages.length]);
 async function send(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(pending||!body.trim())return;setPending(true);
  try{
   const res=await fetch("/api/community",{method:"POST",credentials:"same-origin",
    headers:{"content-type":"application/json"},body:JSON.stringify({body:body.trim()})});
   const data=await res.json() as {ok?:boolean;error?:string};
   if(!res.ok||!data.ok)throw new Error(data.error||"write_failed");
   setBody("");await refresh();
  }catch(err){setStatus(err instanceof Error&&err.message==="rate_limited"?"Τα μηνύματα αποστέλλονται ανά 3 δευτερόλεπτα.":"Δεν έγινε αποστολή. Δοκίμασε ξανά.");}
  finally{setPending(false);}
 }
 return <section className="com-chat"><div className="com-chat-head"><strong>Η κοινή αίθουσα</strong><span><i className="com-dot"/> Αυτόματη ενημέρωση κάθε 5″</span></div>
  <div className="com-chat-messages" ref={scrollBox} aria-live="polite" aria-relevant="additions text">
   {messages.length?messages.map(msg=><article key={msg.id} className={"com-chat-line"+(msg.member_user_id===currentUserId?" mine":"")}>
    <div className="com-meta"><strong>{msg.member_user_id===currentUserId?"Εσύ":businesses[msg.member_user_id]||"Επαληθευμένο μέλος"}</strong><time>{new Date(msg.created_at).toLocaleTimeString("el-GR",{hour:"2-digit",minute:"2-digit"})}</time></div><p>{msg.body}</p>
   </article>):<p className="com-empty">Δεν υπάρχουν ακόμη μηνύματα. Ξεκίνα εσύ τη συζήτηση.</p>}
  </div>
  <form onSubmit={send} className="com-chat-compose"><label htmlFor="chatMessage" className="com-sr">Μήνυμα</label><input id="chatMessage" value={body} maxLength={1000} onChange={e=>setBody(e.target.value)} placeholder="Γράψε ένα μήνυμα στην κοινότητα…" required/><button className="com-button" disabled={pending||!body.trim()}>{pending?"Αποστολή…":"Αποστολή ↗"}</button></form>
  {status?<p role="status" className="com-feedback">{status}</p>:null}
 </section>;
}
